// The whole Astro config of a max-models docs site, from the few things that differ between them.
//
//     // docs/astro.config.mjs
//     import { defineDocs } from '@max-models/starlight-theme';
//     export default defineDocs({ repo: 'simgeometry', title: ..., description: ..., nav: [...], sidebar: [...] });
//
// The site is served at https://<owner>.github.io/<repo>/, with math, the theme, the API reference
// of a Python package and a link check. `starlight` and `astro` are merged over the result for
// anything that is particular to one site.
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import type { StarlightUserConfig } from '@astrojs/starlight/types';
import type { AstroUserConfig } from 'astro';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import starlightLinksValidator from 'starlight-links-validator';
import starlightPydocs, { pydocsSidebarGroup, type PydocsPackageInput, type PydocsUserConfig } from 'starlight-pydocs';
import theme, { type NavLink } from './plugin.ts';

type Sidebar = NonNullable<StarlightUserConfig['sidebar']>;

export interface DocsOptions {
	/** Repository name: github.com/<owner>/<repo>, served at <owner>.github.io/<repo>/. */
	repo: string;
	/** GitHub user or organisation. Default "max-models". */
	owner?: string;
	/** Branch for "Edit page" and source links. Default "devel". */
	branch?: string;
	title: string;
	description: string;
	/** Links in the header (see `NavLink`). */
	nav: NavLink[];
	/**
	 * Starlight's sidebar. With `pythonPackage`, an "API reference" group is appended unless the
	 * sidebar already places `pydocsSidebarGroup` itself.
	 */
	sidebar: Sidebar;
	/** The Python package documented under "API reference" (its directory name in ../src). */
	pythonPackage?: string;
	/** Overrides for that package's starlight-pydocs entry (search paths, members, ...). */
	pydocs?: Partial<PydocsPackageInput>;
	/** Sphinx inventories for cross-references. Default Python and NumPy. */
	inventories?: PydocsUserConfig['inventories'];
	/** Merged over the Starlight config (plugins are appended to the theme's). */
	starlight?: Partial<StarlightUserConfig>;
	/** Merged over the Astro config (e.g. `redirects`). */
	astro?: AstroUserConfig;
}

function containsPlaceholder(items: unknown): boolean {
	if (!Array.isArray(items)) return false;
	return items.some(
		(item) => item === pydocsSidebarGroup || (typeof item === 'object' && item !== null && containsPlaceholder((item as { items?: unknown }).items))
	);
}

export default function defineDocs(options: DocsOptions): AstroUserConfig {
	const owner = options.owner ?? 'max-models';
	const branch = options.branch ?? 'devel';
	const base = `/${options.repo}`;
	const github = `https://github.com/${owner}/${options.repo}`;
	const pkg = options.pythonPackage;

	const plugins: NonNullable<StarlightUserConfig['plugins']> = [
		theme({ repository: `${owner}/${options.repo}`, branch, nav: options.nav }),
	];
	if (pkg) {
		plugins.push(
			starlightPydocs({
				packages: [
					{
						name: pkg,
						label: 'All modules',
						search: ['../src'],
						docstringStyle: 'google',
						members: { exclude: [`${pkg}.tests`, `${pkg}.tests.*`] },
						sourceLink: { host: 'github', repo: `${owner}/${options.repo}`, ref: branch, root: '..' },
						sidebar: { collapsed: false },
						...options.pydocs,
					},
				],
				// The interpreter griffe runs in (set by `make docs-*`); falls back to uvx / python.
				runner: process.env.DOCS_PYTHON ? { python: process.env.DOCS_PYTHON } : undefined,
				inventories: options.inventories ?? ['python', { url: 'https://numpy.org/doc/stable/objects.inv' }],
			})
		);
	}
	// DOCS_VALIDATE_LINKS=false for `astro dev`, where the check would run on every reload
	if (process.env.DOCS_VALIDATE_LINKS !== 'false') {
		plugins.push(starlightLinksValidator({ errorOnLocalLinks: false, exclude: [`${base}/api/**`, '/api/**'] }));
	}

	const sidebar: Sidebar =
		pkg && !containsPlaceholder(options.sidebar)
			? [...options.sidebar, { label: 'API reference', items: [pydocsSidebarGroup] }]
			: options.sidebar;

	const { plugins: extraPlugins = [], ...starlightOverrides } = options.starlight ?? {};

	return {
		site: `https://${owner}.github.io`,
		base,
		markdown: {
			// $...$ and $$...$$ math in Markdown and MDX pages, rendered with KaTeX at build time
			processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
		},
		...options.astro,
		integrations: [
			starlight({
				title: options.title,
				description: options.description,
				social: [{ icon: 'github', label: 'GitHub', href: github }],
				editLink: { baseUrl: `${github}/edit/${branch}/docs/` },
				lastUpdated: true,
				sidebar,
				...starlightOverrides,
				plugins: [...plugins, ...extraPlugins],
			}),
			...(options.astro?.integrations ?? []),
		],
	};
}
