"""Wave interference

The pattern of two point sources emitting waves of the same wavelength.

At a point a distance $r_1$ from the first source and $r_2$ from the second, the waves add up to
$$
u = \\frac{\\cos(k r_1)}{\\sqrt{r_1}} + \\frac{\\cos(k r_2)}{\\sqrt{r_2}}, \\qquad k = \\frac{2\\pi}{\\lambda}.
$$
Where the path difference is a whole number of wavelengths the waves reinforce each other, and
where it is a half-integer they cancel. Hover over the field to read off values.
"""

import numpy as np
import plotly.graph_objects as go

wavelength = 1.0
k = 2.0 * np.pi / wavelength
sources = [(-1.5, 0.0), (1.5, 0.0)]

x = np.linspace(-8.0, 8.0, 400)
y = np.linspace(-6.0, 6.0, 300)
X, Y = np.meshgrid(x, y)

u = np.zeros_like(X)
for sx, sy in sources:
    r = np.maximum(np.hypot(X - sx, Y - sy), 0.2)
    u += np.cos(k * r) / np.sqrt(r)

fig = go.Figure(
    go.Heatmap(x=x, y=y, z=u, colorscale="RdBu", zmid=0.0, colorbar={"title": "u"})
)
fig.add_scatter(
    x=[s[0] for s in sources],
    y=[s[1] for s in sources],
    mode="markers",
    marker={"size": 10, "color": "black", "line": {"color": "white", "width": 2}},
    name="sources",
)
fig.update_layout(
    title="Two-source interference",
    xaxis_title="x",
    yaxis_title="y",
    yaxis_scaleanchor="x",
    height=520,
)
fig.show()
