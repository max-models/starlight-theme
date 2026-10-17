// @ts-check
// The theme's own example site, built in CI and served at https://max-models.github.io/starlight-theme/
// (deployed from devel).
// A project's docs/astro.config.mjs looks the same, minus the editLink override.
import { defineDocs } from '@max-models/starlight-theme';

export default defineDocs({
	repo: 'starlight-theme',
	title: 'starlight-theme',
	description: 'The shared docs setup of the max-models projects, shown on a small example package.',
	pythonPackage: 'example_pkg',
	nav: [
		{ label: 'Getting started', link: '/getting-started/installation/' },
		{ label: 'Tutorials', link: '/tutorials/' },
		{ label: 'Gallery', link: '/examples/' },
		{ label: 'Development', link: '/development/docs/' },
		{ label: 'API', link: '/api/example_pkg/', section: '/api/' },
	],
	sidebar: [
		{
			label: 'Getting started',
			items: [{ label: 'Installation', slug: 'getting-started/installation' }],
		},
		{
			label: 'Tutorials',
			items: [{ autogenerate: { directory: 'tutorials' } }],
		},
		{
			label: 'Gallery',
			items: [{ autogenerate: { directory: 'examples' } }],
		},
		{
			label: 'Development',
			items: [
				{ label: 'Building the docs', slug: 'development/docs' },
				{ label: 'Writing gallery examples', slug: 'development/gallery' },
			],
		},
	],
	// run the tutorials in Colab or Binder from their pages
	launch: ['colab', 'binder'],
	// \vect{E} in every page's math
	math: { macros: { '\\vect': '\\boldsymbol{#1}' } },
	astro: {
		redirects: { '/guides/': '/tutorials/' },
	},
	starlight: {
		editLink: { baseUrl: 'https://github.com/max-models/starlight-theme/edit/devel/example/docs/' },
	},
});
