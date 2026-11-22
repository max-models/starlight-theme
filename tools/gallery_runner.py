"""Run one gallery script and collect the figures it shows (used by gallery.py).

``python gallery_runner.py <script> <outdir>``

The script runs as ``__main__``, unchanged, in a scratch directory. Whatever it passes to
``plt.show()`` / ``fig.show()`` (or leaves open at the end, for matplotlib) is saved to
``<outdir>``: matplotlib figures as ``fig-N.png``, together with ``fig-N.dark.png`` for dark mode
(the same figure with its black text and lines turned light and its white background dark),
Plotly figures as ``fig-N.plotly.json``.
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


# the ink and paper of the docs' dark mode (styles/theme.css)
DARK_INK = "#eeeadd"
DARK_PAPER = "#07131d"


def _dark_color(color, ink, paper):
    """``color`` for a dark background: black and dark greys become ``ink``, white and light
    greys ``paper``; other colours and transparent ones stay."""
    from matplotlib.colors import to_rgba

    try:
        r, g, b, a = to_rgba(color)
    except (TypeError, ValueError):
        return color
    if a == 0 or max(r, g, b) - min(r, g, b) > 0.1:
        return color
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if luminance < 0.35:
        return (*to_rgba(ink)[:3], a)
    if luminance > 0.9:
        return (*to_rgba(paper)[:3], a)
    return color


def darken(fig, ink=DARK_INK, paper=DARK_PAPER) -> None:
    """Recolour a matplotlib figure in place for a dark page: text, axes, ticks, grid and legend
    frames light, the figure and axes backgrounds dark. The colours of the data (lines in colour,
    images, colour maps) stay."""
    from matplotlib.collections import Collection
    from matplotlib.image import AxesImage
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch
    from matplotlib.text import Text

    def swap(color):
        return _dark_color(color, ink, paper)

    fig.patch.set_facecolor(swap(fig.patch.get_facecolor()))
    for artist in fig.findobj():
        if artist is fig.patch or isinstance(artist, AxesImage):
            continue
        if isinstance(artist, Text):
            artist.set_color(swap(artist.get_color()))
        elif isinstance(artist, Line2D):
            artist.set_color(swap(artist.get_color()))
            artist.set_markerfacecolor(swap(artist.get_markerfacecolor()))
            artist.set_markeredgecolor(swap(artist.get_markeredgecolor()))
        elif isinstance(artist, Patch):
            artist.set_facecolor(swap(artist.get_facecolor()))
            artist.set_edgecolor(swap(artist.get_edgecolor()))
        elif isinstance(artist, Collection) and artist.get_array() is None:
            artist.set_facecolor([swap(c) for c in artist.get_facecolor()])
            artist.set_edgecolor([swap(c) for c in artist.get_edgecolor()])
    for ax in fig.axes:
        ax.tick_params(which="both", colors=ink)


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
        entry = {"kind": "png", "file": path.name}
        try:
            darken(fig)
            dark = path.with_suffix(".dark.png")
            fig.savefig(
                dark, dpi=200, bbox_inches="tight", facecolor=fig.get_facecolor()
            )
            entry["dark"] = dark.name
        except (
            Exception
        ) as error:  # a figure that cannot be recoloured keeps its light image
            print(f"no dark image for {path.name}: {error}", file=sys.stderr)
        self.figures.append(entry)

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
        print(
            "the script showed no figure: call plt.show() or fig.show()",
            file=sys.stderr,
        )
        status = 1
    return status


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()))
