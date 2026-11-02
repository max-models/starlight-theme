"""Time steps for a particle in a force field: kick, drift and their leapfrog."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from methodcard import NumericalMethod


class Scheme(NumericalMethod, abstract=True):
    """A one-step scheme for ``x'' = a(x)``."""

    def step(self, x, v, dt: float, acceleration: Callable) -> tuple:
        """Advance ``(x, v)`` by ``dt``."""
        raise NotImplementedError


class Kick(Scheme):
    """Change the velocity by the acceleration at the current position."""

    equations = {"update": r"v^{n+1} = v^n + a(x^n)\,\Delta t"}

    def step(self, x, v, dt: float, acceleration: Callable) -> tuple:
        """Advance the velocity only."""
        return x, v + dt * acceleration(x)


class Drift(Scheme):
    """Move the position at the current velocity."""

    equations = {"update": r"x^{n+1} = x^n + v^n\,\Delta t"}
    assumptions = ("velocity constant over the step",)

    def step(self, x, v, dt: float, acceleration: Callable) -> tuple:
        """Advance the position only."""
        return x + dt * v, v


class Leapfrog(Scheme):
    """Half a kick, a drift and half a kick: the velocity Verlet scheme."""

    equations = {
        "half_kick": r"v^{n+1/2} = v^n + \tfrac{1}{2} a(x^n)\,\Delta t",
        "drift": r"x^{n+1} = x^n + v^{n+1/2}\,\Delta t",
        "kick": r"v^{n+1} = v^{n+1/2} + \tfrac{1}{2} a(x^{n+1})\,\Delta t",
        "energy": r"\left|H(x^n, v^n) - H(x^0, v^0)\right| = \mathcal{O}(\Delta t^2) \quad \text{for all } n",
    }
    order = {"x": 2, "v": 2}
    assumptions = ("the acceleration depends on the position only",)
    references = ("Hairer, Lubich and Wanner, Geometric Numerical Integration (2006), section I.1.4",)
    components = (Kick, Drift)

    def step(self, x, v, dt: float, acceleration: Callable) -> tuple:
        """Advance ``(x, v)`` by one leapfrog step."""
        v = v + 0.5 * dt * acceleration(x)
        x = x + dt * v
        return x, v + 0.5 * dt * acceleration(x)

    def run(self, x, v, dt: float, steps: int, acceleration: Callable) -> np.ndarray:
        """Take ``steps`` steps and return the positions, ``(steps + 1,)``."""
        positions = [x]
        for _ in range(steps):
            x, v = self.step(x, v, dt, acceleration)
            positions.append(x)
        return np.asarray(positions)
