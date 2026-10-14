"""Execute the notebooks of a project and convert them into Starlight MDX pages.

``execute``
    Runs each notebook with nbclient into ``docs/.cache/notebooks/<slug>.ipynb``. A notebook is
    rerun only when the hash of its cells changes or its last run failed (``--force`` reruns all
    of them). With ``mpiRanks`` > 1 every cell runs on that many MPI ranks (see mpi_kernel.py).
``convert``
    Writes ``docs/src/content/docs/<section>/<slug>.mdx`` from the executed copy, the images into
    ``docs/public/<section>/<slug>/`` and a downloadable copy of the notebook next to them.
    Notebooks that have not been executed, or changed since, are converted without outputs
    (``--strict`` fails on them, and on notebooks whose run raised).
``clean``
    Removes the cache, the generated pages and the public assets.

Settings, from the ``"starlight-notebooks"`` entry of ``docs/package.json`` (paths relative to
``docs/``), each overridable on the command line::

    "starlight-notebooks": { "source": "../guides", "mpiRanks": 4 }

``source``    the notebook directory (default ``../tutorials``); notebooks in its subdirectories
              are included too, with pages named after the notebook alone (the slugs must be
              unique), so the directories only organise the sources
``section``   the URL and content directory of the pages (default: the name of ``source``)
``mpiRanks``  MPI ranks per notebook (default 1; ``DOCS_MPI_RANKS`` overrides it, e.g.
              ``DOCS_MPI_RANKS=1`` for a quick serial run)

Cell tags: ``remove-cell``, ``hide-input``, ``fold-input`` (code in a closed <details>),
``fold-output`` (the outputs in a closed <details>, titled by the cell metadata ``fold_summary``,
default "Show output"), ``remove-output``, ``raises-exception``, and nbclient's
``skip-execution`` (shown, not run). Notebook metadata ``docs_order`` sets the sidebar order
(else ``index`` first, then by file name).

Usage: starlight-notebooks <execute|convert|clean> [options]   (in docs/, or with --docs)
"""

from __future__ import annotations

import argparse
import base64
import functools
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

PACKAGE = "@max-models/starlight-theme"
MPI_KERNEL = Path(__file__).resolve().with_name("mpi_kernel.py")


@dataclass
class Settings:
    docs: Path
    source: Path
    section: str
    mpi_ranks: int

    @functools.cached_property
    def repo(self) -> Path:
        """The repository root, for the notebooks' "View on GitHub" links."""
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=self.docs,
            capture_output=True,
            text=True,
            check=False,
        ).stdout.strip()
        return Path(top).resolve() if top else self.docs.parent

    @property
    def cache(self) -> Path:
        return self.docs / ".cache" / "notebooks"

    @property
    def content(self) -> Path:
        return self.docs / "src" / "content" / "docs" / self.section

    @property
    def public(self) -> Path:
        return self.docs / "public" / self.section


def _find_docs() -> Path:
    cwd = Path.cwd()
    for candidate in (cwd, cwd / "docs"):
        if any(candidate.glob("astro.config.*")):
            return candidate
    sys.exit(f"[notebooks] no astro.config.* in {cwd} or {cwd / 'docs'}; pass --docs")


def load_settings(args: argparse.Namespace) -> Settings:
    docs = Path(args.docs).resolve() if args.docs else _find_docs()
    package_json = docs / "package.json"
    config = (
        json.loads(package_json.read_text()).get("starlight-notebooks", {})
        if package_json.exists()
        else {}
    )
    source = (docs / (args.source or config.get("source", "../tutorials"))).resolve()
    if not source.is_dir():
        sys.exit(f"[notebooks] no notebook directory {source}")
    ranks = (
        args.mpi_ranks or os.environ.get("DOCS_MPI_RANKS") or config.get("mpiRanks", 1)
    )
    return Settings(
        docs=docs,
        source=source,
        section=args.section or config.get("section", source.name),
        mpi_ranks=int(ranks),
    )


def slug_of(path: Path) -> str:
    return re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-")


def notebooks(settings: Settings) -> list[Path]:
    paths = [
        path
        for path in settings.source.rglob("*.ipynb")
        # .ipynb_checkpoints and other hidden directories
        if not any(
            part.startswith(".") for part in path.relative_to(settings.source).parts
        )
    ]
    seen: dict[str, Path] = {}
    for path in paths:
        other = seen.setdefault(slug_of(path), path)
        if other != path:
            sys.exit(
                f"[notebooks] {other} and {path} would both be the page {slug_of(path)}"
            )
    return sorted(paths, key=lambda path: (path.stem != "index", path.name))


# Execution ------------------------------------------------------------------------------- #


def cell_hash(path: Path) -> str:
    nb = json.loads(path.read_text())
    cells = [
        {
            "type": c["cell_type"],
            # a list of lines once nbformat has written the notebook, maybe a string before
            "source": _text(c["source"]),
            "tags": c.get("metadata", {}).get("tags", []),
        }
        for c in nb["cells"]
    ]
    return hashlib.sha256(json.dumps(cells, sort_keys=True).encode()).hexdigest()[:16]


@functools.cache
def _mpi_launcher() -> list[str] | None:
    """The MPI launcher command (with Open MPI's oversubscribe flag), if mpi4py is importable."""
    launcher = shutil.which("mpiexec") or shutil.which("mpirun")
    try:
        import mpi4py  # noqa: F401
    except ImportError:
        return None
    if launcher is None:
        return None
    version = subprocess.run(
        [launcher, "--version"], capture_output=True, text=True, check=False
    ).stdout
    # Open MPI refuses more ranks than cores without it; MPICH has no such flag.
    # Open MPI 5 calls itself "Open MPI", Open MPI 4 (Ubuntu's) "OpenRTE".
    is_open_mpi = any(
        name in version.lower() for name in ("open mpi", "openrte", "open-mpi")
    )
    return [launcher, "--oversubscribe"] if is_open_mpi else [launcher]


def _kernel_manager(nranks: int):
    from jupyter_client.kernelspec import KernelSpec
    from jupyter_client.manager import KernelManager

    km = KernelManager(kernel_name="python3")
    launcher = _mpi_launcher() if nranks > 1 else None
    if launcher is not None:
        argv = [
            *launcher,
            "-n",
            str(nranks),
            sys.executable,
            str(MPI_KERNEL),
            "-f",
            "{connection_file}",
        ]
        # KernelManager.kernel_spec has no setter; this is the attribute it caches into.
        km._kernel_spec = KernelSpec(
            argv=argv, language="python", display_name="Python 3 (MPI)"
        )
    return km


def execute_notebook(path: Path, target: Path, timeout: int, nranks: int) -> None:
    import nbformat
    from nbclient import NotebookClient

    nb = nbformat.read(path, as_version=4)
    client = NotebookClient(
        nb,
        timeout=timeout,
        km=_kernel_manager(nranks),
        resources={"metadata": {"path": str(path.parent)}},
    )
    error = None
    try:
        client.execute()
    except Exception as exc:  # the partial outputs are still written for the page
        error = f"{type(exc).__name__}: {exc}"
    target.parent.mkdir(parents=True, exist_ok=True)
    nbformat.write(nb, target)
    error_file = target.with_suffix(".error")
    if error:
        error_file.write_text(error)
    else:
        error_file.unlink(missing_ok=True)


def cmd_execute(settings: Settings, args: argparse.Namespace) -> None:
    if settings.mpi_ranks > 1:
        if _mpi_launcher() is not None:
            print(f"[notebooks] running under mpiexec -n {settings.mpi_ranks}")
        else:
            print("[notebooks] mpi4py or mpiexec/mpirun not found; running on 1 rank")
    failed = []
    for path in notebooks(settings):
        slug = slug_of(path)
        target = settings.cache / f"{slug}.ipynb"
        key_file = settings.cache / f"{slug}.key"
        key = cell_hash(path)
        if (
            not args.force
            and target.exists()
            and key_file.exists()
            and key_file.read_text() == key
            and not target.with_suffix(".error").exists()
        ):
            print(f"[notebooks] {slug}: up to date")
            continue
        print(f"[notebooks] {slug}: executing", flush=True)
        execute_notebook(path, target, args.timeout, settings.mpi_ranks)
        key_file.write_text(key)
        error_file = target.with_suffix(".error")
        if error_file.exists():
            failed.append(slug)
            print(f"[notebooks] {slug}: FAILED: {error_file.read_text()}")
    if failed:
        print(f"[notebooks] {len(failed)} failed: {', '.join(failed)}")
        sys.exit(1)


# Conversion: markdown ---------------------------------------------------------------------- #

# Regions whose contents MDX must not touch: code fences, inline code and math.
_PROTECTED = re.compile(
    r"(?P<fence>^(?P<ticks>`{3,}|~{3,})[^\n]*\n.*?^(?P=ticks)[ \t]*$)"
    r"|(?P<display>\$\$.+?\$\$)"
    r"|(?P<bracket>\\\[.+?\\\])"
    r"|(?P<code>(?P<bt>`+).+?(?P=bt))"
    r"|(?P<inline>(?<![\\$])\$(?!\s)(?:[^$\n\\]|\\.)+?(?<!\s)\$(?!\d))"
    r"|(?P<paren>\\\(.+?\\\))",
    re.DOTALL | re.MULTILINE,
)
_VOID_TAGS = re.compile(
    r"<(br|hr|img|input|meta|link|source)\b([^>]*?)\s*/?>", re.IGNORECASE
)
_TAG = re.compile(r"</?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?/?>")
_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _escape_plain(text: str) -> str:
    return (
        text.replace("{", "\\{")
        .replace("}", "\\}")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _escape_text(text: str) -> str:
    """Escape what MDX would parse in plain markdown text: braces, stray <, comments."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = _VOID_TAGS.sub(lambda m: f"<{m.group(1)}{m.group(2)} />", text)
    out = []
    position = 0
    for match in _TAG.finditer(text):
        out.append(_escape_plain(text[position : match.start()]))
        out.append(
            re.sub(r'\sstyle="[^"]*"', "", match.group(0))
        )  # JSX wants style objects
        position = match.end()
    out.append(_escape_plain(text[position:]))
    return "".join(out)


def sanitize_markdown(text: str) -> str:
    """Make notebook markdown valid MDX, keeping code and math as they are."""
    out = []
    position = 0
    for match in _PROTECTED.finditer(text):
        out.append(_escape_text(text[position : match.start()]))
        chunk = match.group(0)
        if match.group("bracket"):
            out.append("\n$$\n" + chunk[2:-2].strip() + "\n$$\n")
        elif match.group("paren"):
            out.append("$" + chunk[2:-2].strip() + "$")
        else:
            out.append(chunk)
        position = match.end()
    out.append(_escape_text(text[position:]))
    return "".join(out)


def _first_heading(markdown: str) -> tuple[str | None, str]:
    """Split off the first ``# Title`` line; return (title, the rest)."""
    lines = markdown.splitlines()
    for i, line in enumerate(lines):
        if line.strip().startswith("# "):
            return line.strip()[2:].strip(), "\n".join(lines[:i] + lines[i + 1 :])
        if line.strip():
            break
    return None, markdown


def _plain(text: str) -> str:
    """Markdown to plain text for a title or description."""
    text = re.sub(r"\$\$.*?\$\$", "", text, flags=re.DOTALL)
    text = re.sub(r"\$([^$]+)\$", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[`*_#>{}]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _description(markdown: str) -> str:
    for paragraph in re.split(r"\n\s*\n", markdown):
        stripped = paragraph.strip()
        if not stripped or stripped.startswith(("#", "|", "-", "*", "```", "$$", "<")):
            continue
        plain = _plain(stripped)
        if len(plain) > 20:
            return plain[:200].rsplit(" ", 1)[0] + "…" if len(plain) > 200 else plain
    return ""


def _yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


# Conversion: outputs ----------------------------------------------------------------------- #


class Page:
    def __init__(self, settings: Settings, slug: str) -> None:
        self.slug = slug
        self.section = settings.section
        self.public = settings.public / slug
        self.components: set[str] = set()
        self.errors: list[str] = []
        self.assets = 0

    def asset(self, suffix: str) -> tuple[Path, str]:
        self.assets += 1
        self.public.mkdir(parents=True, exist_ok=True)
        name = f"{self.assets}{suffix}"
        return self.public / name, f"/{self.section}/{self.slug}/{name}"


def _fence(text: str, language: str = "text") -> str:
    text = _ANSI.sub("", text).rstrip("\n")
    if not text.strip():
        return ""
    lines = text.splitlines()
    if len(lines) > 200:
        lines = (
            lines[:100] + [f"... ({len(lines) - 200} lines skipped) ..."] + lines[-100:]
        )
        text = "\n".join(lines)
    ticks = "```"
    while ticks in text:
        ticks += "`"
    return f"{ticks}{language}\n{text}\n{ticks}"


def _text(value: Any) -> str:
    return "".join(value) if isinstance(value, list) else str(value)


def merge_streams(outputs: list[dict]) -> list[dict]:
    """Join consecutive stream outputs of the same stream (one print per line otherwise)."""
    merged: list[dict] = []
    for output in outputs:
        previous = merged[-1] if merged else None
        if (
            output.get("output_type") == "stream"
            and previous is not None
            and previous.get("output_type") == "stream"
            and previous.get("name") == output.get("name")
        ):
            previous["text"] = _text(previous["text"]) + _text(output.get("text", ""))
        else:
            merged.append(dict(output))
    return merged


_IMAGES = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif"}


def convert_output(output: dict, page: Page, tags: list[str], index: int) -> str:
    kind = output.get("output_type")
    if kind == "stream":
        return _fence(_text(output.get("text", "")))
    if kind == "error":
        if "raises-exception" not in tags:
            page.errors.append(
                f"cell {index}: {output.get('ename')}: {output.get('evalue')}"
            )
        return _fence(_ANSI.sub("", "\n".join(output.get("traceback", []))))
    data = output.get("data", {})
    mime = next((mime for mime in _IMAGES if mime in data), None)
    if mime is not None:  # a GIF is an animation, e.g. from IPython.display.Image
        path, url = page.asset(_IMAGES[mime])
        path.write_bytes(base64.b64decode(_text(data[mime])))
        page.components.add("NotebookImage")
        return f'<NotebookImage src="{url}" />'
    if "image/svg+xml" in data:
        page.components.add("RawHtml")
        return f"<RawHtml html={{{json.dumps(_text(data['image/svg+xml']))}}} />"
    if "text/html" in data:
        page.components.add("RawHtml")
        return f"<RawHtml html={{{json.dumps(_text(data['text/html']))}}} />"
    if "text/markdown" in data:
        return sanitize_markdown(_text(data["text/markdown"]))
    if "text/latex" in data:
        return "\n$$\n" + _text(data["text/latex"]).strip().strip("$") + "\n$$\n"
    if "text/plain" in data:
        return _fence(_text(data["text/plain"]))
    return ""


# Conversion: pages ------------------------------------------------------------------------- #


def sidebar_order(metadata: dict, default: int) -> int:
    # `guide.order` is the older spelling, still in the mpiarray guides
    return metadata.get("docs_order", metadata.get("guide", {}).get("order", default))


def convert_notebook(
    settings: Settings, source: Path, executed: Path | None, order: int
) -> Page:
    import nbformat

    slug = slug_of(source)
    order = sidebar_order(nbformat.read(source, as_version=4).metadata, order)
    nb = nbformat.read(executed or source, as_version=4)
    page = Page(settings, slug)
    shutil.rmtree(page.public, ignore_errors=True)
    title = None
    description = ""
    body = []
    for index, cell in enumerate(nb.cells):
        tags = list(cell.metadata.get("tags", []))
        if "remove-cell" in tags:
            continue
        if cell.cell_type == "markdown":
            text = cell.source
            if title is None:
                heading, text = _first_heading(text)
                if heading:
                    title = _plain(heading)
            if not description:
                description = _description(text)
            for name, bundle in cell.get("attachments", {}).items():
                for mime, payload in bundle.items():
                    if mime.startswith("image/"):
                        path, url = page.asset(Path(name).suffix or ".png")
                        path.write_bytes(base64.b64decode(_text(payload)))
                        text = text.replace(f"attachment:{name}", url)
            body.append(sanitize_markdown(text).strip())
        elif cell.cell_type == "code":
            if cell.source.strip() and "hide-input" not in tags:
                code = _fence(cell.source, "python")
                if "fold-input" in tags:
                    code = f"<details>\n<summary>Show code</summary>\n\n{code}\n\n</details>"
                body.append(code)
            if "remove-output" in tags:
                continue
            outputs = [
                converted
                for output in merge_streams(cell.get("outputs", []))
                if (converted := convert_output(output, page, tags, index))
            ]
            if outputs and "fold-output" in tags:
                summary = _escape_plain(
                    cell.metadata.get("fold_summary", "Show output")
                )
                outputs = [
                    f"<details>\n<summary>{summary}</summary>\n\n"
                    + "\n\n".join(outputs)
                    + "\n\n</details>"
                ]
            body += outputs
    title = title or source.stem.replace("_", " ").capitalize()
    imports = [
        f"import {name} from '{PACKAGE}/components/{name}.astro';"
        for name in ["NotebookHeader", *sorted(page.components)]
    ]
    page.public.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, page.public / source.name)
    status = "executed" if executed else "not run"
    frontmatter = [
        "---",
        f"title: {_yaml_string(title)}",
        f"description: {_yaml_string(description or title)}",
        "sidebar:",
        f"  order: {order}",
        "---",
    ]
    header = (
        f'<NotebookHeader download="/{settings.section}/{slug}/{source.name}" '
        f'source="{source.relative_to(settings.repo).as_posix()}" status="{status}" />'
    )
    text = (
        "\n".join(frontmatter) + "\n\n" + "\n".join(imports) + "\n\n" + header + "\n\n"
    )
    text += "\n\n".join(part for part in body if part) + "\n"
    settings.content.mkdir(parents=True, exist_ok=True)
    (settings.content / f"{slug}.mdx").write_text(text)
    return page


def cmd_convert(settings: Settings, args: argparse.Namespace) -> None:
    sources = notebooks(settings)
    # only remove pages of deleted notebooks, so a running `astro dev` does not lose them all
    expected = {f"{slug_of(path)}.mdx" for path in sources}
    for stale in settings.content.glob("*.mdx"):
        if stale.name not in expected:
            stale.unlink()
    problems = []
    for order, source in enumerate(sources, start=1):
        slug = slug_of(source)
        executed = settings.cache / f"{slug}.ipynb"
        error_file = executed.with_suffix(".error")
        fresh = executed.exists() and cell_hash(executed) == cell_hash(source)
        page = convert_notebook(settings, source, executed if fresh else None, order)
        state = "executed" if fresh else "not run"
        if error_file.exists():
            problems.append(f"{slug}: run failed: {error_file.read_text().strip()}")
        elif not fresh:
            problems.append(f"{slug}: not executed or source changed")
        problems += [f"{slug}: {error}" for error in page.errors]
        target = (settings.content / f"{slug}.mdx").relative_to(settings.docs)
        print(f"[notebooks] {slug}: {state}, {page.assets} assets -> {target}")
    for problem in problems:
        print(f"[notebooks] warning: {problem}")
    if args.strict and problems:
        sys.exit(1)


def cmd_clean(settings: Settings, args: argparse.Namespace) -> None:
    shutil.rmtree(settings.cache, ignore_errors=True)
    shutil.rmtree(settings.public, ignore_errors=True)
    for page in settings.content.glob("*.mdx"):
        page.unlink()


def main(argv: list[str] | None = None) -> None:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--docs", help="the site directory (default: . or ./docs)")
    common.add_argument("--source", help="the notebook directory, relative to --docs")
    common.add_argument("--section", help="the URL section of the pages")
    common.add_argument("--mpi-ranks", type=int, help="MPI ranks per notebook")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    execute = sub.add_parser(
        "execute", parents=[common], help="run the notebooks whose cells changed"
    )
    execute.add_argument("--force", action="store_true", help="rerun every notebook")
    execute.add_argument("--timeout", type=int, default=600, help="seconds per cell")
    execute.set_defaults(func=cmd_execute)
    convert = sub.add_parser(
        "convert", parents=[common], help="write the MDX pages and assets"
    )
    convert.add_argument(
        "--strict", action="store_true", help="fail on missing or failed runs"
    )
    convert.set_defaults(func=cmd_convert)
    clean = sub.add_parser(
        "clean", parents=[common], help="remove the cache and generated files"
    )
    clean.set_defaults(func=cmd_clean)
    args = parser.parse_args(argv)
    args.func(load_settings(args), args)


if __name__ == "__main__":
    main()
