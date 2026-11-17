"""Tests of tools/pyodide_wheels.py and of the Python glue of the live demos (lib/pyodide.mjs).

Run with `npm test` (needs uv) or `pytest tests`.
"""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).parents[1]
_spec = importlib.util.spec_from_file_location(
    "pyodide_wheels", ROOT / "tools" / "pyodide_wheels.py"
)
pyodide_wheels = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(pyodide_wheels)

RUN_DEMO = re.search(
    r"export const RUN_DEMO = `(.*?)`;",
    (ROOT / "lib" / "pyodide.mjs").read_text(),
    re.DOTALL,
).group(1)


def test_requirement_name():
    assert pyodide_wheels.requirement_name("cunumpy>=0.7.2") == "cunumpy"
    assert (
        pyodide_wheels.requirement_name(
            "Scope_Profiler [h5] >=0.8; python_version>'3.10'"
        )
        == "scope-profiler"
    )


def test_git_sources_keeps_runtime_git_dependencies_in_order():
    pyproject = {
        "project": {
            "dependencies": ["numpy", "maybempi>=0.1", "cunumpy", "local"],
            "optional-dependencies": {"docs": ["plasma-plots"]},
        },
        "tool": {
            "uv": {
                "sources": {
                    "cunumpy": {
                        "git": "https://github.com/max-models/cunumpy",
                        "branch": "devel",
                    },
                    "maybempi": [
                        {
                            "git": "https://github.com/max-models/maybempi",
                            "branch": "devel",
                        }
                    ],
                    "plasma_plots": {
                        "git": "https://github.com/max-models/plasma-plots",
                        "branch": "devel",
                    },
                    "local": {"path": "../local"},
                }
            }
        },
    }
    assert [name for name, _ in pyodide_wheels.git_sources(pyproject)] == [
        "maybempi",
        "cunumpy",
    ]


def demo(run):
    namespace = {"run": run}
    exec(RUN_DEMO, namespace)  # noqa: S102 (the glue the pages run)
    return json.loads(namespace["_demo_json"](json.dumps({"a": 2})))


def test_run_demo_turns_numpy_into_json_and_nan_into_null():
    out = demo(
        lambda a: {
            "figure": {"data": [{"y": np.array([1.0, np.nan, a])}]},
            "numbers": {"n": np.int64(3)},
        }
    )
    assert out == {"figure": {"data": [{"y": [1.0, None, 2.0]}]}, "numbers": {"n": 3}}


def test_run_demo_needs_a_figure_or_numbers():
    with pytest.raises(TypeError, match="figure"):
        demo(lambda a: [1, 2])


@pytest.mark.skipif(shutil.which("uv") is None, reason="needs uv")
def test_build_writes_the_project_wheel(tmp_path):
    project = tmp_path / "demo_pkg"
    (project / "src" / "demo_pkg").mkdir(parents=True)
    (project / "src" / "demo_pkg" / "__init__.py").write_text("")
    (project / "pyproject.toml").write_text(
        '[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n'
        '[project]\nname = "demo-pkg"\nversion = "0.1.0"\n'
    )
    out = tmp_path / "docs" / "public" / "pyodide"
    try:
        wheels = pyodide_wheels.build(project, out, sources=True)
    except subprocess.CalledProcessError:
        pytest.skip("uv could not build (no network for the build backend?)")
    assert wheels == ["demo_pkg-0.1.0-py2.py3-none-any.whl"]
    assert json.loads((out / "wheels.json").read_text()) == {"wheels": wheels}
