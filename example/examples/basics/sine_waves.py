"""Sine waves

Three harmonics of a fundamental wave, and their sum.

A periodic signal is a sum of harmonics,
$$
f(x) = \\sum_{n=1}^{3} \\frac{\\sin(n x)}{n},
$$
the first terms of the Fourier series of a sawtooth wave. Click a name in the legend to hide a
curve, or drag over the plot to zoom.
"""

import numpy as np
import plotly.graph_objects as go

x = np.linspace(0.0, 4.0 * np.pi, 600)
harmonics = {f"sin({n}x) / {n}": np.sin(n * x) / n for n in (1, 2, 3)}

fig = go.Figure()
for name, y in harmonics.items():
    fig.add_scatter(x=x, y=y, name=name, mode="lines", line={"width": 2})
fig.add_scatter(
    x=x, y=sum(harmonics.values()), name="sum", mode="lines", line={"width": 4}
)
fig.update_layout(
    title="Harmonics of a sawtooth wave", xaxis_title="x", yaxis_title="f(x)"
)
fig.show()
