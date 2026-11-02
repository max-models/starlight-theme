"""A tiny package, so the example site has an API reference to render."""

from example_pkg.grid import Grid, linspace_midpoints, midpoint_integral
from example_pkg.schemes import Drift, Kick, Leapfrog

__all__ = ["Drift", "Grid", "Kick", "Leapfrog", "linspace_midpoints", "midpoint_integral"]
