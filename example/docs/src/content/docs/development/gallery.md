---
title: Writing gallery examples
description: How an example script becomes a card and a page of the gallery.
---

An example is a plain Python script in `examples/`, such as `examples/basics/sine_waves.py`:

```python
"""Sine waves

Three harmonics of a fundamental wave, and their sum.

More text, with $math$ if needed.
"""

import plotly.graph_objects as go

fig = go.Figure(...)
fig.show()
```

- The first docstring line is the **title**, the first paragraph after it the text on the card, and
  the whole rest the description above the figure (Markdown and math work).
- **`fig.show()`** (Plotly) becomes an interactive figure, **`plt.show()`** (matplotlib) a PNG. All
  the figures a script shows end up on its page, in order, and the first one is the thumbnail.
- The script is shown below the figures without its docstring, and can be downloaded whole.
- Subdirectories become headings in the [gallery](/starlight-theme/examples/).

```sh
npm run gallery -w example/docs -- execute   # run the scripts that changed
npm run dev
```
