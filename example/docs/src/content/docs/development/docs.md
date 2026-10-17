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

`DOCS_CHANNEL=dev npm run build` builds the site as the docs workflow builds `devel` next to a
release: at `/starlight-theme/dev/`, with the stable/dev switch in the header and a notice on
every page (`DOCS_CHANNEL=stable` for the release).
