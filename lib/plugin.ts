// The Starlight plugin: the look of the max-models sites (palette, header with a row of section
// links, KaTeX styles, favicon) and the settings the components read (repository, branch, nav links,
// versions, projects menu).
// `defineDocs` adds it for you; use it directly in a site that builds its own Astro config.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { StarlightPlugin } from '@astrojs/starlight/types';
import type { ViteUserConfig } from 'astro';
import { menuEntries, PROJECTS_URL, type MenuEntry, type Project } from './project-menu.ts';
import { projects as defaultProjects } from './projects.ts';

export interface NavLink {
	label: string;
	/** Site-root path, e.g. "/getting-started/installation/" (the base path is added), or a full URL. */
	link: string;
	/** Path prefix that marks the link as current; defaults to the first segment of `link`. */
	section?: string;
}

/** The stable and the development docs of one site, served side by side. */
export interface Versions {
	/** Which one this build is. */
	current: 'stable' | 'dev';
	/** Base path of the stable docs, e.g. "/simgeometry/". */
	stable: string;
	/** Base path of the development docs, e.g. "/simgeometry/dev/". */
	dev: string;
}

/** Where a notebook page offers to run the notebook. */
export type LaunchService = 'colab' | 'binder';

export interface ThemeOptions {
	/** GitHub repository as "owner/name": the "View on GitHub" links of notebook pages. */
	repository: string;
	/** Branch for the notebook source links. Default "devel". */
	branch?: string;
	/** Links in the header, between the title and the search. */
	nav?: NavLink[];
	/** A stable/dev switch in the header and a notice on the dev pages. */
	versions?: Versions;
	/** "Open in Colab" / "Launch Binder" buttons on the notebook pages. Default none. */
	launch?: LaunchService[];
	/**
	 * The "Projects" menu of the header: by default the list at `projectsUrl`, loaded in the
	 * browser, with the theme's list as the fallback; a list of its own (no loading), or `false`
	 * to hide it.
	 */
	projects?: Project[] | false;
	/** The JSON list of projects the menu loads (default https://max-models.github.io/projects.json); `false` keeps the built-in one. */
	projectsUrl?: string | false;
}

/** What `virtual:starlight-theme/config` exports. */
export interface ThemeConfig {
	repository: string;
	branch: string;
	nav: Required<NavLink>[];
	versions: Versions | null;
	launch: LaunchService[];
	projects: MenuEntry[];
	/** Where the header script loads the menu from; null for none. */
	projectsUrl: string | null;
}

const VIRTUAL_ID = 'virtual:starlight-theme/config';

function sectionOf(link: string): string {
	if (/^[a-z]+:\/\//.test(link)) return link;
	const first = link.split('/').filter(Boolean)[0];
	return first ? `/${first}/` : '/';
}

function viteConfigModule(config: ThemeConfig): NonNullable<ViteUserConfig['plugins']>[number] {
	return {
		name: 'vite-plugin-starlight-theme-config',
		resolveId(id: string) {
			if (id === VIRTUAL_ID) return `\0${VIRTUAL_ID}`;
		},
		load(id: string) {
			if (id === `\0${VIRTUAL_ID}`) return `export default ${JSON.stringify(config)};`;
		},
	};
}

export function themeConfig(options: ThemeOptions): ThemeConfig {
	const [owner, repo] = options.repository.split('/');
	return {
		repository: options.repository,
		branch: options.branch ?? 'devel',
		nav: (options.nav ?? []).map((link) => ({ ...link, section: link.section ?? sectionOf(link.link) })),
		versions: options.versions ?? null,
		launch: options.launch ?? [],
		projects: options.projects === false ? [] : menuEntries(options.projects ?? defaultProjects, owner, repo),
		projectsUrl: options.projects === undefined && options.projectsUrl !== false ? (options.projectsUrl ?? PROJECTS_URL) : null,
	};
}

export default function theme(options: ThemeOptions): StarlightPlugin {
	const config = themeConfig(options);
	return {
		name: '@max-models/starlight-theme',
		hooks: {
			'config:setup'({ config: starlight, updateConfig, addIntegration, addRouteMiddleware }) {
				updateConfig({
					// the theme first, so a site's own customCss wins
					customCss: [
						'@max-models/starlight-theme/styles/math.css',
						'@max-models/starlight-theme/styles/theme.css',
						...(starlight.customCss ?? []),
					],
					components: {
						Header: '@max-models/starlight-theme/components/Header.astro',
						Banner: '@max-models/starlight-theme/components/Banner.astro',
						...starlight.components,
					},
				});
				// the dev build: hero and prev/next links of the frontmatter into /<repo>/dev/
				if (config.versions?.current === 'dev') {
					addRouteMiddleware({ entrypoint: '@max-models/starlight-theme/route-middleware' });
				}
				addIntegration({
					name: '@max-models/starlight-theme/config',
					hooks: {
						'astro:config:setup'({ config: astro, injectRoute, updateConfig: updateAstroConfig }) {
							updateAstroConfig({ vite: { plugins: [viteConfigModule(config)] } });
							// the max-models favicon, unless the site has its own
							const own = new URL('favicon.svg', astro.publicDir);
							if (starlight.favicon === undefined && !existsSync(fileURLToPath(own))) {
								injectRoute({
									pattern: '/favicon.svg',
									entrypoint: '@max-models/starlight-theme/routes/favicon.svg.ts',
									prerender: true,
								});
							}
						},
					},
				});
			},
		},
	};
}
