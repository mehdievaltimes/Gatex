"""CLI integration checks; use real Git, but do not require a TeX installation.

Run from the framework root: python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


FRAMEWORK = Path(__file__).resolve().parents[1]
CLI = FRAMEWORK / "scripts" / "lwf.py"


@unittest.skipUnless(shutil.which("git"), "Git is needed for project integration checks")
class ProjectIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="lwf integration español ")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.environment = {key: value for key, value in os.environ.items()
                            if not key.startswith("GIT_")}

    def run_cli(self, *arguments: str, helper: Path = CLI,
                directory: Path | None = None,
                environment: dict[str, str] | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(helper), *arguments],
            cwd=directory or self.root,
            env=environment if environment is not None else self.environment,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )

    def git(self, directory: Path, *arguments: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", "-C", str(directory), *arguments], env=self.environment,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            check=True,
        )

    def create(self, destination: Path, *, kind: str = "paper", language: str = "en",
               name: str = "Research Paper", extra: tuple[str, ...] = ()) -> subprocess.CompletedProcess:
        return self.run_cli("create", kind, "--name", name, "--language", language,
                            "--output", str(destination), *extra)

    def assert_success(self, result: subprocess.CompletedProcess) -> None:
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_paper_and_notes_remain_standalone_after_moving(self) -> None:
        for kind, language in (("paper", "en"), ("notes", "es")):
            with self.subTest(kind=kind, language=language):
                original = self.root / f"Original {kind}"
                name = "María's Research"
                engine = "pdflatex" if kind == "paper" else "lualatex"
                extra = () if kind == "paper" else ("--engine", engine)
                self.assert_success(self.create(original, kind=kind, language=language, name=name, extra=extra))
                moved = self.root / f"Moved investigación {kind}"
                original.rename(moved)
                for relative in ("README.md", "LICENSE", "project.yml", f"{kind}.tex",
                                 "references.bib", "scripts/lwf.py", ".gitignore",
                                 ".devcontainer/Dockerfile", ".devcontainer/devcontainer.json",
                                 ".vscode/settings.json", ".vscode/tasks.json"):
                    self.assertTrue((moved / relative).is_file(), relative)
                settings = dict(line.split(":", 1) for line in
                                (moved / "project.yml").read_text(encoding="utf-8").splitlines()
                                if line and not line.startswith("#"))
                self.assertEqual(json.loads(settings["name"]), name)
                self.assertEqual(json.loads(settings["source"]), f"{kind}.tex")
                self.assertEqual(json.loads(settings["language"]), language)
                self.assertEqual(json.loads(settings["engine"]), engine)
                helper = moved / "scripts/lwf.py"
                help_result = self.run_cli("--help", helper=helper, directory=moved)
                self.assert_success(help_result)
                self.assertNotIn("{create,", help_result.stdout)
                self.assertIn("init-git", help_result.stdout)
                repository = Path(self.git(moved, "rev-parse", "--show-toplevel").stdout.strip())
                self.assertEqual(repository.resolve(), moved)
                missing_path = self.root / "empty-bin"
                missing_path.mkdir(exist_ok=True)
                environment = dict(self.environment, PATH=str(missing_path))
                build = self.run_cli("build", helper=helper, directory=moved,
                                     environment=environment)
                self.assertEqual(build.returncode, 127, build.stdout + build.stderr)
                for required in ("latexmk", engine, "biber"):
                    self.assertIn(required, build.stderr)
                self.assertIn("No TeX process ran", build.stderr)
                self.assertFalse((moved / "build").exists())

    def test_default_git_is_ready_to_commit_and_initialization_is_idempotent(self) -> None:
        project = self.root / "Paper"
        self.assert_success(self.create(project))
        self.assertEqual(self.git(project, "symbolic-ref", "--short", "HEAD").stdout.strip(), "main")
        self.git(project, "config", "framework.integrationGuard", "preserved")
        git_head = (project / ".git" / "HEAD").read_bytes()
        result = self.run_cli("init-git", str(project))
        self.assert_success(result)
        self.assertIn("already initialized", result.stdout)
        self.assertEqual((project / ".git" / "HEAD").read_bytes(), git_head)
        self.assertEqual(self.git(project, "config", "framework.integrationGuard").stdout.strip(), "preserved")
        status = self.git(project, "status", "--porcelain").stdout
        self.assertIn("paper.tex", status)
        self.assertIn(".vscode/", status)
        self.assertIn(".devcontainer/", status)
        (project / "build").mkdir()
        (project / "build/paper.pdf").write_bytes(b"ignored fixture")
        (project / "build/paper.synctex.gz").write_bytes(b"ignored fixture")
        (project / "scripts/__pycache__").mkdir()
        (project / "scripts/__pycache__/lwf.pyc").write_bytes(b"ignored fixture")
        self.assertEqual(self.git(project, "status", "--porcelain").stdout, status)
        self.git(project, "add", ".")
        staged = self.git(project, "diff", "--cached", "--name-only").stdout
        self.assertIn(".vscode/settings.json", staged)
        self.assertIn(".devcontainer/devcontainer.json", staged)
        self.assertNotIn("build/", staged)

    def test_nested_repository_refusal_creates_nothing(self) -> None:
        parent = self.root / "Existing repository"
        parent.mkdir()
        self.git(parent, "init")
        intermediate = parent / "New intermediate"
        project = intermediate / "Paper"
        result = self.create(project)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("inside repository", result.stderr)
        self.assertFalse(intermediate.exists())

    def test_bare_repository_refusal_creates_nothing(self) -> None:
        parent = self.root / "Existing bare repository"
        parent.mkdir()
        self.git(parent, "init", "--bare")
        project = parent / "Paper"
        result = self.create(project)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("inside repository", result.stderr)
        self.assertFalse(project.exists())

    def test_no_git_preserves_parent_repository_and_container_choice(self) -> None:
        parent = self.root / "Existing repository"
        parent.mkdir()
        self.git(parent, "init")
        project = parent / "Notes"
        self.assert_success(self.create(project, kind="notes", extra=("--no-git",)))
        self.assertFalse((project / ".git").exists())
        container = json.loads((project / ".devcontainer/devcontainer.json").read_text(encoding="utf-8"))
        self.assertIn("--no-init", container["postCreateCommand"])
        result = self.run_cli("init-git", str(project))
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertFalse((project / ".git").exists())

    def test_invalid_portable_names_create_nothing(self) -> None:
        project = self.root / "Never created"
        for name in ("", ".", "..", "CON", "con.txt", "LPT1", "COM¹.txt", "aux",
                     "Leading/traversal", "back\\slash", "trailing.", "trailing ",
                     " leading", "line\nbreak", "tab\tname", 'a"b', "bad:name"):
            with self.subTest(name=name):
                result = self.create(project, name=name)
                self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
                self.assertIn("Invalid project name", result.stderr)
                self.assertFalse(project.exists())

    def test_existing_destination_is_untouched(self) -> None:
        project = self.root / "Existing project"
        project.mkdir()
        sentinel = project / "paper.tex"
        sentinel.write_text("Existing author content\n", encoding="utf-8")
        result = self.create(project)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("nothing overwritten", result.stderr)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "Existing author content\n")
        self.assertEqual(list(project.iterdir()), [sentinel])

    def test_missing_git_requires_explicit_opt_out_without_partial_project(self) -> None:
        empty_path = self.root / "empty-bin"
        empty_path.mkdir()
        environment = dict(self.environment, PATH=str(empty_path))
        project = self.root / "Paper without installed Git"
        arguments = ("create", "paper", "--name", "Paper", "--language", "en",
                     "--output", str(project))
        result = self.run_cli(*arguments, environment=environment)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("Git is missing", result.stderr)
        self.assertFalse(project.exists())
        self.assert_success(self.run_cli(*arguments, "--no-git", environment=environment))
        self.assertTrue((project / "paper.tex").is_file())
        self.assertFalse((project / ".git").exists())

    def test_dangling_destination_symlink_is_untouched(self) -> None:
        destination = self.root / "Linked project"
        target = self.root / "Nonexistent target"
        try:
            destination.symlink_to(target, target_is_directory=True)
        except (NotImplementedError, OSError) as exc:
            self.skipTest(f"Creating symlinks is unavailable: {exc}")
        result = self.create(destination)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertTrue(destination.is_symlink())
        self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
