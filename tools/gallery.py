"""Run the example scripts of a project and turn them into a gallery of Starlight pages.

A gallery example is a plain Python script that shows its figures with ``plt.show()`` (matplotlib,
saved as PNG) or ``fig.show()`` (Plotly, rendered interactively with plotly.js). Its module
docstring is the description: the first line is the title, the first paragraph after it the text of
the gallery card, and the rest (Markdown, with ``$math$``) goes on the page above the figures.
The script, minus that docstring, is shown below them.

``execute``
    Runs each script with gallery_runner.py into ``docs/.cache/gallery/<slug>/``. A script is rerun
    only when its text changes or its last run failed (``--force`` reruns all of them).
``convert``
    Writes ``docs/src/content/docs/<section>/<slug>.mdx`` for each script, an ``index.mdx`` with the
    grid of cards, and the figures and a copy of each script into ``docs/public/<section>/<slug>/``.
    Scripts that have not been run, or changed since, get a page without figures
    (``--strict`` fails on them, and on scripts whose run raised).
``clean``
    Removes the cache, the generated pages and the public assets.

Settings, from the ``"starlight-gallery"`` entry of ``docs/package.json`` (paths relative to
``docs/``), each overridable on the command line::

    "starlight-gallery": { "source": "../examples", "title": "Gallery" }

``source``       the script directory (default ``../examples``). Scripts in its subdirectories are
                 included too, with pages named after the script alone (the slugs must be unique);
                 each subdirectory is a heading of the gallery grid. Files starting with ``_`` or
                 ``.`` are skipped, and so is ``__init__.py``.
``section``      the URL and content directory of the pages (default: the name of ``source``)
``title``        the title of the gallery page (default "Gallery")
``description``  the description of the gallery page; ``README.md`` in ``source`` (if any) is the
                 introduction above the grid and overrides it

Usage: starlight-gallery <execute|convert|clean> [options]   (in docs/, or with --docs)
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import notebooks as nb_tool
from notebooks import PACKAGE, _description, _plain, _yaml_string, sanitize_markdown

RUNNER = Path(__file__).resolve().with_name("gallery_runner.py")


@dataclass
class GallerySettings(nb_tool.Settings):
    title: str = "Gallery"
    description: str = "Example scripts and the figures they make."

    @property
    def cache(self) -> Path:
        return self.docs / ".cache" / "gallery"


def load_settings(args: argparse.Namespace) -> GallerySettings:
    docs = Path(args.docs).resolve() if args.docs else nb_tool._find_docs()
    package_json = docs / "package.json"
    config = (
        json.loads(package_json.read_text()).get("starlight-gallery", {})
        if package_json.exists()
        else {}
    )
    source = (docs / (args.source or config.get("source", "../examples"))).resolve()
    if not source.is_dir():
        sys.exit(f"[gallery] no script directory {source}")
    defaults = GallerySettings.__dataclass_fields__
    return GallerySettings(
        docs=docs,
        source=source,
        section=args.section or config.get("section", source.name),
        mpi_ranks=1,
        title=args.title or config.get("title", defaults["title"].default),
        description=config.get("description", defaults["description"].default),
    )


@dataclass
class Example:
    path: Path
    slug: str
    group: str
    title: str
    summary: str
    body: str
    code: str


def _group_of(settings: GallerySettings, path: Path) -> str:
    parts = path.relative_to(settings.source).parts[:-1]
    return re.sub(r"[-_]+", " ", parts[0]).strip().capitalize() if parts else ""


def parse_example(settings: GallerySettings, path: Path) -> Example:
    """Split a script into its docstring (title, summary, body) and the code below it."""
    text = path.read_text()
    tree = ast.parse(text)
    docstring = ast.get_docstring(tree) or ""
    code = text
    first = tree.body[0] if tree.body else None
    if (
        docstring
        and isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    ):
        code = "\n".join(text.splitlines()[first.end_lineno :])
    title, _, rest = docstring.partition("\n")
    title = title.strip().rstrip(".") or path.stem.replace("_", " ").capitalize()
    rest = rest.strip()
    return Example(
        path=path,
        slug=nb_tool.slug_of(path),
        group=_group_of(settings, path),
        title=title,
        summary=_description(rest) or title,
        body=rest,
        code=code.strip("\n") + "\n",
    )


def examples(settings: GallerySettings) -> list[Example]:
    paths = [
        path
        for path in settings.source.rglob("*.py")
        if not any(
            part.startswith((".", "_"))
            for part in path.relative_to(settings.source).parts
        )
    ]
    found = [parse_example(settings, path) for path in paths]
    seen: dict[str, Path] = {}
    for example in found:
        other = seen.setdefault(example.slug, example.path)
        if other != example.path:
            sys.exit(
                f"[gallery] {other} and {example.path} would both be the page {example.slug}"
            )
    # ungrouped first, then the groups alphabetically; by file name within each
    return sorted(found, key=lambda e: (e.group != "", e.group, e.path.name))


# Execution ------------------------------------------------------------------------------- #


def script_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def cmd_execute(settings: GallerySettings, args: argparse.Namespace) -> None:
    failed = []
    for example in examples(settings):
        outdir = settings.cache / example.slug
        key_file = settings.cache / f"{example.slug}.key"
        error_file = settings.cache / f"{example.slug}.error"
        key = script_hash(example.path)
        if (
            not args.force
            and (outdir / "manifest.json").exists()
            and key_file.exists()
            and key_file.read_text() == key
            and not error_file.exists()
        ):
            print(f"[gallery] {example.slug}: up to date")
            continue
        print(f"[gallery] {example.slug}: running", flush=True)
        settings.cache.mkdir(parents=True, exist_ok=True)
        try:
            result = subprocess.run(
                [sys.executable, str(RUNNER), str(example.path), str(outdir)],
                capture_output=True,
                text=True,
                timeout=args.timeout,
                env={**os.environ, "MPLBACKEND": "Agg"},
                check=False,
            )
            error = result.stderr.strip() if result.returncode else ""
            if result.returncode and not error:
                error = f"exit status {result.returncode}"
        except subprocess.TimeoutExpired:
            error = f"timed out after {args.timeout} s"
        key_file.write_text(key)
        if error:
            error_file.write_text(error)
            failed.append(example.slug)
            print(f"[gallery] {example.slug}: FAILED:\n{error}")
        else:
            error_file.unlink(missing_ok=True)
    if failed:
        print(f"[gallery] {len(failed)} failed: {', '.join(failed)}")
        sys.exit(1)


# Conversion ------------------------------------------------------------------------------ #


def _code_fence(code: str, title: str) -> str:
    ticks = "```"
    while ticks in code:
        ticks += "`"
    return f'{ticks}python title="{title}"\n{code.rstrip()}\n{ticks}'


def _figures(settings: GallerySettings, example: Example) -> list[dict[str, str]]:
    """The cached figures of a script that has been run on its current text."""
    outdir = settings.cache / example.slug
    key_file = settings.cache / f"{example.slug}.key"
    manifest = outdir / "manifest.json"
    if not (
        manifest.exists()
        and key_file.exists()
        and key_file.read_text() == script_hash(example.path)
    ):
        return []
    return json.loads(manifest.read_text())["figures"]


def convert_example(
    settings: GallerySettings, example: Example, order: int
) -> dict:
    """Write the page and the assets of one script; return its card for the grid."""
    outdir = settings.cache / example.slug
    figures = _figures(settings, example)
    stdout = ""
    if figures:
        stdout = json.loads((outdir / "manifest.json").read_text()).get("stdout", "")
    public = settings.public / example.slug
    shutil.rmtree(public, ignore_errors=True)
    public.mkdir(parents=True, exist_ok=True)
    shutil.copy2(example.path, public / example.path.name)
    base = f"/{settings.section}/{example.slug}"
    assets = []
    for figure in figures:
        shutil.copy2(outdir / figure["file"], public / figure["file"])
        assets.append({"kind": figure["kind"], "src": f"{base}/{figure['file']}"})

    parts = []
    if example.body:
        parts.append(sanitize_markdown(example.body).strip())
    for index, asset in enumerate(assets, start=1):
        alt = _yaml_string(f"{example.title}, figure {index}")
        if asset["kind"] == "plotly":
            parts.append(f'<PlotlyFigure src="{asset["src"]}" />')
        else:
            parts.append(f"<NotebookImage src=\"{asset['src']}\" alt={{{alt}}} />")
    parts.append("## Source code")
    parts.append(_code_fence(example.code, example.path.name))
    if stdout.strip():
        parts.append(
            "<details>\n<summary>Printed output</summary>\n\n"
            + nb_tool._fence(stdout)
            + "\n\n</details>"
        )
    imports = ["GalleryHeader"] + (["PlotlyFigure"] if any(a["kind"] == "plotly" for a in assets) else [])
    if any(a["kind"] == "png" for a in assets):
        imports.append("NotebookImage")
    frontmatter = [
        "---",
        f"title: {_yaml_string(example.title)}",
        f"description: {_yaml_string(example.summary)}",
        "sidebar:",
        f"  order: {order}",
        "---",
    ]
    header = (
        f'<GalleryHeader download="{base}/{example.path.name}" '
        f'source="{example.path.relative_to(settings.repo).as_posix()}" '
        f'status="{"run" if figures else "not run"}" />'
    )
    text = (
        "\n".join(frontmatter)
        + "\n\n"
        + "\n".join(
            f"import {name} from '{PACKAGE}/components/{name}.astro';" for name in imports
        )
        + "\n\n"
        + header
        + "\n\n"
        + "\n\n".join(parts)
        + "\n"
    )
    settings.content.mkdir(parents=True, exist_ok=True)
    (settings.content / f"{example.slug}.mdx").write_text(text)
    return {
        "title": example.title,
        "summary": example.summary,
        "href": f"{base}/",
        "group": example.group,
        "thumbnail": assets[0] if assets else None,
    }


def write_index(settings: GallerySettings, cards: list[dict]) -> None:
    readme = settings.source / "README.md"
    intro = sanitize_markdown(readme.read_text()).strip() if readme.exists() else ""
    description = settings.description
    if intro:
        description = _description(intro) or description
    frontmatter = [
        "---",
        f"title: {_yaml_string(settings.title)}",
        f"description: {_yaml_string(description)}",
        "tableOfContents: false",
        "sidebar:",
        "  order: 0",
        "---",
    ]
    text = (
        "\n".join(frontmatter)
        + "\n\n"
        + f"import GalleryGrid from '{PACKAGE}/components/GalleryGrid.astro';\n\n"
        + (intro + "\n\n" if intro else f"{settings.description}\n\n")
        + f"<GalleryGrid items={{{json.dumps(cards, ensure_ascii=False)}}} />\n"
    )
    (settings.content / "index.mdx").write_text(text)


def cmd_convert(settings: GallerySettings, args: argparse.Namespace) -> None:
    found = examples(settings)
    expected = {f"{e.slug}.mdx" for e in found} | {"index.mdx"}
    for stale in settings.content.glob("*.mdx"):
        if stale.name not in expected:
            stale.unlink()
    for stale in settings.public.glob("*/") if settings.public.exists() else []:
        if stale.is_dir() and stale.name not in {e.slug for e in found}:
            shutil.rmtree(stale)
    problems = []
    cards = []
    for order, example in enumerate(found, start=1):
        error_file = settings.cache / f"{example.slug}.error"
        card = convert_example(settings, example, order)
        cards.append(card)
        if error_file.exists():
            problems.append(f"{example.slug}: run failed: {error_file.read_text().strip()}")
        elif card["thumbnail"] is None:
            problems.append(f"{example.slug}: not run or source changed")
        state = "run" if card["thumbnail"] else "not run"
        print(f"[gallery] {example.slug}: {state} -> {settings.section}/{example.slug}.mdx")
    write_index(settings, cards)
    for problem in problems:
        print(f"[gallery] warning: {problem}")
    if args.strict and problems:
        sys.exit(1)


def cmd_clean(settings: GallerySettings, args: argparse.Namespace) -> None:
    shutil.rmtree(settings.cache, ignore_errors=True)
    shutil.rmtree(settings.public, ignore_errors=True)
    for page in settings.content.glob("*.mdx"):
        page.unlink()


def main(argv: list[str] | None = None) -> None:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--docs", help="the site directory (default: . or ./docs)")
    common.add_argument("--source", help="the script directory, relative to --docs")
    common.add_argument("--section", help="the URL section of the pages")
    common.add_argument("--title", help="the title of the gallery page")
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    execute = sub.add_parser(
        "execute", parents=[common], help="run the scripts whose text changed"
    )
    execute.add_argument("--force", action="store_true", help="rerun every script")
    execute.add_argument("--timeout", type=int, default=600, help="seconds per script")
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
