# starlight-theme

The shared docs setup of the max-models projects (simgeometry, maybempi, mpiarray, patchwork,
plasmacoll, tree-d-3d, ...): one Astro + Starlight configuration, look, and notebook pipeline,
installed into each project's `docs/` instead of copied there. A change here reaches every site
when it bumps its version.

| Part | What it does |
|---|---|
| `starlight-theme-init` | Sets up the docs of a project: `docs/`, the workflow, a Renovate config, Makefile targets |
| `defineDocs()` | The whole `astro.config.mjs`: base path, KaTeX math (with macros), the theme, the API reference (starlight-pydocs) linked to the sibling projects, the link check, edit and GitHub links |
| `theme()` Starlight plugin | The palette, a header with the wave logo, a row of section links, a stable/dev switch and a projects menu, the home page hero, a footer naming the project family, a "Cite" page, the KaTeX styles, the favicon and a share image. Used by `defineDocs`, or on its own in a site with its own config |
| `components/` | `NotebookHeader`, `NotebookImage`, `RawHtml`, `PyVistaScene`: what the converted notebook pages use; `GalleryGrid`, `GalleryHeader`, `PlotlyFigure`: the gallery's (and the grid of the notebooks); `StartHere`: the link cards of a home page; `Header`, `Banner`, `Hero`, `SiteTitle`, `Footer`: Starlight's, replaced |
| `starlight-notebooks` | Executes `tutorials/*.ipynb` (or another directory) and converts them into MDX pages (`tools/notebooks.py`, optionally on several MPI ranks) |
| `starlight-gallery` | Runs example scripts (matplotlib or Plotly) and turns them into a gallery: a grid of cards and one page per script with its docstring, interactive figure and code (`tools/gallery.py`) |
| `starlight-check-mdx` | Compiles every MDX page in seconds, to find a broken conversion before the build |
| `.github/workflows/docs.yml` | The reusable CI: install, notebooks, build, smoke test, deploy to GitHub Pages (the release and `devel` side by side) |
| `renovate-preset.json` | A Renovate preset that bumps the theme in `docs/package.json` and the workflow together |

The Python tool ships inside the npm package, so the notebook converter and the components
its pages import always come in matching versions.

## Using it in a project

In the root of a project, without installing anything first:

```sh
npx --package github:max-models/starlight-theme#v0 starlight-theme-init
cd docs && npm install
```

It writes `docs/` (`package.json`, `astro.config.mjs`, `content.config.ts`, a home and an
installation page), `.github/workflows/docs.yml` and `renovate.json`, from what it finds: the
repository from the git remote, the description from `pyproject.toml`, the package in `src/`,
notebooks in `tutorials/` and scripts in `examples/`. Files that exist are kept (`--force`
overwrites them, `--dry-run` only shows what it would do), and it prints the Makefile targets.
`--migrate` moves a project from the old copied setup: it removes the files the theme replaces
and swaps their dependencies in the existing `docs/package.json` for the theme.

By hand, in `docs/`:

```sh
npm install github:max-models/starlight-theme#v0
```

`docs/package.json` then needs only:

```json
{
  "dependencies": {
    "@astrojs/starlight": "^0.42.6",
    "@max-models/starlight-theme": "github:max-models/starlight-theme#v0",
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
		{ label: 'Examples', link: '/examples/' },
		{ label: 'Development', link: '/development/docs/' },
		{ label: 'API', link: '/api/simgeometry/', section: '/api/' },
	],
	sidebar: [
		{ label: 'Getting started', items: [{ label: 'Installation', slug: 'getting-started/installation' }] },
		{ label: 'Examples', items: [{ autogenerate: { directory: 'examples' } }] },
	],
});
```

Other options:

| Option | |
|---|---|
| `owner`, `branch` | GitHub owner (default `max-models`) and the branch of the edit and source links (default `devel`) |
| `pydocs` | Overrides for the starlight-pydocs package entry |
| `inventories` | Sphinx inventories for the API reference (default Python and NumPy) |
| `crossref` | Sibling projects whose API reference the annotations link to, e.g. `['mpiarray']`. Default: the max-models projects among the dependencies of `pyproject` (`../pyproject.toml`); `false` for none |
| `projects` | The "Projects" menu of the header: by default loaded in the browser from `projectsUrl`, with the list in `lib/projects.ts` until it loads; a list of the site's own (not loaded), or `false` to hide it |
| `projectsUrl` | The JSON list the menu loads, default `https://max-models.github.io/projects.json`; `false` keeps the built-in list |
| `launch` | `['colab', 'binder']`: buttons on the notebook pages that run the notebook there |
| `math` | `{ macros: { '\\vect': '\\boldsymbol{#1}' } }`: KaTeX macros for every page |
| `logo` | Starlight's logo, e.g. `{ src: './src/assets/logo.svg' }`; without one the title has the max-models wave before it, `false` for neither. The favicon is the max-models one unless `public/favicon.svg` exists or `starlight.favicon` is set |
| `release` | The badge of the latest release in the hero: from the GitHub releases by default, from PyPI with `{ pypi: 'distribution-name' }`, `false` for none |
| `shareImage` | `false` for no share image (`<base>/og.png`, the header picture with the title and description, for link previews) |

and `starlight` / `astro` for anything else, merged over the result, e.g.
`astro: { redirects: { '/tutorials/': '/guides/' } }` (site-root paths; `defineDocs` adds the base
path to the targets, which Astro does not) or `starlight: { plugins: [...] }`.
A nav link is "current" on every page under its first path segment, or under `section`, and its
`description` shows in the `<StartHere />` grid of the home page.

`docs/src/content.config.ts`:

```ts
export { collections } from '@max-models/starlight-theme/content';
```

Delete the copies the theme replaces: `src/components/{Header,NotebookHeader,NotebookImage,RawHtml}.astro`,
`src/utils/base.ts`, `src/styles/custom.css`, `scripts/check-mdx.mjs`, `tools/notebooks.py`,
`tools/mpi_kernel.py`, and the direct dependencies on katex, remark-math, rehype-katex,
starlight-pydocs, starlight-links-validator, @astrojs/markdown-remark and @mdx-js/mdx
(`starlight-theme-init --migrate` does both).
A site's own `customCss` still works and loads after the theme's.

### The home page

A page with a `hero` in its frontmatter (the home page, `template: splash`) shows it on a header
picture across the whole width: the site's own figure from `docs/src/assets/hero.svg` when there is
one, otherwise streamlines of the flow past a cylinder in the accent colour, placed differently on
each site (seeded by the site title).

The site's figure is an animated SVG written with plasma-plots, usually by a `docs/hero.py` that runs
the package on a small case; its marks take the site's colours in light and dark mode:

```python
from plasma_plots.hero import HeroFigure

fig = HeroFigure(xlim=(0, 4), ylim=(-1, 1))
line = fig.line(x, y, tone="accent", opacity=0.6, title="shown on hover")
fig.tracer(line, duration=6)  # a dot drifting along the line
fig.save("docs/src/assets/hero.svg")
```

`heroBackground` in the frontmatter replaces either with an image, or removes it:

```yaml
heroBackground: ../../assets/header.png
# or a pair: heroBackground: { dark: ../../assets/header-dark.png, light: ../../assets/header-light.png }
# or none:   heroBackground: false
```

On wide screens the picture fades out behind the title on the left, and a few tracer dots drift along
the streamlines (they stand still for readers who prefer reduced motion). `hero.image` still shows an
image beside the title, as in Starlight.

Above the title is the latest release, read at build time (see `release`; the docs workflow passes
`GITHUB_TOKEN` for the API, a local build reads the redirect of the releases page). `heroInstall` in
the frontmatter shows a command to copy below the buttons:

```yaml
heroInstall: pip install git+https://github.com/max-models/simgeometry
```

`<StartHere />` turns the header links into link cards, with the `description` of each nav link,
so the two stay in step (and point into `/<repo>/dev/` in the dev build). `exclude` leaves some out,
and cards in its slot come after them:

```mdx
import StartHere from '@max-models/starlight-theme/components/StartHere.astro';

## Start here

<StartHere exclude={['Development']}>
  <LinkCard title="Quickstart" href="/simgeometry/getting-started/quickstart/" />
</StartHere>
```

`starlight-theme-init` writes a home page with both, and nav links with descriptions.

### Footer, citation and share image

Below every page, a line names the project family (`https://<owner>.github.io/`) and links the
sibling sites (from the built-in projects list), the license, the "Cite" page and the source.
`defineDocs` reads them from the project next to `pyproject`:

- the license from `license` in `CITATION.cff`, `license = "..."` in `pyproject.toml`, or the first
  line of `LICENSE`/`LICENSE.txt`/`LICENSE.md`, which it also links to;
- the citation from `CITATION.cff` (its `preferred-citation` if it has one): a `<base>/cite/` page
  with a one-line citation and BibTeX.

The share image `<base>/og.png` (1200 x 630, with `og:image` and `twitter:card` in every page's
head) is what GitHub, Slack and Mattermost show for a link to the site.

### The projects menu

Every site reads the menu from [`projects.json`](https://max-models.github.io/projects.json) in
[max-models.github.io](https://github.com/max-models/max-models.github.io) (`public/projects.json`)
when a page loads, so a new project appears on all sites once that file is pushed, without a theme
release or a rebuild:

```json
[
	{ "repo": "mpiarray", "title": "mpiarray", "description": "Distributed NumPy/CuPy arrays with halo exchange" },
	{ "repo": "gallery", "owner": "spokes3d", "title": "Magnetron gallery", "description": "Magnetron and spoke-formation studies" }
]
```

`owner` defaults to `max-models`; the link is `https://<owner>.github.io/<repo>/`. The list in
`lib/projects.ts` is what a page shows without JavaScript or when the file does not load, and the
candidates of `crossref` (with `pythonPackage`); add a project there too, at the next release.

### Notebooks

`starlight-notebooks <execute|convert|clean>` runs in the project's Python (`$DOCS_PYTHON`, else
the nearest `.venv`, else `python3`), which needs `nbclient`, `nbformat` and `ipykernel`; run it in
`docs/`. Defaults suit a project with notebooks in `tutorials/`; otherwise, in `docs/package.json`:

```json
"starlight-notebooks": { "source": "../guides", "mpiRanks": 4 }
```

The max-models projects keep the notebooks in `tutorials/` and publish them in one Examples
section with `"section": "examples"`; the scaffold sets this up.

`source` is the notebook directory, which may have subdirectories (the pages are named after
the notebooks alone, so the directories only organise the sources), `section` the URL section
(default: the directory name),
`mpiRanks` runs every notebook under `mpiexec -n <ranks>` when mpi4py and an MPI launcher are
installed (`DOCS_MPI_RANKS=1` for a quick serial run). The cell tags `remove-cell`, `hide-input`,
`fold-input`, `fold-output` (outputs in a closed box, titled by the cell metadata `fold_summary`),
`remove-output`, `raises-exception` and nbclient's `skip-execution` are honoured, and notebook
metadata `docs_order` sets the sidebar position.

The index page of the section has a grid of cards of the other notebooks, with their first image:
at the end of `index.ipynb`, or after its cell tagged `notebook-grid`; without an index notebook
the tool writes an index page with only the grid (`"grid": false` turns it off). With `launch`
set, the pages get "Open in Colab" / "Launch Binder" buttons, except for notebooks run on several
MPI ranks or with the metadata `docs_launch: false`. See the docstring of `tools/notebooks.py` for
the rest.

#### Interactive 3-D scenes

A cell can show a PyVista scene that the reader can rotate: the page shows a picture of it and an
**Interactive 3-D view** button (with the download size) that loads the scene, a standalone vtk.js
page, only when clicked, as each is a few MB; "Open in a new tab" opens it on its own. With
plasma-plots, the last line of the cell is

```python
plasma_plots.scene(plotter, alt="Isosurfaces of a helical mode in a torus")
```

Any project can produce one: an output (`display_data` or `execute_result`) is a scene when its
metadata has the key `"pyvista-scene"`, with `text/html` the standalone page of
`plotter.trame.export_html(...)` and `image/png` a screenshot of it. Display an object whose
`_repr_mimebundle_` returns both:

```python
import base64, tempfile
from pathlib import Path

class Scene:
    def __init__(self, plotter, alt=None, title=None):
        self.plotter, self.alt, self.title = plotter, alt, title

    def _repr_mimebundle_(self, include=None, exclude=None):
        with tempfile.TemporaryDirectory() as tmp:
            self.plotter.screenshot(f"{tmp}/scene.png")
            self.plotter.trame.export_html(f"{tmp}/scene.html")  # needs trame and trame-vtk
            png = base64.b64encode(Path(tmp, "scene.png").read_bytes()).decode()
            html = Path(tmp, "scene.html").read_text()
        data = {"text/html": html, "image/png": png}
        return data, {"pyvista-scene": {"alt": self.alt, "title": self.title}}
```

`alt` is the alt text of the picture (default the `title`), `title` an optional caption. The
tool writes the scene and the picture as `<n>.html` and `<n>.png` next to the page's images in
`public/<section>/<slug>/`; like the images, they are replaced at every conversion and removed with
the page when its notebook is deleted. Elsewhere in a site, the component works directly in MDX,
with a scene under `public/` and an imported picture:

```mdx
import PyVistaScene from '@max-models/starlight-theme/components/PyVistaScene.astro';
import torus from '../../assets/figures/torus.png';

<PyVistaScene src="/pyvista/torus.html" image={torus} alt="Isosurfaces in a torus" />
```

`src` is the site-root path of the HTML under `public/` (the base path is added), `image` an
imported image or the site-root path of one under `public/`. Without the HTML file only the picture
is shown, so a build without trame still works.

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
"starlight-gallery": { "source": "../examples", "section": "example-scripts", "title": "Scripts" }
```

(the max-models layout: the scripts are a Scripts group of the Examples section, next to the
notebooks in `examples/`). Add `starlight-gallery convert` after `starlight-notebooks convert` in the
`dev` and `build` scripts, a `{ label: 'Scripts', items: [{ autogenerate: { directory: 'example-scripts' } }] }`
entry in the Examples sidebar group, and call the CI with
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
    uses: max-models/starlight-theme/.github/workflows/docs.yml@v0
    with:
      smoke-paths: |
        examples/index.html
        api/simgeometry/index.html
```

Inputs: `extras` (default `docs`; e.g. `docs mpi`), `apt-packages` (e.g.
`libopenmpi-dev openmpi-bin`), `notebooks`, `gallery`, `xvfb` (run them under a virtual display, for
PyVista scenes), `pre-notebooks` (shell commands before the notebooks and gallery run, e.g.
compiling kernels), `pre-build` (shell commands before the build, e.g.
tree-d-3d's examples), `smoke-paths`, `deploy`, `deploy-branch` (default `devel`), `stable-branch`,
`python-version`, `node-version`, `project-dir`, `npm-lockfile`.

With `stable-branch: main`, a push to `main` or `devel` builds both branches and deploys the
release at `<owner>.github.io/<repo>/` and `devel` at `<repo>/dev/`. The header then has a
stable/dev switch to the same page in the other one, and the dev pages a notice that links to the
release. The workflow sets `DOCS_CHANNEL=stable|dev` for `defineDocs`, which moves the dev build to
`/<repo>/dev/` together with the links of its pages that are written as `/<repo>/...`. Both
branches must use a theme version that knows `DOCS_CHANNEL` (v0.3.0 or later) for the switch to
show on both; the smoke paths must exist in both builds.

The release branch (`stable-branch`, or `main`) and pull requests into it install the project with
`UV_NO_SOURCES`, so from PyPI only; every other build takes the devel branches the project lists
in `[tool.uv.sources]`.

### Renovate

The `renovate.json` that `starlight-theme-init` writes extends the theme's preset, which bumps the
theme in `docs/package.json` and the tag of the docs workflow in one pull request. On the major tag
(`#v0`, `@v0`) that is only needed for a new major:

```json
{
  "extends": ["config:recommended", "github>max-models/starlight-theme:renovate-preset"],
  "baseBranchPatterns": ["devel"]
}
```

## Working on the theme

`example/` is a small project (a package, two notebooks, a few pages) whose `docs/` uses the
theme from this checkout:

```sh
npm install                                  # the theme and the example, as one npm workspace
(cd example && uv sync --extra docs)         # Python for the notebooks and the API reference
npm run notebooks -w example/docs -- execute
npm run dev                                  # http://localhost:4321/starlight-theme/
npm test                                     # npm run test:js (vitest) and test:py (pytest, needs uv)
```

`DOCS_CHANNEL=dev npm run build` builds the example as the dev site at `/starlight-theme/dev/`.

To try a change in a real project before a release, install the checkout into its `docs/` as a
copy, `npm install --install-links ../../starlight-theme` (rerun it after each change, and go
back to the tag afterwards). A plain `npm install ../../starlight-theme` symlinks the checkout
and does not build: the theme's dependencies (starlight-pydocs) then resolve from this
repository's `node_modules` instead of the project's.

## Branches, CI and releases

Work happens on `devel`; `main` holds the releases.

| Workflow | When | What |
|---|---|---|
| `test_pytest.yml` | push / pull request to `main` or `devel` | tests of the notebook and gallery tools |
| `test_vitest.yml` | push / pull request to `main` or `devel` | tests of `defineDocs`, the plugin and `starlight-theme-init` |
| `docs_site.yml` | push / pull request to `main` or `devel` | builds the example site with the reusable `docs.yml`; deploys it to <https://max-models.github.io/starlight-theme/> from `main` and to <https://max-models.github.io/starlight-theme/dev/> from `devel` |
| `release.yml` | push to `main` | tags `v<version>` from `package.json` and creates a GitHub release with generated notes, unless it exists already; moves the major tag (`v0`) and reruns the docs of the sites on it |
| `docs.yml` | called by the projects | the reusable docs build |

To release: bump `version` in `package.json` on `devel`, merge `devel` into `main`. The release
workflow tags `vX.Y.Z`, moves the major tag (`v0`) to it and reruns the docs of every site whose
workflow uses `docs.yml@v0` (with a `DOCS_DISPATCH_TOKEN` secret: a token with actions write and
contents read on the sites; without it they pick the release up on their next push). Projects
need no bump: the reusable workflow installs the theme of its own major tag over the lockfile's
(`theme-ref`, `v0` by default; an exact tag pins a site, `""` uses the lockfile). Only a new major
(`v1`) is a bump in each project. A new project with a docs site goes
into `lib/projects.ts`, for the projects menu and the cross-references.
