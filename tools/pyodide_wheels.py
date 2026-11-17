"""Build the wheels a site's live demos install in the browser (Pyodide).

``starlight-pyodide wheels`` (run in ``docs/``) builds the project's wheel into
``docs/public/pyodide/`` and writes ``wheels.json`` there, the list of wheels the pages install
with micropip, in order. Except on the release build (``UV_NO_SOURCES`` set, as the docs workflow
sets it for the release branch), the dependencies that ``[tool.uv.sources]`` takes from git (and, in turn, those of their own
``[tool.uv.sources]``), e.g.
the devel branches of the max-models packages, are built as wheels too and listed before the
project: micropip cannot install from git, and would otherwise take their last release from PyPI.
The other dependencies come from Pyodide's own packages or PyPI when the page installs the wheels.

Pyodide runs pure-Python wheels only (``py3-none-any``); a project or devel dependency with
compiled extensions fails here instead of in the reader's browser.

Options: ``--out DIR`` (default ``public/pyodide`` in ``docs/``), ``--project DIR`` (default: the
nearest directory above with a ``pyproject.toml``), ``--no-sources`` (only the project's wheel).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10
    import tomli as tomllib

WHEELS_JSON = "wheels.json"
PURE = re.compile(r"-none-any\.whl$")


def normalize(name: str) -> str:
    """The canonical form of a distribution name (PEP 503)."""
    return re.sub(r"[-_.]+", "-", name).lower()


def requirement_name(requirement: str) -> str:
    """The distribution name of a requirement string, e.g. ``cunumpy`` of ``cunumpy>=0.7``."""
    match = re.match(r"\s*([A-Za-z0-9][A-Za-z0-9._-]*)", requirement)
    if not match:
        raise ValueError(f"not a requirement: {requirement!r}")
    return normalize(match.group(1))


def git_sources(pyproject: dict) -> list[tuple[str, dict]]:
    """The runtime dependencies that ``[tool.uv.sources]`` takes from git, in dependency order.

    Sources of optional or development dependencies are left out: the pages install only what
    the package needs to import and run.
    """
    sources = pyproject.get("tool", {}).get("uv", {}).get("sources", {})
    by_name = {normalize(name): source for name, source in sources.items()}
    out = []
    for requirement in pyproject.get("project", {}).get("dependencies", []):
        name = requirement_name(requirement)
        source = by_name.get(name)
        if isinstance(source, list):  # sources per marker: the first one with git
            source = next((item for item in source if "git" in item), None)
        if isinstance(source, dict) and "git" in source:
            out.append((name, source))
    return out


def find_project(start: Path) -> Path:
    """The nearest directory at or above ``start`` with a ``pyproject.toml``."""
    for directory in [start, *start.parents]:
        if (directory / "pyproject.toml").is_file():
            return directory
    raise SystemExit(f"no pyproject.toml at or above {start}")


def build_wheel(source: Path, out: Path) -> Path:
    """Build the wheel of a source tree into ``out`` and return it; it must be pure Python."""
    before = set(out.glob("*.whl"))
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(out), str(source)], check=True
    )
    (wheel,) = set(out.glob("*.whl")) - before
    if not PURE.search(wheel.name):
        raise SystemExit(
            f"{wheel.name} is not a pure-Python wheel (none-any): Pyodide cannot install it"
        )
    return wheel


def build_git_wheel(name: str, source: dict, out: Path) -> tuple[Path, dict]:
    """Clone a git source (branch, tag or rev; optionally a subdirectory) and build its wheel.

    Returns the wheel and the source's ``pyproject.toml``, whose own git sources are followed.
    """
    with tempfile.TemporaryDirectory() as tmp:
        checkout = Path(tmp) / name
        ref = source.get("branch") or source.get("tag")
        clone = ["git", "clone", "--quiet", "--depth", "1"]
        if ref:
            clone += ["--branch", ref]
        subprocess.run([*clone, source["git"], str(checkout)], check=True)
        if source.get("rev"):
            subprocess.run(
                [
                    "git",
                    "-C",
                    str(checkout),
                    "fetch",
                    "--quiet",
                    "--depth",
                    "1",
                    "origin",
                    source["rev"],
                ],
                check=True,
            )
            subprocess.run(
                ["git", "-C", str(checkout), "checkout", "--quiet", "FETCH_HEAD"],
                check=True,
            )
        root = checkout / source.get("subdirectory", "")
        return build_wheel(root, out), tomllib.loads(
            (root / "pyproject.toml").read_text()
        )


def build(project: Path, out: Path, sources: bool) -> list[str]:
    """Build the wheels into a fresh ``out`` and write ``wheels.json``; return the wheel names."""
    pyproject = tomllib.loads((project / "pyproject.toml").read_text())
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    wheels = []
    if sources:
        # the git sources of the dependencies too (e.g. cunumpy's devel branch for mpifield's),
        # each once; the deepest ones first
        queue, seen = list(git_sources(pyproject)), set()
        while queue:
            name, source = queue.pop(0)
            if name in seen:
                continue
            seen.add(name)
            ref = (
                source.get("branch")
                or source.get("tag")
                or source.get("rev")
                or "default branch"
            )
            print(f"[pyodide] {name} from {source['git']} ({ref})")
            wheel, dependency = build_git_wheel(name, source, out)
            wheels.insert(0, wheel.name)
            queue += git_sources(dependency)
    wheels.append(build_wheel(project, out).name)
    (out / WHEELS_JSON).write_text(json.dumps({"wheels": wheels}, indent=2) + "\n")
    print(f"[pyodide] wrote {out / WHEELS_JSON}: {', '.join(wheels)}")
    return wheels


def main(argv: list[str] | None = None) -> None:
    """Command line: ``starlight-pyodide wheels [--out DIR] [--project DIR] [--no-sources]``."""
    parser = argparse.ArgumentParser(
        prog="starlight-pyodide wheels", description=__doc__.split("\n\n")[0]
    )
    parser.add_argument("--out", type=Path, default=Path("public") / "pyodide")
    parser.add_argument("--project", type=Path)
    parser.add_argument(
        "--no-sources",
        action="store_true",
        help="only the project's wheel, its dependencies from PyPI",
    )
    args = parser.parse_args(argv)
    if shutil.which("uv") is None:
        raise SystemExit(
            "starlight-pyodide wheels needs uv (https://docs.astral.sh/uv/)"
        )
    project = (args.project or find_project(Path.cwd())).resolve()
    no_sources = args.no_sources or os.environ.get("UV_NO_SOURCES", "").lower() in {
        "1",
        "true",
        "yes",
    }
    build(project, args.out.resolve(), sources=not no_sources)


if __name__ == "__main__":
    main(sys.argv[1:])
