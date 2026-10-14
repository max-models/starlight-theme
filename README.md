# starlight-theme

The shared docs setup of the max-models projects (simgeometry, maybempi, mpiarray, patchwork,
plasmacoll, tree-d-3d, ...): one Astro + Starlight configuration, look, and notebook pipeline,
installed into each project's `docs/` instead of copied there. A change here reaches every site
when it bumps its version.

| Part | What it does |
|---|---|
| `defineDocs()` | The whole `astro.config.mjs`: base path, KaTeX math, the theme, the API reference (starlight-pydocs), the link check, edit and GitHub links |
| `theme()` Starlight plugin | The palette, a header with a row of section links, the KaTeX styles. Used by `defineDocs`, or on its own in a site with its own config |
| `components/` | `NotebookHeader`, `NotebookImage`, `RawHtml`: what the converted notebook pages use; `GalleryGrid`, `GalleryHeader`, `PlotlyFigure`: the gallery's |
| `starlight-notebooks` | Executes `tutorials/*.ipynb` (or another directory) and converts them into MDX pages (`tools/notebooks.py`, optionally on several MPI ranks) |
| `starlight-gallery` | Runs example scripts (matplotlib or Plotly) and turns them into a gallery: a grid of cards and one page per script with its docstring, interactive figure and code (`tools/gallery.py`) |
| `starlight-check-mdx` | Compiles every MDX page in seconds, to find a broken conversion before the build |
| `.github/workflows/docs.yml` | The reusable CI: install, notebooks, build, smoke test, deploy to GitHub Pages |

The Python tool ships inside the npm package, so the notebook converter and the components
its pages import always come in matching versions.

## Using it in a project

In `docs/`:

```sh
npm install github:max-models/starlight-theme#v0.2.0
```

`docs/package.json` then needs only:

```json
{
  "dependencies": {
    "@astrojs/starlight": "^0.42.6",
    "@max-models/starlight-theme": "github:max-models/starlight-theme#v0.2.0",
    "astro": "^7.3.8",
    "sharp": "^0.35.3"
  }
}
```

`docs/astro.config.mjs` holds what is particular to the project:

```js
// @ts-check
import { defineDocs } from '@max-models/starlight-theme';

export default defineDocs({
	repo: 'simgeometry', // github.com/max-models/simgeometry, served at max-models.github.io/simgeometry/
	title: 'simgeometry',
	description: 'Shapes, structured grids, and domains for numerical simulations.',
	pythonPackage: 'simgeometry', // adds an "API reference" sidebar group
	nav: [
		{ label: 'Getting started', link: '/getting-started/installation/' },
		{ label: 'Tutorials', link: '/tutorials/' },
		{ label: 'Development', link: '/development/docs/' },
		{ label: 'API', link: '/api/simgeometry/', section: '/api/' },
	],
	sidebar: [
		{ label: 'Getting started', items: [{ label: 'Installation', slug: 'getting-started/installation' }] },
		{ label: 'Tutorials', items: [{ autogenerate: { directory: 'tutorials' } }] },
	],
});
```

Other options: `owner` (default `max-models`), `branch` (default `devel`), `pydocs` (overrides
for the starlight-pydocs package entry), `inventories` (default Python and NumPy), and
`starlight` / `astro` for anything else, merged over the result, e.g.
`astro: { redirects: { '/tutorials/': '/guides/' } }` (site-root paths; `defineDocs` adds the base
path to the targets, which Astro does not) or `starlight: { plugins: [...] }`.
A nav link is "current" on every page under its first path segment, or under `section`.

`docs/src/content.config.ts`:

```ts
export { collections } from '@max-models/starlight-theme/content';
```

Delete the copies the theme replaces: `src/components/{Header,NotebookHeader,NotebookImage,RawHtml}.astro`,
`src/utils/base.ts`, `src/styles/custom.css`, `scripts/check-mdx.mjs`, `tools/notebooks.py`,
`tools/mpi_kernel.py`, and the direct dependencies on katex, remark-math, rehype-katex,
starlight-pydocs, starlight-links-validator, @astrojs/markdown-remark and @mdx-js/mdx.
A site's own `customCss` still works and loads after the theme's.

### Notebooks

`starlight-notebooks <execute|convert|clean>` runs in the project's Python (`$DOCS_PYTHON`, else
the nearest `.venv`, else `python3`), which needs `nbclient`, `nbformat` and `ipykernel`; run it in
`docs/`. Defaults suit a project with notebooks in `tutorials/`; otherwise, in `docs/package.json`:

```json
"starlight-notebooks": { "source": "../guides", "mpiRanks": 4 }
```

`source` is the notebook directory, which may have subdirectories (the pages are named after
the notebooks alone, so the directories only organise the sources), `section` the URL section
(default: the directory name),
`mpiRanks` runs every notebook under `mpiexec -n <ranks>` when mpi4py and an MPI launcher are
installed (`DOCS_MPI_RANKS=1` for a quick serial run). The cell tags `remove-cell`, `hide-input`,
`fold-input`, `fold-output` (outputs in a closed box, titled by the cell metadata `fold_summary`),
`remove-output`, `raises-exception` and nbclient's `skip-execution` are honoured, and notebook
metadata `docs_order` sets the sidebar position. See the docstring of `tools/notebooks.py` for the rest.

### Gallery

`starlight-gallery <execute|convert|clean>` builds a gallery from plain Python scripts in `examples/`
(or another directory): a grid of cards with thumbnails, and a page per script with its description,
the figures and the code. It runs in the same Python as the notebooks, plus whatever the scripts
import (matplotlib, plotly, ...).

```python
"""Sine waves

Three harmonics of a fundamental wave, and their sum.   <- the text of the card

More Markdown, with $math$, goes on the page above the figure.
"""

import plotly.graph_objects as go

...
fig.show()
```

The first docstring line is the title, the first paragraph after it the text of the card, the rest the
page text. A script shows its figures the usual way, so it also runs on its own: `fig.show()` for
Plotly (an interactive plotly.js figure, with the site's light/dark colours, animations included) and
`plt.show()` for matplotlib (a PNG); every figure a script shows is on its page, and a script that
shows none fails. Below the figures the page has the code without the docstring, a download link, and
what the script printed. Scripts in subdirectories are grouped under a heading per directory (the
pages are named after the scripts alone); `README.md` in the directory is the introduction of the
gallery page. Settings, in `docs/package.json`:

```json
"starlight-gallery": { "source": "../examples", "section": "examples", "title": "Gallery" }
```

Add `starlight-gallery convert` after `starlight-notebooks convert` in the `dev` and `build` scripts, a
`{ autogenerate: { directory: 'examples' } }` sidebar entry and a nav link, and call the CI with
`gallery: true` to run the scripts there. Locally, `starlight-gallery execute` runs the scripts that
changed (`--force` all of them).

The Makefile targets become:

```make
DOCS_ENV = DOCS_PYTHON=$(abspath $(PYTHON))
NOTEBOOKS = cd docs && $(DOCS_ENV) npx starlight-notebooks

docs-notebooks:  ## execute the changed tutorials and convert all of them (FORCE=1 reruns all)
	$(NOTEBOOKS) execute $(if $(FORCE),--force,)
	$(NOTEBOOKS) convert

docs-dev:  ## live preview at http://localhost:4321/<repo>/
	$(NOTEBOOKS) convert
	cd docs && $(DOCS_ENV) DOCS_VALIDATE_LINKS=false npx astro dev

docs-build:  ## the static site in docs/dist, as in CI
	$(NOTEBOOKS) convert
	cd docs && npx starlight-check-mdx && $(DOCS_ENV) npx astro build
```

### CI

`.github/workflows/docs.yml` of the project:

```yaml
name: Docs
on:
  push: { branches: ["main", "devel"] }
  pull_request: { branches: ["main", "devel"] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: "docs-${{ github.ref }}", cancel-in-progress: true }
jobs:
  docs:
    uses: max-models/starlight-theme/.github/workflows/docs.yml@v0.2.0
    with:
      smoke-paths: |
        tutorials/index.html
        api/simgeometry/index.html
```

Inputs: `extras` (default `docs`; e.g. `docs mpi`), `apt-packages` (e.g.
`libopenmpi-dev openmpi-bin`), `notebooks`, `gallery`, `pre-build` (shell commands before the build, e.g.
tree-d-3d's examples), `smoke-paths`, `deploy`, `deploy-branch` (default `devel`),
`python-version`, `node-version`, `project-dir`, `npm-lockfile`.

## Working on the theme

`example/` is a small project (a package, two notebooks, a few pages) whose `docs/` uses the
theme from this checkout:

```sh
npm install                                  # the theme and the example, as one npm workspace
(cd example && uv sync --extra docs)         # Python for the notebooks and the API reference
npm run notebooks -w example/docs -- execute
npm run dev                                  # http://localhost:4321/starlight-theme/
npm test                                     # tests of the notebook tool (needs uv)
```

To try a change in a real project before a release, install the checkout into its `docs/` as a
copy, `npm install --install-links ../../starlight-theme` (rerun it after each change, and go
back to the tag afterwards). A plain `npm install ../../starlight-theme` symlinks the checkout
and does not build: the theme's dependencies (starlight-pydocs) then resolve from this
repository's `node_modules` instead of the project's.

## Branches, CI and releases

Work happens on `devel`; `main` holds the releases.

| Workflow | When | What |
|---|---|---|
| `test_pytest.yml` | push / pull request to `main` or `devel` | tests of the notebook tool |
| `docs_site.yml` | push / pull request to `main` or `devel` | builds the example site with the reusable `docs.yml`; deploys it to <https://max-models.github.io/starlight-theme/> from `devel` |
| `release.yml` | push to `main` | tags `v<version>` from `package.json` and creates a GitHub release with generated notes, unless it exists already |
| `docs.yml` | called by the projects | the reusable docs build |

To release: bump `version` in `package.json` on `devel`, merge `devel` into `main`. Projects then
update with `npm install github:max-models/starlight-theme#vX.Y.Z` in `docs/` and the same tag in
their docs workflow; Dependabot or Renovate can open those bumps.
