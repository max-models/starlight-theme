---
title: Installation
description: Use the theme in a project's docs.
---

In the project's `docs/`:

```sh
npm install github:max-models/starlight-theme#v0.4.0
```

`docs/astro.config.mjs` then only holds what is particular to the project:

```js
import { defineDocs } from '@max-models/starlight-theme';

export default defineDocs({
	repo: 'simgeometry',
	title: 'simgeometry',
	description: 'Shapes, structured grids, and domains for numerical simulations.',
	pythonPackage: 'simgeometry',
	nav: [
		{ label: 'Getting started', link: '/getting-started/installation/' },
		{ label: 'Tutorials', link: '/tutorials/' },
		{ label: 'API', link: '/api/simgeometry/', section: '/api/' },
	],
	sidebar: [/* ... */],
});
```

Inline math such as $e^{i\pi} + 1 = 0$ works in every page, and so does display math:

$$
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}.
$$

Macros from the `math` option of `defineDocs` work everywhere too: this site defines `\vect`, so
`$\vect{E} = -\nabla \phi$` is $\vect{E} = -\nabla \phi$.

Or start from scratch: `npx --package github:max-models/starlight-theme#v0.4.0 starlight-theme-init`
in the root of the project writes the whole `docs/` setup.
