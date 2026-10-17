// The whole Astro config of a max-models docs site, from the few things that differ between them.
//
//     // docs/astro.config.mjs
//     import { defineDocs } from '@max-models/starlight-theme';
//     export default defineDocs({ repo: 'simgeometry', title: ..., description: ..., nav: [...], sidebar: [...] });
//
// The site is served at https://<owner>.github.io/<repo>/, with math, the theme, the API reference
// of a Python package and a link check. `starlight` and `astro` are merged over the result for
// anything that is particular to one site.
//
// DOCS_CHANNEL=stable|dev (set by the docs workflow when it builds both) serves the dev build at
// <repo>/dev/ and adds a stable/dev switch; the stable build links its sources to DOCS_STABLE_BRANCH.
import { resolve } from 'node:path';
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import type { StarlightUserConfig } from '@astrojs/starlight/types';
import type { AstroUserConfig } from 'astro';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import starlightLinksValidator from 'starlight-links-validator';
import starlightPydocs, { pydocsSidebarGroup, type PydocsPackageInput, type PydocsUserConfig } from 'starlight-pydocs';
import theme, { type LaunchService, type NavLink, type Versions } from './plugin.ts';
import { dependencyProjects, inventoryUrl, projects as defaultProjects, type Project } from './projects.ts';
import { rehypeRebase } from './rebase.ts';

type Sidebar = NonNullable<StarlightUserConfig['sidebar']>;
type RehypePlugins = NonNullable<NonNullable<Parameters<typeof unified>[0]>['rehypePlugins']>;

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
	/**
	 * Sibling projects (repository names from `projects`) whose API reference the annotations link
	 * to. Default: those in the dependencies of `pyproject`; `false` for none.
	 */
	crossref?: string[] | false;
	/** The project's pyproject.toml, for `crossref`. Default "../pyproject.toml" (from docs/). */
	pyproject?: string;
	/** The "Projects" menu of the header (default the max-models projects); `false` hides it. */
	projects?: Project[] | false;
	/** Buttons on the notebook pages that run the notebook in Colab or Binder. Default none. */
	launch?: LaunchService[];
	/** KaTeX settings: `macros` such as `{ '\\vec': '\\boldsymbol{#1}' }`, for every page. */
	math?: { macros?: Record<string, string> };
	/** Starlight's logo, e.g. `{ src: './src/assets/logo.svg' }`. */
	logo?: StarlightUserConfig['logo'];
	/** Merged over the Starlight config (plugins are appended to the theme's). */
	starlight?: Partial<StarlightUserConfig>;
	/**
	 * Merged over the Astro config, e.g. `redirects: { '/tutorials/': '/guides/' }` (site-root paths;
	 * the base path is added to the targets, which Astro does not do).
	 */
	astro?: AstroUserConfig;
}

function containsPlaceholder(items: unknown): boolean {
	if (!Array.isArray(items)) return false;
	return items.some(
		(item) => item === pydocsSidebarGroup || (typeof item === 'object' && item !== null && containsPlaceholder((item as { items?: unknown }).items))
	);
}

/** The stable and dev builds of the docs workflow, from DOCS_CHANNEL; undefined in a plain build. */
function versionsOf(repo: string): Versions | undefined {
	const channel = process.env.DOCS_CHANNEL;
	if (channel === undefined || channel === '') return undefined;
	if (channel !== 'stable' && channel !== 'dev') throw new Error(`DOCS_CHANNEL must be "stable" or "dev", not "${channel}"`);
	return { current: channel, stable: `/${repo}/`, dev: `/${repo}/dev/` };
}

/** The inventories of the sibling projects the site links to. */
function crossrefInventories(options: DocsOptions): { url: string }[] {
	if (options.crossref === false) return [];
	const known = options.projects || defaultProjects;
	const linked =
		options.crossref?.map((repo) => {
			const project = known.find((candidate) => candidate.repo === repo);
			if (!project) throw new Error(`crossref: no project "${repo}" in projects (${known.map((p) => p.repo).join(', ')})`);
			return project;
		}) ?? dependencyProjects(resolve(options.pyproject ?? '../pyproject.toml'), options.repo, known);
	return linked.flatMap((project) => {
		const url = inventoryUrl(project);
		return url ? [{ url }] : [];
	});
}

export default function defineDocs(options: DocsOptions): AstroUserConfig {
	const owner = options.owner ?? 'max-models';
	const branch = options.branch ?? 'devel';
	const versions = versionsOf(options.repo);
	const base = versions?.current === 'dev' ? `/${options.repo}/dev` : `/${options.repo}`;
	// the stable build shows the sources of the release it documents
	const sourceBranch = versions?.current === 'stable' ? (process.env.DOCS_STABLE_BRANCH || 'main') : branch;
	const github = `https://github.com/${owner}/${options.repo}`;
	const pkg = options.pythonPackage;

	const plugins: NonNullable<StarlightUserConfig['plugins']> = [
		theme({
			repository: `${owner}/${options.repo}`,
			branch: sourceBranch,
			nav: options.nav,
			versions,
			launch: options.launch,
			projects: options.projects,
		}),
	];
	if (pkg) {
		const inventories = [
			...(options.inventories ?? ['python', { url: 'https://numpy.org/doc/stable/objects.inv' }]),
			...crossrefInventories(options),
		];
		plugins.push(
			starlightPydocs({
				packages: [
					{
						name: pkg,
						label: 'All modules',
						search: ['../src'],
						docstringStyle: 'google',
						members: { exclude: [`${pkg}.tests`, `${pkg}.tests.*`] },
						sourceLink: { host: 'github', repo: `${owner}/${options.repo}`, ref: sourceBranch, root: '..' },
						sidebar: { collapsed: false },
						...options.pydocs,
					},
				],
				// The interpreter griffe runs in (set by `make docs-*`); falls back to uvx / python.
				runner: process.env.DOCS_PYTHON ? { python: process.env.DOCS_PYTHON } : undefined,
				inventories,
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

	// Astro adds the base path to a redirect's source but not to its target
	const withBase = (path: string) => (path.startsWith('/') && !path.startsWith(`${base}/`) ? `${base}${path}` : path);
	const redirects = Object.fromEntries(
		Object.entries(options.astro?.redirects ?? {}).map(([from, to]) => [
			from,
			typeof to === 'string' ? withBase(to) : { ...to, destination: withBase(to.destination) },
		])
	);

	const rehypePlugins: RehypePlugins = [[rehypeKatex, { macros: options.math?.macros ?? {} }]];
	// the dev build: content links to /<repo>/... into /<repo>/dev/ (before the link check)
	if (versions?.current === 'dev') rehypePlugins.push([rehypeRebase, { from: versions.stable, to: versions.dev }]);

	return {
		site: `https://${owner}.github.io`,
		base,
		markdown: {
			// $...$ and $$...$$ math in Markdown and MDX pages, rendered with KaTeX at build time
			processor: unified({
				remarkPlugins: [remarkMath],
				rehypePlugins,
			}),
		},
		...options.astro,
		redirects,
		integrations: [
			starlight({
				title: options.title,
				description: options.description,
				social: [{ icon: 'github', label: 'GitHub', href: github }],
				...(options.logo ? { logo: options.logo } : {}),
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
