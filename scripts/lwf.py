#!/usr/bin/env python3
"""Small, standard-library-only LaTeX project and build helper (Python 3.9+)."""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

FRAMEWORK = Path(__file__).resolve().parent.parent
ENGINES = {"lualatex": "-pdflua", "xelatex": "-pdfxe", "pdflatex": "-pdf"}
DEFAULT_ENGINE = "pdflatex"
CONFIG_KEYS = {"name", "type", "language", "engine", "source"}


class ProjectError(Exception):
    pass


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(content)


def valid_name(value: str) -> bool:
    """Portable basename, including Unicode, without Windows device names."""
    return bool(value) and not (
        value in {".", ".."}
        or value != value.strip()
        or value.endswith(".")
        or re.search(r'[<>:"/\\|?*\x00-\x1f\x7f]', value)
        or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)", value, re.I)
    )


def git_command(args: list[str], directory: Path) -> subprocess.CompletedProcess:
    # Do not let a caller's GIT_DIR or GIT_WORK_TREE redirect initialization.
    env = {k: v for k, v in os.environ.items() if k not in {
        "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"}}
    return subprocess.run(["git", "-C", str(directory), *args], capture_output=True,
                          text=True, encoding="utf-8", errors="replace", env=env)


def containing_repository(directory: Path) -> str | None:
    parent = directory
    while not parent.exists():
        parent = parent.parent
    # Also recognize worktrees and repos without relying on Git's discovery rules.
    for ancestor in (parent, *parent.parents):
        if (ancestor / ".git").exists():
            return str(ancestor)
        if (ancestor / "HEAD").is_file() and (ancestor / "objects").is_dir() and (ancestor / "refs").is_dir():
            return str(ancestor)
    probe = git_command(["rev-parse", "--show-toplevel"], parent)
    if probe.returncode == 0:
        return probe.stdout.strip()
    bare = git_command(["rev-parse", "--is-bare-repository"], parent)
    if bare.returncode == 0 and bare.stdout.strip() == "true":
        return str(parent)
    return None


def initialize_git(root: Path) -> None:
    if not shutil.which("git"):
        raise ProjectError("Git is missing from PATH. Use the Dev Container or install Git; creation can also use --no-git.")
    existing = containing_repository(root)
    if existing:
        if Path(existing).resolve() == root and (root / ".git").exists():
            print(f"Git repository already initialized: {root}")
            return
        raise ProjectError(f"Already inside repository {existing}. Choose a folder outside it or use --no-git during creation.")
    result = git_command(["-c", "init.defaultBranch=main", "init"], root)
    if result.returncode:
        raise ProjectError(f"Git initialization failed: {result.stderr.strip()}")
    print("Initialized Git on branch main. Files are ready to stage and commit; no commit was made.")


def init_git_command(args: argparse.Namespace) -> int:
    root = Path(args.directory).expanduser().resolve()
    if args.no_init and not args.trust_workspace:
        raise ProjectError("--no-init is only used with --trust-workspace for container setup.")
    if args.trust_workspace and not Path("/.dockerenv").exists():
        raise ProjectError("--trust-workspace is only intended for Docker container setup.")
    if args.no_init:
        if not shutil.which("git"):
            raise ProjectError("Git is missing from the container.")
        existing = containing_repository(root)
        if not existing:
            print("Git initialization was disabled; no existing repository to configure.")
            return 0
        root = Path(existing).resolve()
    else:
        initialize_git(root)
    if args.trust_workspace:
        # Docker bind mounts may retain the host UID. Trust only this workspace
        # in the container user's config; never trust all repositories via '*'.
        trusted = git_command(["config", "--global", "--get-all", "safe.directory"], root)
        if str(root) not in trusted.stdout.splitlines():
            result = git_command(["config", "--global", "--add", "safe.directory", str(root)], root)
            if result.returncode:
                raise ProjectError(f"Could not enable Git for this mounted workspace: {result.stderr.strip()}")
        print(f"Git trusts the mounted workspace in this container: {root}")
    return 0


def render(text: str, values: dict[str, str]) -> str:
    def substitute(match: re.Match) -> str:
        key = match.group(1)
        if key not in values:
            raise ProjectError(f"Missing template value: {key}")
        return values[key]
    return re.sub(r"\{\{ ([a-z_]+) \}\}", substitute, text)


def create(args: argparse.Namespace) -> int:
    templates = FRAMEWORK / "templates"
    if not (templates / "locales").is_dir():
        raise ProjectError("Creating projects requires the framework checkout. This project's copied helper can build and initialize Git independently.")
    locales = sorted(p.stem for p in (templates / "locales").glob("*.json"))
    kind = args.kind or input("Project type (paper/notes) [paper]: ").strip() or "paper"
    name = args.name if args.name is not None else input("Project name: ").strip()
    language = args.language or input(f"Language ({'/'.join(locales)}) [en]: ").strip() or "en"
    if kind not in {"paper", "notes"}:
        raise ProjectError("Choose paper or notes.")
    if not valid_name(name):
        raise ProjectError("Invalid project name: use a portable folder name without separators, reserved characters/device names, controls, or trailing dots/spaces.")
    if language not in locales:
        raise ProjectError(f"Unsupported language {language!r}. Available: {', '.join(locales)}.")
    target = Path(args.output).expanduser() if args.output else Path.cwd() / name
    if target.exists() or target.is_symlink():
        raise ProjectError(f"Destination already exists; nothing overwritten: {target}")
    if not valid_name(target.name):
        raise ProjectError("The destination folder name is not portable across Windows, macOS, and Linux.")
    target = target.resolve()
    if args.git:
        if not shutil.which("git"):
            raise ProjectError("Git is missing from PATH. Use the Dev Container, install Git, or explicitly choose --no-git.")
        existing = containing_repository(target.parent)
        if existing:
            raise ProjectError(f"Destination is inside repository {existing}. Use a sibling --output path or --no-git. Nothing created.")
    source = f"{kind}.tex"
    values = json.loads((templates / "locales" / f"{language}.json").read_text(encoding="utf-8"))
    values.update(name=name, kind=kind, language=language, source=source, title=values[f"{kind}_title"])
    # Render before touching the destination, so invalid templates leave no project.
    files: dict[Path, str] = {}
    for subtree in (templates / "common", templates / kind):
        for item in sorted(subtree.rglob("*")):
            if item.is_file():
                files[item.relative_to(subtree)] = render(item.read_text(encoding="utf-8"), values)
    for required in (source, "README.md", ".gitignore", "references.bib",
                     ".devcontainer/devcontainer.json", ".devcontainer/Dockerfile",
                     ".vscode/settings.json", ".vscode/extensions.json", ".vscode/tasks.json"):
        if Path(required) not in files:
            raise ProjectError(f"Framework template asset missing: {required}. Nothing created.")
    if not args.git:
        # Preserve the user's choice when this folder is opened in a container.
        container_path = Path(".devcontainer/devcontainer.json")
        container = json.loads(files[container_path])
        container["postCreateCommand"].append("--no-init")
        files[container_path] = json.dumps(container, indent=2) + "\n"
    settings = {"name": name, "type": kind, "language": language, "engine": args.engine, "source": source}
    files[Path("project.yml")] = "# Flat YAML scalars; engine and source control the build.\n" + "".join(
        f"{key}: {json.dumps(value, ensure_ascii=False)}\n" for key, value in settings.items())
    files[Path("scripts/lwf.py")] = Path(__file__).read_text(encoding="utf-8")
    files[Path("LICENSE")] = (FRAMEWORK / "LICENSE").read_text(encoding="utf-8")
    target.mkdir(parents=True, exist_ok=False)
    try:
        for relative, content in files.items():
            write_text(target / relative, content)
        if args.git:
            initialize_git(target)
    except (OSError, ProjectError):
        # Only this freshly created directory can be removed here.
        shutil.rmtree(target)
        raise
    print(f"Created {language} {kind}: {target}")
    print(f"Open that folder in VS Code → Dev Containers: Reopen in Container → open {source}.")
    print("Run LaTeX Workshop: Build LaTeX project, then View LaTeX PDF file for the right-hand preview.")
    print("Terminal build (inside the project): python3 scripts/lwf.py build")
    return 0


def read_config(root: Path) -> dict[str, str]:
    path = root / "project.yml"
    if not path.is_file():
        raise ProjectError(f"No project.yml in {root}. Pass a generated project directory (or examples/english).")
    settings: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = re.fullmatch(r"([a-z_]+):\s*(.+)", line)
        if not match:
            raise ProjectError(f"project.yml:{number}: expected key: value (flat scalars only).")
        key, value = match.groups()
        if key not in CONFIG_KEYS or key in settings:
            raise ProjectError(f"project.yml:{number}: unknown or duplicate key {key!r}.")
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except ValueError as exc:
                raise ProjectError(f"project.yml:{number}: invalid quoted string: {exc}") from exc
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("''", "'")
        elif not re.fullmatch(r"[\w .-]+", value, re.UNICODE):
            raise ProjectError(f"project.yml:{number}: quote this value using JSON double quotes.")
        if not isinstance(value, str):
            raise ProjectError(f"project.yml:{number}: values must be strings.")
        settings[key] = value
    return settings


def build(args: argparse.Namespace) -> int:
    root = Path(args.directory).expanduser().resolve()
    settings = read_config(root)
    engine = args.engine or settings.get("engine", DEFAULT_ENGINE)
    if engine not in ENGINES:
        raise ProjectError(f"Unsupported engine {engine!r}. Choose {', '.join(ENGINES)}.")
    filename = settings.get("source", "paper.tex")
    if not re.fullmatch(r"[\w][\w .-]*\.tex", filename, re.UNICODE):
        raise ProjectError("source must be a root-level .tex filename using letters, numbers, spaces, dots, underscores or hyphens.")
    source = root / filename
    if not source.is_file() or source.resolve().parent != root:
        raise ProjectError(f"Missing source or source outside project root: {source}")
    required = ("latexmk", engine, "biber")
    available = {name: shutil.which(name) for name in required}
    missing = [name for name, executable in available.items() if not executable]
    if missing:
        print(f"Build cannot start. Missing tools on PATH: {', '.join(missing)}.\n"
              "In VS Code select Dev Containers: Reopen in Container, or install these tools through your own TeX distribution.\n"
              "No TeX process ran; no new build log was created.", file=sys.stderr)
        return 127
    outdir = root / "build"
    if outdir.is_symlink():
        raise ProjectError("build/ must be an ordinary project directory, not a symlink.")
    outdir.mkdir(exist_ok=True)
    # Force one TeX pass so stale bind-mount timestamps cannot skip saved text.
    # -gt preserves auxiliary files and only reruns bibliography tools if needed.
    command = [available["latexmk"], "-norc", ENGINES[engine], "-gt", "-synctex=1",
               "-interaction=nonstopmode", "-halt-on-error", "-file-line-error",
               "-no-shell-escape", "-outdir=build", filename]
    transcript = outdir / "lwf-build.log"
    log = outdir / f"{source.stem}.log"
    pdf = outdir / f"{source.stem}.pdf"
    with transcript.open("w", encoding="utf-8") as stream:
        process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True,
                                   encoding="utf-8", errors="replace")
        try:
            for line in process.stdout:
                print(line, end="", flush=True)
                stream.write(line)
            status = process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait()
            raise
        finally:
            process.stdout.close()
    if status or not pdf.is_file():
        print(f"Build failed (exit {status or 1}). Compiler output: {transcript}", file=sys.stderr)
        if log.is_file():
            print(f"TeX log: {log}", file=sys.stderr)
            lines = log.read_text(encoding="utf-8", errors="replace").splitlines()
            start = next((i for i, line in enumerate(lines) if line.startswith("!") or ": LaTeX Error:" in line), max(0, len(lines) - 15))
            print("\n".join(lines[start:start + 15]), file=sys.stderr)
        print("Fix the error and save again. Any existing PDF is the last successful build.", file=sys.stderr)
        return status if status > 0 else 1
    print(f"Built: {pdf}\nTeX log: {log}\nCompiler output: {transcript}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command")
    if (FRAMEWORK / "templates" / "locales").is_dir():
        creator = sub.add_parser("create", help="create a standalone project with VS Code, container and Git defaults")
        creator.add_argument("kind", nargs="?", choices=("paper", "notes"))
        creator.add_argument("--name")
        creator.add_argument("--language")
        creator.add_argument("--engine", choices=tuple(ENGINES), default=DEFAULT_ENGINE,
                             help="default engine (pdflatex for fast English/Spanish previews)")
        creator.add_argument("--output", help="new destination (use a sibling of the framework checkout)")
        git = creator.add_mutually_exclusive_group()
        git.add_argument("--git", dest="git", action="store_true", help="initialize Git (default)")
        git.add_argument("--no-git", dest="git", action="store_false", help="skip Git initialization, e.g. inside an existing repository")
        creator.set_defaults(func=create, git=True)
    builder = sub.add_parser("build", help="incrementally build with latexmk, Biber, and the configured TeX engine")
    builder.add_argument("directory", nargs="?", default=".")
    builder.add_argument("--engine", choices=tuple(ENGINES))
    builder.set_defaults(func=build)
    initializer = sub.add_parser("init-git", help="initialize Git only if this folder has no existing repository")
    initializer.add_argument("directory", nargs="?", default=".")
    initializer.add_argument("--trust-workspace", action="store_true",
                             help="Dev Container setup: trust this mounted folder in container Git")
    initializer.add_argument("--no-init", action="store_true",
                             help="container setup only: use existing history without initializing Git")
    initializer.set_defaults(func=init_git_command)
    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return 0
    try:
        return args.func(args)
    except (ProjectError, OSError, ValueError, EOFError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
