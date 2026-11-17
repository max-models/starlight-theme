"""The live demo of the example site: a harmonic oscillator, stepped with example_pkg's leapfrog.

It runs in the browser (Pyodide); `run` takes the values of the sliders and returns the figure.
"""

import numpy as np

from example_pkg import Leapfrog


def run(dt=0.3, periods=5):
    """Step x'' = -x from x = 1, v = 0 and compare the positions with cos(t)."""
    steps = int(round(2 * np.pi * periods / dt))
    positions = Leapfrog().run(1.0, 0.0, dt, steps, lambda x: -x)
    t = dt * np.arange(steps + 1)
    fine = np.linspace(0, t[-1], 400)
    error = np.abs(positions - np.cos(t)).max()
    return {
        "figure": {
            "data": [
                {"x": fine, "y": np.cos(fine), "mode": "lines", "name": "exact"},
                {"x": t, "y": positions, "mode": "markers", "name": "leapfrog"},
            ],
            "layout": {"xaxis": {"title": {"text": "time"}}, "yaxis": {"title": {"text": "position"}}},
        },
        "numbers": {"Steps": steps, "Largest error": float(error)},
    }
