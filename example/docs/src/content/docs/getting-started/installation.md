---
title: Installation
description: Use the theme in a project's docs.
---

In the project's `docs/`:

```sh
npm install github:max-models/starlight-theme#v0.2.0
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
