"""Run one gallery script and collect the figures it shows (used by gallery.py).

``python gallery_runner.py <script> <outdir>``

The script runs as ``__main__``, unchanged, in a scratch directory. Whatever it passes to
``plt.show()`` / ``fig.show()`` (or leaves open at the end, for matplotlib) is saved to
``<outdir>``: matplotlib figures as ``fig-N.png``, Plotly figures as ``fig-N.plotly.json``.
``manifest.json`` lists them in order together with the text the script printed.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import runpy
import sys
import tempfile
import traceback
from pathlib import Path

os.environ.setdefault("MPLBACKEND", "Agg")


class Collector:
    def __init__(self, outdir: Path) -> None:
        self.outdir = outdir
        self.figures: list[dict[str, str]] = []

    def _next(self, suffix: str) -> Path:
        return self.outdir / f"fig-{len(self.figures) + 1}{suffix}"

    def add_plotly(self, fig) -> None:
        import plotly.io as pio

        path = self._next(".plotly.json")
        path.write_text(pio.to_json(fig, validate=False))
        self.figures.append({"kind": "plotly", "file": path.name})

    def add_matplotlib(self, fig) -> None:
        path = self._next(".png")
        fig.savefig(path, dpi=200, bbox_inches="tight", facecolor=fig.get_facecolor())
        self.figures.append({"kind": "png", "file": path.name})

    def flush_matplotlib(self) -> None:
        if "matplotlib.pyplot" not in sys.modules:
            return
        import matplotlib.pyplot as plt

        for number in plt.get_fignums():
            self.add_matplotlib(plt.figure(number))
        plt.close("all")


def install_hooks(collector: Collector) -> None:
    try:
        import plotly.io as pio

        def show(fig, *args, **kwargs):
            collector.add_plotly(fig)

        pio.show = show  # BaseFigure.show looks it up at call time
    except ImportError:
        pass
    try:
        import matplotlib.pyplot as plt

        def show(*args, **kwargs):
            collector.flush_matplotlib()

        plt.show = show
    except ImportError:
        pass


def main(script: Path, outdir: Path) -> int:
    outdir.mkdir(parents=True, exist_ok=True)
    for stale in outdir.iterdir():
        stale.unlink()
    collector = Collector(outdir)
    install_hooks(collector)
    printed = io.StringIO()
    status = 0
    sys.argv = [str(script)]
    sys.path.insert(0, str(script.parent))
    with tempfile.TemporaryDirectory() as scratch:
        os.chdir(scratch)
        try:
            with contextlib.redirect_stdout(printed):
                runpy.run_path(str(script), run_name="__main__")
                collector.flush_matplotlib()
        except SystemExit as exit_:
            status = 0 if exit_.code in (None, 0) else 1
        except BaseException:
            traceback.print_exc()
            status = 1
    (outdir / "manifest.json").write_text(
        json.dumps({"figures": collector.figures, "stdout": printed.getvalue()})
    )
    if status == 0 and not collector.figures:
        print("the script showed no figure: call plt.show() or fig.show()", file=sys.stderr)
        status = 1
    return status


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()))
