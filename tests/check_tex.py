#!/usr/bin/env python3
"""Real TeX regression check. Run inside the Dev Container, separately from unit tests."""
from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def invoke(command: list[str], cwd: Path) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=cwd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace")


def successful(result: subprocess.CompletedProcess) -> None:
    if result.returncode:
        raise AssertionError(result.stdout[-5000:] + result.stderr)


def digest(path: Path) -> bytes:
    return hashlib.sha256(path.read_bytes()).digest()


def verify(kind: str, language: str, engine: str, work: Path) -> None:
    name = f"{kind} {language} {engine}"
    original = work / f"Original {name}"
    successful(invoke([sys.executable, str(ROOT / "scripts/lwf.py"), "create", kind,
                       "--name", name, "--language", language, "--engine", engine,
                       "--output", str(original)], ROOT))
    project = work / f"Moved año {name}"
    original.rename(project)
    before = invoke(["git", "status", "--porcelain"], project).stdout
    command = [sys.executable, "scripts/lwf.py", "build"]
    successful(invoke(command, project))
    pdf = project / "build" / f"{kind}.pdf"
    previous = digest(pdf)
    assert (project / "build" / f"{kind}.bbl").is_file()
    assert (project / "build" / f"{kind}.synctex.gz").is_file()
    assert invoke(["git", "status", "--porcelain"], project).stdout == before
    bibliography_time = (project / "build" / f"{kind}.bbl").stat().st_mtime_ns
    unchanged = invoke(command, project)
    successful(unchanged)
    assert (project / "build" / f"{kind}.bbl").stat().st_mtime_ns == bibliography_time

    section = project / "sections" / ("introduction.tex" if kind == "paper" else "notes.tex")
    content = section.read_text(encoding="utf-8")
    section.write_text(content + "\nA new sentence for the live PDF preview.\n", encoding="utf-8")
    started = time.perf_counter()
    successful(invoke(command, project))
    elapsed = time.perf_counter() - started
    assert digest(pdf) != previous, "Saved source edit did not update the PDF"
    section.write_text(content + "\n\\UndefinedLwfCommand\n", encoding="utf-8")
    invalid = invoke(command, project)
    assert invalid.returncode != 0, "Invalid source was incorrectly accepted as current"
    assert "Build failed" in invalid.stderr and "TeX log:" in invalid.stderr, invalid.stderr
    section.write_text(content, encoding="utf-8")
    successful(invoke(command, project))
    assert invoke(["git", "status", "--porcelain"], project).stdout == before
    print(f"PASS {name}: moved project, citations, SyncTeX, cache, edited PDF ({elapsed:.2f}s), error and recovery", flush=True)


def main() -> None:
    required = ("git", "latexmk", "biber", "pdflatex", "lualatex", "xelatex")
    missing = [tool for tool in required if not shutil.which(tool)]
    if missing:
        raise SystemExit("Run inside the Dev Container; missing tools: " + ", ".join(missing))
    with tempfile.TemporaryDirectory(prefix="lwf TeX español ") as directory:
        work = Path(directory)
        for language in ("en", "es"):
            for engine in ("pdflatex", "lualatex", "xelatex"):
                verify("paper", language, engine, work)
            verify("notes", language, "pdflatex", work)


if __name__ == "__main__":
    main()
