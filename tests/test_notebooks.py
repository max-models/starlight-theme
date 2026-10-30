"""Tests of tools/notebooks.py: the MDX escaping and the conversion of a notebook into a page.

Run with `npm test` (needs uv) or `pytest tests` in an environment with nbformat.
"""

from __future__ import annotations

import base64
import importlib.util
import json
import sys
from pathlib import Path

import nbformat
import pytest

_spec = importlib.util.spec_from_file_location(
    "notebooks", Path(__file__).parents[1] / "tools" / "notebooks.py"
)
notebooks = importlib.util.module_from_spec(_spec)
sys.modules["notebooks"] = notebooks  # dataclasses look the module up
_spec.loader.exec_module(notebooks)

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\nfake").decode()
GIF = base64.b64encode(b"GIF89afake").decode()


@pytest.mark.parametrize(
    ("markdown", "expected"),
    [
        ("a {b} c", "a \\{b\\} c"),
        ("x < y", "x &lt; y"),
        ("keep $a_{i} < b$ math", "keep $a_{i} < b$ math"),
        ("keep `{code}`", "keep `{code}`"),
        ("```py\nd = {1: 2}\n```", "```py\nd = {1: 2}\n```"),
        (r"\(x^2\)", "$x^2$"),
        (r"\[x^2\]", "\n$$\nx^2\n$$\n"),
        # a display block that opens and closes on lines with other text
        ("$$a =\nb.$$\n\nafter", "$$\na =\nb.\n$$\n\nafter"),
        # a one-line display block on its own line
        ("x is\n\n$$y = 1$$\n\nz", "x is\n\n$$\ny = 1\n$$\n\nz"),
        # text after the closing $$ moves to the next line
        ("$$y = 1$$, so", "$$\ny = 1\n$$\n, so"),
        # inside a list item the block keeps the indentation
        ("- item\n\n  $$y = 1$$", "- item\n\n  $$\n  y = 1\n  $$"),
        # $$ in the middle of a sentence is left alone
        ("so $$y = 1$$ here", "so $$y = 1$$ here"),
        ("<br>", "<br />"),
        ('<span style="color: red">x</span>', "<span>x</span>"),
        ("a <!-- note --> b", "a  b"),
    ],
)
def test_sanitize_markdown(markdown, expected):
    assert notebooks.sanitize_markdown(markdown) == expected


def test_cell_hash_ignores_source_format(tmp_path):
    as_string = {
        "cells": [{"cell_type": "code", "source": "a = 1\nb = 2", "metadata": {}}]
    }
    as_lines = {
        "cells": [{"cell_type": "code", "source": ["a = 1\n", "b = 2"], "metadata": {}}]
    }
    (tmp_path / "a.ipynb").write_text(json.dumps(as_string))
    (tmp_path / "b.ipynb").write_text(json.dumps(as_lines))
    assert notebooks.cell_hash(tmp_path / "a.ipynb") == notebooks.cell_hash(
        tmp_path / "b.ipynb"
    )


@pytest.fixture
def project(tmp_path):
    """A repository with docs/ and guides/, configured through docs/package.json."""
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "astro.config.mjs").write_text("")
    (docs / "package.json").write_text(
        json.dumps({"starlight-notebooks": {"source": "../guides"}})
    )
    (tmp_path / "guides").mkdir()
    return tmp_path


def write_notebook(path: Path, cells: list, **metadata) -> None:
    nb = nbformat.v4.new_notebook(cells=cells, metadata=metadata)
    nbformat.write(nb, path)


def run(project: Path, *argv: str, monkeypatch) -> None:
    monkeypatch.chdir(project / "docs")
    notebooks.main(list(argv))


def test_settings_from_package_json(project, monkeypatch):
    monkeypatch.chdir(project)  # finds docs/ from the repository root too
    monkeypatch.delenv("DOCS_MPI_RANKS", raising=False)
    args = notebooks.argparse.Namespace(
        docs=None, source=None, section=None, mpi_ranks=None
    )
    settings = notebooks.load_settings(args)
    assert settings.docs == (project / "docs").resolve()
    assert settings.source == (project / "guides").resolve()
    assert settings.section == "guides"
    assert settings.mpi_ranks == 1
    monkeypatch.setenv("DOCS_MPI_RANKS", "4")
    assert notebooks.load_settings(args).mpi_ranks == 4
    args.mpi_ranks = 2  # the command line wins
    assert notebooks.load_settings(args).mpi_ranks == 2


def test_convert_executed_notebook(project, monkeypatch):
    v4 = nbformat.v4
    cells = [
        v4.new_markdown_cell(
            "# The *title*\n\nA description that is long enough to be used."
        ),
        v4.new_code_cell(
            "print(1)\nprint(2)",
            outputs=[
                v4.new_output("stream", name="stdout", text="1\n"),
                v4.new_output("stream", name="stdout", text="2\n"),
            ],
        ),
        v4.new_code_cell(
            "plot()",
            metadata={"tags": ["fold-input"]},
            outputs=[
                v4.new_output("display_data", data={"image/png": PNG}),
                v4.new_output("display_data", data={"image/gif": GIF}),
            ],
        ),
        v4.new_code_cell(
            "table()",
            outputs=[
                v4.new_output(
                    "execute_result",
                    data={"text/html": "<table></table>", "text/plain": "t"},
                ),
            ],
        ),
        v4.new_code_cell("secret()", metadata={"tags": ["remove-cell"]}),
        v4.new_code_cell(
            "boom()",
            outputs=[
                v4.new_output(
                    "error",
                    ename="ValueError",
                    evalue="boom",
                    traceback=["ValueError: boom"],
                ),
            ],
        ),
    ]
    source = project / "guides" / "my_guide.ipynb"
    write_notebook(source, cells, docs_order=7)
    # an "executed" copy in the cache, as `execute` leaves it
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "my-guide.ipynb", cells)
    stale = project / "docs" / "src" / "content" / "docs" / "guides" / "deleted.mdx"
    stale.parent.mkdir(parents=True)
    stale.write_text("")
    stale_public = project / "docs" / "public" / "guides" / "deleted"
    stale_public.mkdir(parents=True)
    (stale_public / "1.html").write_text("")

    with pytest.raises(SystemExit):  # the uncaught error in the last cell
        run(project, "convert", "--strict", monkeypatch=monkeypatch)

    page = (stale.parent / "my-guide.mdx").read_text()
    assert not stale.exists() and not stale_public.exists()
    assert 'title: "The title"' in page
    assert 'description: "A description that is long enough to be used."' in page
    assert "  order: 7" in page
    assert (
        "import NotebookHeader from '@max-models/starlight-theme/components/NotebookHeader.astro';"
        in page
    )
    assert "import NotebookImage from" in page and "import RawHtml from" in page
    assert '<NotebookHeader download="/guides/my-guide/my_guide.ipynb"' in page
    assert 'status="executed"' in page
    assert "```text\n1\n2\n```" in page  # the two prints are one block
    assert (
        "<details>\n<summary>Show code</summary>\n\n```python\nplot()\n```\n\n</details>"
        in page
    )
    assert '<NotebookImage src="/guides/my-guide/1.png" />' in page
    assert '<NotebookImage src="/guides/my-guide/2.gif" />' in page
    assert '<RawHtml html={"<table></table>"} />' in page
    assert "secret()" not in page
    public = project / "docs" / "public" / "guides" / "my-guide"
    assert sorted(p.name for p in public.iterdir()) == [
        "1.png",
        "2.gif",
        "my_guide.ipynb",
    ]


SCENE_HTML = ["<!DOCTYPE html>\n", "<html><body>vtk.js scene</body></html>\n"]


def test_pyvista_scene(project, monkeypatch):
    v4 = nbformat.v4
    scene = v4.new_output(
        "display_data",
        data={"text/html": SCENE_HTML, "image/png": PNG, "text/plain": "<Scene>"},
        metadata={"pyvista-scene": {"alt": 'A "torus" {with} braces'}},
    )
    titled = v4.new_output(
        "execute_result",
        data={"text/html": "<html>second</html>", "image/png": PNG},
        metadata={"pyvista-scene": {"title": "Field lines"}},
    )
    cells = [
        v4.new_markdown_cell("# Scenes"),
        v4.new_code_cell(
            "plot()", outputs=[v4.new_output("display_data", data={"image/png": PNG})]
        ),
        v4.new_code_cell("scene(plotter)", outputs=[scene, titled]),
        v4.new_code_cell(
            "table()",
            outputs=[
                v4.new_output("display_data", data={"text/html": "<table></table>"})
            ],
        ),
    ]
    write_notebook(project / "guides" / "scenes.ipynb", cells)
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "scenes.ipynb", cells)
    run(project, "convert", monkeypatch=monkeypatch)

    content = project / "docs" / "src" / "content" / "docs" / "guides"
    page = (content / "scenes.mdx").read_text()
    assert (
        "import PyVistaScene from '@max-models/starlight-theme/components/PyVistaScene.astro';"
        in page
    )
    assert (
        '<PyVistaScene src="/guides/scenes/2.html" image="/guides/scenes/2.png" '
        'alt={"A \\"torus\\" {with} braces"} />' in page
    )
    assert (
        '<PyVistaScene src="/guides/scenes/3.html" image="/guides/scenes/3.png" '
        'alt={"Field lines"} title={"Field lines"} />' in page
    )
    assert "vtk.js scene" not in page  # the scene is a file, not inlined
    assert '<RawHtml html={"<table></table>"} />' in page  # other HTML still is
    public = project / "docs" / "public" / "guides" / "scenes"
    assert sorted(p.name for p in public.iterdir()) == [
        "1.png",
        "2.html",
        "2.png",
        "3.html",
        "3.png",
        "scenes.ipynb",
    ]
    assert (public / "2.html").read_text() == "".join(SCENE_HTML)
    assert (public / "2.png").read_bytes() == base64.b64decode(PNG)

    # a later conversion without the scenes leaves none of their files behind
    cells[2] = v4.new_code_cell("scene(plotter)")
    write_notebook(project / "guides" / "scenes.ipynb", cells)
    write_notebook(cache / "scenes.ipynb", cells)
    run(project, "convert", monkeypatch=monkeypatch)
    assert "PyVistaScene" not in (content / "scenes.mdx").read_text()
    assert sorted(p.name for p in public.iterdir()) == ["1.png", "scenes.ipynb"]


def test_plotly_figure(project, monkeypatch):
    v4 = nbformat.v4
    spec = {"data": [{"type": "scatter", "x": [0, 1], "y": [1, 2]}], "layout": {}}
    tagged = v4.new_output(
        "display_data",
        data={
            "application/vnd.plotly.v1+json": spec,
            "text/html": "<div>inline-plotly-html</div>",
            "text/plain": "<Plotly figure>",
        },
        metadata={"plotly-figure": {"title": "Density *profile*"}},
    )
    plain = v4.new_output(
        "execute_result",
        data={"application/vnd.plotly.v1+json": spec, "text/html": "<div></div>"},
    )
    cells = [
        v4.new_markdown_cell("# Figures"),
        v4.new_code_cell("plot(backend='plotly')", outputs=[tagged]),
        v4.new_code_cell("fig.show()", outputs=[plain]),
    ]
    write_notebook(project / "guides" / "figures.ipynb", cells)
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "figures.ipynb", cells)
    run(project, "convert", monkeypatch=monkeypatch)

    page = (
        project / "docs" / "src" / "content" / "docs" / "guides" / "figures.mdx"
    ).read_text()
    assert (
        "import PlotlyFigure from '@max-models/starlight-theme/components/PlotlyFigure.astro';"
        in page
    )
    assert '<PlotlyFigure src="/guides/figures/1.plotly.json" />' in page
    assert '<PlotlyFigure src="/guides/figures/2.plotly.json" />' in page
    assert "Density" in page and "profile" in page
    assert "inline-plotly-html" not in page  # not inlined as HTML
    public = project / "docs" / "public" / "guides" / "figures"
    assert json.loads((public / "1.plotly.json").read_text()) == spec


def test_pyvista_scene_without_picture(project, monkeypatch):
    v4 = nbformat.v4
    cells = [
        v4.new_code_cell(
            "scene(plotter)",
            outputs=[
                v4.new_output(
                    "display_data",
                    data={"text/html": "<html></html>"},
                    metadata={"pyvista-scene": {}},
                )
            ],
        )
    ]
    write_notebook(project / "guides" / "bare.ipynb", cells)
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "bare.ipynb", cells)
    run(project, "convert", monkeypatch=monkeypatch)
    page = (
        project / "docs" / "src" / "content" / "docs" / "guides" / "bare.mdx"
    ).read_text()
    assert '<PyVistaScene src="/guides/bare/1.html" alt={"A 3-D scene"} />' in page
    assert (project / "docs" / "public" / "guides" / "bare" / "1.html").exists()


def test_list(project, monkeypatch, capsys):
    v4 = nbformat.v4
    for name in ("index", "b_second", "a_first"):
        write_notebook(project / "guides" / f"{name}.ipynb", [v4.new_code_cell("1")])
    run(project, "list", monkeypatch=monkeypatch)
    assert json.loads(capsys.readouterr().out) == ["index", "a-first", "b-second"]


def test_execute_only(project, monkeypatch):
    v4 = nbformat.v4
    for name in ("one", "two"):
        write_notebook(project / "guides" / f"{name}.ipynb", [v4.new_code_cell("1")])
    executed = []

    def fake_execute(path, target, timeout, nranks):
        target.parent.mkdir(parents=True, exist_ok=True)
        executed.append(path.stem)

    monkeypatch.setattr(notebooks, "execute_notebook", fake_execute)
    run(project, "execute", "--only", "two", monkeypatch=monkeypatch)
    assert executed == ["two"]
    with pytest.raises(SystemExit, match="no notebooks three"):
        run(project, "execute", "--only", "three", monkeypatch=monkeypatch)


def test_changed_notebook_is_not_run(project, monkeypatch):
    v4 = nbformat.v4
    source = project / "guides" / "index.ipynb"
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "index.ipynb", [v4.new_code_cell("a = 1")])
    write_notebook(source, [v4.new_code_cell("a = 2")], guide={"order": 3})
    run(project, "convert", monkeypatch=monkeypatch)
    page = (
        project / "docs" / "src" / "content" / "docs" / "guides" / "index.mdx"
    ).read_text()
    assert 'status="not run"' in page
    assert "  order: 3" in page  # the older `guide.order` metadata
    with pytest.raises(SystemExit):
        run(project, "convert", "--strict", monkeypatch=monkeypatch)


def test_notebooks_in_subdirectories(project, monkeypatch):
    v4 = nbformat.v4
    guides = project / "guides"
    (guides / "drawing").mkdir()
    (guides / "drawing" / ".ipynb_checkpoints").mkdir()
    write_notebook(
        guides / "drawing" / "b_paths.ipynb", [v4.new_markdown_cell("# Paths")]
    )
    write_notebook(
        guides / "drawing" / ".ipynb_checkpoints" / "b_paths-checkpoint.ipynb", []
    )
    write_notebook(guides / "a_intro.ipynb", [v4.new_markdown_cell("# Intro")])
    run(project, "convert", monkeypatch=monkeypatch)
    content = project / "docs" / "src" / "content" / "docs" / "guides"
    # with no index notebook, an index page with the grid of the notebooks
    assert sorted(p.name for p in content.iterdir()) == [
        "a-intro.mdx",
        "b-paths.mdx",
        "index.mdx",
    ]
    grid = (content / "index.mdx").read_text()
    assert 'title: "Guides"' in grid
    assert '"group": "Drawing"' in grid and '"href": "/guides/b-paths/"' in grid
    page = (content / "b-paths.mdx").read_text()
    assert (
        '<NotebookHeader download="/guides/b-paths/b_paths.ipynb" source="guides/drawing/b_paths.ipynb"'
        in page
    )
    assert "  order: 2" in page  # sorted by file name across the directories

    # two notebooks that would be the same page
    write_notebook(guides / "a-intro.ipynb", [])
    (guides / "a_intro.ipynb").rename(guides / "drawing" / "a_intro.ipynb")
    with pytest.raises(SystemExit, match="would both be the page a-intro"):
        run(project, "convert", monkeypatch=monkeypatch)


def test_fold_output(project, monkeypatch):
    v4 = nbformat.v4
    cells = [
        v4.new_code_cell(
            "print(fig)",
            metadata={
                "tags": ["hide-input", "fold-output"],
                "fold_summary": "TikZ <code>",
            },
            outputs=[
                v4.new_output("stream", name="stdout", text="\\begin{tikzpicture}\n")
            ],
        ),
        v4.new_code_cell(
            "print(1)",
            metadata={"tags": ["fold-output"]},
            outputs=[v4.new_output("stream", name="stdout", text="1\n")],
        ),
        v4.new_code_cell(
            "x = 1", metadata={"tags": ["fold-output"]}
        ),  # no output, no box
    ]
    write_notebook(project / "guides" / "folded.ipynb", cells)
    run(project, "convert", monkeypatch=monkeypatch)
    page = (
        project / "docs" / "src" / "content" / "docs" / "guides" / "folded.mdx"
    ).read_text()
    assert "print(fig)" not in page
    assert (
        "<details>\n<summary>TikZ &lt;code></summary>\n\n```text\n\\begin{tikzpicture}\n```\n\n</details>"
        in page
    )
    assert (
        "```python\nprint(1)\n```\n\n<details>\n<summary>Show output</summary>\n\n```text\n1\n```\n\n</details>"
        in page
    )
    assert page.count("<details>") == 2


def _grid_items(page: str) -> list[dict]:
    start = page.index("<GalleryGrid items={") + len("<GalleryGrid items={")
    return json.JSONDecoder().raw_decode(page, start)[0]


def test_grid_on_the_index_notebook(project, monkeypatch):
    v4 = nbformat.v4
    guides = project / "guides"
    write_notebook(
        guides / "index.ipynb",
        [
            v4.new_markdown_cell("# Guides\n\nAll of them."),
            v4.new_markdown_cell("The list:", metadata={"tags": ["notebook-grid"]}),
            v4.new_markdown_cell("After the grid."),
        ],
    )
    plot = [
        v4.new_markdown_cell("# Plotting\n\nA plot of something interesting."),
        v4.new_code_cell(
            "plot()",
            outputs=[v4.new_output("display_data", data={"image/png": PNG})],
        ),
    ]
    write_notebook(guides / "plotting.ipynb", plot, docs_order=1)
    write_notebook(
        guides / "basics.ipynb", [v4.new_markdown_cell("# Basics")], docs_order=2
    )
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "plotting.ipynb", plot)
    run(project, "convert", monkeypatch=monkeypatch)
    content = project / "docs" / "src" / "content" / "docs" / "guides"
    page = (content / "index.mdx").read_text()
    assert "import GalleryGrid from" in page
    assert (
        page.index("The list:")
        < page.index("<GalleryGrid")
        < page.index("After the grid.")
    )
    assert 'filter={false} filterLabel="Filter notebooks…"' in page
    items = _grid_items(page)
    # in sidebar order, the first image as the thumbnail
    assert [item["title"] for item in items] == ["Plotting", "Basics"]
    assert items[0]["summary"] == "A plot of something interesting."
    assert items[0]["thumbnail"] == {"kind": "png", "src": "/guides/plotting/1.png"}
    assert items[0]["placeholder"] == ""
    assert items[1]["thumbnail"] is None and items[1]["placeholder"] == "not run"

    # without the tag, at the end; with "grid": false, none
    write_notebook(guides / "index.ipynb", [v4.new_markdown_cell("# Guides")])
    run(project, "convert", monkeypatch=monkeypatch)
    assert (
        (content / "index.mdx")
        .read_text()
        .rstrip()
        .endswith('filterLabel="Filter notebooks…" />')
    )
    (project / "docs" / "package.json").write_text(
        json.dumps({"starlight-notebooks": {"source": "../guides", "grid": False}})
    )
    run(project, "convert", monkeypatch=monkeypatch)
    assert "GalleryGrid" not in (content / "index.mdx").read_text()


def test_no_generated_index_next_to_a_hand_written_one(project, monkeypatch):
    content = project / "docs" / "src" / "content" / "docs" / "guides"
    content.mkdir(parents=True)
    (content / "index.md").write_text("---\ntitle: Guides\n---\n")
    write_notebook(project / "guides" / "a.ipynb", [])
    run(project, "convert", monkeypatch=monkeypatch)
    assert sorted(p.name for p in content.iterdir()) == ["a.mdx", "index.md"]


def test_launch_buttons_off_under_mpi_or_metadata(project, monkeypatch):
    guides = project / "guides"
    write_notebook(guides / "plain.ipynb", [])
    write_notebook(guides / "opted_out.ipynb", [], docs_launch=False)
    run(project, "convert", monkeypatch=monkeypatch)
    content = project / "docs" / "src" / "content" / "docs" / "guides"
    assert "launch={false}" not in (content / "plain.mdx").read_text()
    assert "launch={false}" in (content / "opted-out.mdx").read_text()
    run(project, "convert", "--mpi-ranks", "2", monkeypatch=monkeypatch)
    assert "launch={false}" in (content / "plain.mdx").read_text()


def test_blockquotes_survive():
    assert notebooks.sanitize_markdown("> **Note** a {b} if x < 1\n> > nested") == (
        "> **Note** a \\{b\\} if x &lt; 1\n> > nested"
    )
