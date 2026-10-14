"""Travelling wave animation

A Gaussian pulse splitting into two halves that travel in opposite directions.

d'Alembert's solution of the wave equation $u_{tt} = c^2 u_{xx}$ with $u(x, 0) = e^{-x^2}$ and
$u_t(x, 0) = 0$ is
$$
u(x, t) = \\tfrac12\\left[e^{-(x - ct)^2} + e^{-(x + ct)^2}\\right].
$$
Press play, or drag the slider. Plotly figures keep their frames, so animations work as well.
"""

import numpy as np
import plotly.graph_objects as go

c = 1.0
x = np.linspace(-10.0, 10.0, 400)
times = np.linspace(0.0, 7.0, 36)


def u(t: float) -> np.ndarray:
    return 0.5 * (np.exp(-((x - c * t) ** 2)) + np.exp(-((x + c * t) ** 2)))


frames = [go.Frame(data=[go.Scatter(x=x, y=u(t))], name=f"{t:.1f}") for t in times]
steps = [
    {"label": f.name, "method": "animate", "args": [[f.name], {"mode": "immediate", "frame": {"duration": 0, "redraw": False}}]}
    for f in frames
]
fig = go.Figure(
    data=[go.Scatter(x=x, y=u(0.0), fill="tozeroy", line={"width": 3})],
    frames=frames,
    layout={
        "title": "d'Alembert solution of the wave equation",
        "xaxis": {"title": "x", "range": [-10, 10]},
        "yaxis": {"title": "u", "range": [0, 1.05]},
        "margin": {"b": 130},
        "updatemenus": [
            {
                "type": "buttons",
                "showactive": False,
                "x": 0.0,
                "y": -0.3,
                "buttons": [
                    {"label": "Play", "method": "animate", "args": [None, {"frame": {"duration": 80, "redraw": False}, "fromcurrent": True}]},
                    {"label": "Pause", "method": "animate", "args": [[None], {"mode": "immediate", "frame": {"duration": 0}}]},
                ],
            }
        ],
        "sliders": [{"steps": steps, "y": -0.3, "x": 0.15, "len": 0.85, "currentvalue": {"prefix": "t = "}}],
    },
)
fig.show()
