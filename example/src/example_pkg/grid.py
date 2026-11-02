"""A uniform 1D grid."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from methodcard import method


@dataclass(frozen=True)
class Grid:
    """A uniform grid of cells on ``[start, stop]``.

    Attributes:
        start: Left end of the domain.
        stop: Right end of the domain.
        cells: Number of cells.
    """

    start: float
    stop: float
    cells: int

    @property
    def spacing(self) -> float:
        """The cell width $h = (b - a) / n$."""
        return (self.stop - self.start) / self.cells

    def nodes(self) -> np.ndarray:
        """The ``cells + 1`` cell boundaries.

        Returns:
            The node coordinates.
        """
        return np.linspace(self.start, self.stop, self.cells + 1)


def linspace_midpoints(start: float, stop: float, cells: int) -> np.ndarray:
    """The midpoints of ``cells`` uniform cells on ``[start, stop]``.

    Args:
        start: Left end of the domain.
        stop: Right end of the domain.
        cells: Number of cells.

    Returns:
        An array of length ``cells``.
    """
    nodes = Grid(start, stop, cells).nodes()
    return 0.5 * (nodes[1:] + nodes[:-1])


@method(
    equations={
        "rule": r"\int_a^b f(x)\,dx \approx h \sum_{i=0}^{n-1} f\left(\frac{x_i + x_{i+1}}{2}\right)",
        "error": r"\left|E\right| \le \frac{(b - a) h^2}{24} \max_{[a, b]} |f''|",
    },
    order=2,
    assumptions=("f twice continuously differentiable on [a, b]",),
    references=("Süli and Mayers, An Introduction to Numerical Analysis (2003), section 7.2",),
)
def midpoint_integral(f, start: float, stop: float, cells: int) -> float:
    """The integral of ``f`` on ``[start, stop]`` by the composite midpoint rule.

    Args:
        f: The integrand, called on an array of points.
        start: Left end of the domain.
        stop: Right end of the domain.
        cells: Number of cells.

    Returns:
        The approximate integral.
    """
    grid = Grid(start, stop, cells)
    return float(grid.spacing * np.sum(f(linspace_midpoints(start, stop, cells))))
