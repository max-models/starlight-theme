"""Lorenz attractor

A trajectory of the Lorenz system, drawn in three dimensions and coloured by time.

The system $\\dot{x} = \\sigma(y - x)$, $\\dot{y} = x(\\rho - z) - y$, $\\dot{z} = xy - \\beta z$ with
$\\sigma = 10$, $\\rho = 28$, $\\beta = 8/3$ is chaotic: nearby trajectories separate exponentially,
yet they stay on the same butterfly-shaped attractor. Rotate the plot with the mouse.
"""

import numpy as np
import plotly.graph_objects as go

sigma, rho, beta = 10.0, 28.0, 8.0 / 3.0


def derivative(p: np.ndarray) -> np.ndarray:
    x, y, z = p
    return np.array([sigma * (y - x), x * (rho - z) - y, x * y - beta * z])


dt, steps = 0.005, 8000
path = np.empty((steps, 3))
path[0] = (1.0, 1.0, 1.0)
for i in range(steps - 1):  # classical Runge-Kutta
    p = path[i]
    k1 = derivative(p)
    k2 = derivative(p + 0.5 * dt * k1)
    k3 = derivative(p + 0.5 * dt * k2)
    k4 = derivative(p + dt * k3)
    path[i + 1] = p + dt / 6.0 * (k1 + 2 * k2 + 2 * k3 + k4)

fig = go.Figure(
    go.Scatter3d(
        x=path[:, 0],
        y=path[:, 1],
        z=path[:, 2],
        mode="lines",
        line={
            "color": np.arange(steps) * dt,
            "colorscale": "Viridis",
            "width": 3,
            "colorbar": {"title": "t"},
        },
    )
)
fig.update_layout(title="Lorenz attractor", height=560, scene={"aspectmode": "data"})
fig.show()
