---
title: Building the docs
description: Work on the theme with this example site.
---

From the root of the theme repository:

```sh
npm install                                  # the theme and this site, as one workspace
(cd example && uv sync --extra docs)         # Python for the notebooks and the API reference
npm run notebooks -w example/docs -- execute # run the tutorials
npm run dev                                  # live preview at http://localhost:4321/starlight-theme/
```

Edits to the theme's components, styles and config show up in the preview right away.
