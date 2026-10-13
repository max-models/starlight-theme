"""A uniform 1D grid."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


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
