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
        ("<br>", "<br />"),
        ('<span style="color: red">x</span>', "<span>x</span>"),
        ("a <!-- note --> b", "a  b"),
    ],
)
def test_sanitize_markdown(markdown, expected):
    assert notebooks.sanitize_markdown(markdown) == expected


def test_cell_hash_ignores_source_format(tmp_path):
    as_string = {"cells": [{"cell_type": "code", "source": "a = 1\nb = 2", "metadata": {}}]}
    as_lines = {"cells": [{"cell_type": "code", "source": ["a = 1\n", "b = 2"], "metadata": {}}]}
    (tmp_path / "a.ipynb").write_text(json.dumps(as_string))
    (tmp_path / "b.ipynb").write_text(json.dumps(as_lines))
    assert notebooks.cell_hash(tmp_path / "a.ipynb") == notebooks.cell_hash(tmp_path / "b.ipynb")


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
    args = notebooks.argparse.Namespace(docs=None, source=None, section=None, mpi_ranks=None)
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
        v4.new_markdown_cell("# The *title*\n\nA description that is long enough to be used."),
        v4.new_code_cell("print(1)\nprint(2)", outputs=[
            v4.new_output("stream", name="stdout", text="1\n"),
            v4.new_output("stream", name="stdout", text="2\n"),
        ]),
        v4.new_code_cell("plot()", metadata={"tags": ["fold-input"]}, outputs=[
            v4.new_output("display_data", data={"image/png": PNG}),
            v4.new_output("display_data", data={"image/gif": GIF}),
        ]),
        v4.new_code_cell("table()", outputs=[
            v4.new_output("execute_result", data={"text/html": "<table></table>", "text/plain": "t"}),
        ]),
        v4.new_code_cell("secret()", metadata={"tags": ["remove-cell"]}),
        v4.new_code_cell("boom()", outputs=[
            v4.new_output("error", ename="ValueError", evalue="boom", traceback=["ValueError: boom"]),
        ]),
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

    with pytest.raises(SystemExit):  # the uncaught error in the last cell
        run(project, "convert", "--strict", monkeypatch=monkeypatch)

    page = (stale.parent / "my-guide.mdx").read_text()
    assert not stale.exists()
    assert 'title: "The title"' in page
    assert 'description: "A description that is long enough to be used."' in page
    assert "  order: 7" in page
    assert "import NotebookHeader from '@max-models/starlight-theme/components/NotebookHeader.astro';" in page
    assert "import NotebookImage from" in page and "import RawHtml from" in page
    assert '<NotebookHeader download="/guides/my-guide/my_guide.ipynb"' in page
    assert 'status="executed"' in page
    assert "```text\n1\n2\n```" in page  # the two prints are one block
    assert "<details>\n<summary>Show code</summary>\n\n```python\nplot()\n```\n\n</details>" in page
    assert '<NotebookImage src="/guides/my-guide/1.png" />' in page
    assert '<NotebookImage src="/guides/my-guide/2.gif" />' in page
    assert '<RawHtml html={"<table></table>"} />' in page
    assert "secret()" not in page
    public = project / "docs" / "public" / "guides" / "my-guide"
    assert sorted(p.name for p in public.iterdir()) == ["1.png", "2.gif", "my_guide.ipynb"]


def test_changed_notebook_is_not_run(project, monkeypatch):
    v4 = nbformat.v4
    source = project / "guides" / "index.ipynb"
    cache = project / "docs" / ".cache" / "notebooks"
    cache.mkdir(parents=True)
    write_notebook(cache / "index.ipynb", [v4.new_code_cell("a = 1")])
    write_notebook(source, [v4.new_code_cell("a = 2")], guide={"order": 3})
    run(project, "convert", monkeypatch=monkeypatch)
    page = (project / "docs" / "src" / "content" / "docs" / "guides" / "index.mdx").read_text()
    assert 'status="not run"' in page
    assert "  order: 3" in page  # the older `guide.order` metadata
    with pytest.raises(SystemExit):
        run(project, "convert", "--strict", monkeypatch=monkeypatch)


def test_notebooks_in_subdirectories(project, monkeypatch):
    v4 = nbformat.v4
    guides = project / "guides"
    (guides / "drawing").mkdir()
    (guides / "drawing" / ".ipynb_checkpoints").mkdir()
    write_notebook(guides / "drawing" / "b_paths.ipynb", [v4.new_markdown_cell("# Paths")])
    write_notebook(guides / "drawing" / ".ipynb_checkpoints" / "b_paths-checkpoint.ipynb", [])
    write_notebook(guides / "a_intro.ipynb", [v4.new_markdown_cell("# Intro")])
    run(project, "convert", monkeypatch=monkeypatch)
    content = project / "docs" / "src" / "content" / "docs" / "guides"
    assert sorted(p.name for p in content.iterdir()) == ["a-intro.mdx", "b-paths.mdx"]
    page = (content / "b-paths.mdx").read_text()
    assert '<NotebookHeader download="/guides/b-paths/b_paths.ipynb" source="guides/drawing/b_paths.ipynb"' in page
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
            metadata={"tags": ["hide-input", "fold-output"], "fold_summary": "TikZ <code>"},
            outputs=[v4.new_output("stream", name="stdout", text="\\begin{tikzpicture}\n")],
        ),
        v4.new_code_cell(
            "print(1)",
            metadata={"tags": ["fold-output"]},
            outputs=[v4.new_output("stream", name="stdout", text="1\n")],
        ),
        v4.new_code_cell("x = 1", metadata={"tags": ["fold-output"]}),  # no output, no box
    ]
    write_notebook(project / "guides" / "folded.ipynb", cells)
    run(project, "convert", monkeypatch=monkeypatch)
    page = (project / "docs" / "src" / "content" / "docs" / "guides" / "folded.mdx").read_text()
    assert "print(fig)" not in page
    assert "<details>\n<summary>TikZ &lt;code&gt;</summary>\n\n```text\n\\begin{tikzpicture}\n```\n\n</details>" in page
    assert "```python\nprint(1)\n```\n\n<details>\n<summary>Show output</summary>\n\n```text\n1\n```\n\n</details>" in page
    assert page.count("<details>") == 2
