"""Tests of tools/gallery.py and gallery_runner.py: the docstring split, the capture of the
figures a script shows, and the conversion of a script into a page.

Run with `npm test` (needs uv) or `pytest tests` in an environment with nbformat, matplotlib and plotly.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from argparse import Namespace
from pathlib import Path

import pytest

TOOLS = Path(__file__).parents[1] / "tools"
sys.path.insert(0, str(TOOLS))


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, TOOLS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


notebooks = _load("notebooks")
gallery = _load("gallery")

SCRIPT = '''"""A tidy title.

The summary of the card, with $x^2$ math and {braces}.

More text below.
"""

import plotly.graph_objects as go

print("hello")
go.Figure(go.Scatter(x=[1, 2], y=[3, 4])).show()
'''


@pytest.fixture
def project(tmp_path: Path) -> gallery.GallerySettings:
    docs = tmp_path / "docs"
    docs.mkdir()
    (docs / "astro.config.mjs").write_text("")
    source = tmp_path / "examples"
    (source / "group_one").mkdir(parents=True)
    (source / "group_one" / "first_example.py").write_text(SCRIPT)
    (source / "second.py").write_text('"""Second"""\nimport matplotlib.pyplot as plt\nplt.plot([1, 2])\nplt.show()\n')
    (source / "_helper.py").write_text("")
    return gallery.GallerySettings(docs=docs, source=source, section="examples", mpi_ranks=1)


def test_parse_example_splits_the_docstring(project):
    example = gallery.parse_example(project, project.source / "group_one" / "first_example.py")
    assert example.title == "A tidy title"
    assert example.group == "Group one"
    assert example.summary.startswith("The summary of the card")
    assert example.body.endswith("More text below.")
    assert example.code.startswith("import plotly")
    assert '"""' not in example.code


def test_examples_skip_private_files_and_sort_ungrouped_first(project):
    assert [e.slug for e in gallery.examples(project)] == ["second", "first-example"]


def test_duplicate_slugs_are_an_error(project):
    (project.source / "group_one" / "second.py").write_text("")
    with pytest.raises(SystemExit):
        gallery.examples(project)


def test_runner_collects_figures_and_output(tmp_path):
    pytest.importorskip("plotly")
    pytest.importorskip("matplotlib")
    script = tmp_path / "script.py"
    script.write_text(
        SCRIPT + "import matplotlib.pyplot as plt\nplt.plot([1, 2])\n"  # left open, no show()
    )
    outdir = tmp_path / "out"
    result = subprocess.run(
        [sys.executable, str(TOOLS / "gallery_runner.py"), str(script), str(outdir)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    manifest = json.loads((outdir / "manifest.json").read_text())
    assert [f["kind"] for f in manifest["figures"]] == ["plotly", "png"]
    assert manifest["stdout"] == "hello\n"
    assert (outdir / "fig-2.png").read_bytes().startswith(b"\x89PNG")
    assert json.loads((outdir / "fig-1.plotly.json").read_text())["data"][0]["y"] == [3, 4]


def test_runner_fails_without_a_figure(tmp_path):
    script = tmp_path / "script.py"
    script.write_text("x = 1\n")
    result = subprocess.run(
        [sys.executable, str(TOOLS / "gallery_runner.py"), str(script), str(tmp_path / "out")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 1
    assert "no figure" in result.stderr


def test_convert_writes_pages_and_index(project):
    # a cached run of the first example
    example = gallery.parse_example(project, project.source / "group_one" / "first_example.py")
    outdir = project.cache / example.slug
    outdir.mkdir(parents=True)
    (outdir / "fig-1.plotly.json").write_text('{"data": [], "layout": {}}')
    (outdir / "manifest.json").write_text(
        json.dumps({"figures": [{"kind": "plotly", "file": "fig-1.plotly.json"}], "stdout": "hello\n"})
    )
    (project.cache / f"{example.slug}.key").write_text(gallery.script_hash(example.path))

    with pytest.raises(SystemExit):  # the second example was not run
        gallery.cmd_convert(project, Namespace(strict=True))

    page = (project.content / "first-example.mdx").read_text()
    assert 'title: "A tidy title"' in page
    assert '<PlotlyFigure src="/examples/first-example/fig-1.plotly.json" />' in page
    assert "\\{braces\\}" in page and "$x^2$" in page
    assert '```python title="first_example.py"' in page
    assert "Printed output" in page
    assert (project.public / "first-example" / "fig-1.plotly.json").exists()
    assert (project.public / "first-example" / "first_example.py").exists()

    index = (project.content / "index.mdx").read_text()
    assert "GalleryGrid" in index and '"group": "Group one"' in index
    assert '"thumbnail": null' in index  # the example that has not run
    assert "not run" in (project.content / "second.mdx").read_text()
