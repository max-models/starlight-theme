// The Starlight plugin: the look of the max-models sites (palette, header with a row of section
// links and the wave logo, the home page hero on a header picture with the latest release, a
// footer naming the project family, a "Cite" page, KaTeX styles, favicon, share image) and the
// settings the components read (repository, branch, nav links, versions, projects menu).
// `defineDocs` adds it for you; use it directly in a site that builds its own Astro config.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { StarlightPlugin } from '@astrojs/starlight/types';
import type { ViteUserConfig } from 'astro';
import type { Citation, License } from './citation.ts';
import { menuEntries, PROJECTS_URL, type MenuEntry, type Project } from './project-menu.ts';
import { projects as defaultProjects } from './projects.ts';
import type { ReleaseSource } from './release.ts';

export interface NavLink {
	label: string;
	/** Site-root path, e.g. "/getting-started/installation/" (the base path is added), or a full URL. */
	link: string;
	/** Path prefix that marks the link as current; defaults to the first segment of `link`. */
	section?: string;
	/** One line under the link in the home page's `<StartHere />` grid. */
	description?: string;
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
	/**
	 * The latest release in the hero: from PyPI with `pypi` (the distribution name; GitHub when that
	 * fails), else from the GitHub releases of `repository`; `false` for no badge.
	 */
	release?: { pypi?: string } | false;
	/** The wave logo before the site title, when the site sets no Starlight `logo`. Default true. */
	logo?: boolean;
	/** How to cite the project: a "Cite" page and a link to it in the footer. */
	citation?: Citation;
	/** The project's license, in the footer. */
	license?: License;
	/** A share image of the site (`<base>/og.png`, the header picture with the title) for link previews. Default true. */
	shareImage?: boolean;
}

/** What `virtual:starlight-theme/config` exports. */
export interface ThemeConfig {
	repository: string;
	branch: string;
	nav: (NavLink & { section: string })[];
	versions: Versions | null;
	launch: LaunchService[];
	projects: MenuEntry[];
	/** Where the header script loads the menu from; null for none. */
	projectsUrl: string | null;
	release: ReleaseSource | null;
	logo: boolean;
	citation: Citation | null;
	license: License | null;
	/** The owner's page of all projects, for the footer, e.g. https://max-models.github.io/. */
	family: { name: string; href: string };
	/** Title and description of the site, for the share image (set from the Starlight config). */
	site: { title: string; description: string };
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
		release: options.release === false ? null : { github: options.repository, pypi: options.release?.pypi ?? null },
		logo: options.logo ?? true,
		citation: options.citation ?? null,
		license: options.license ?? null,
		family: { name: `${owner} projects`, href: `https://${owner}.github.io/` },
		site: { title: '', description: '' },
	};
}

export default function theme(options: ThemeOptions): StarlightPlugin {
	const config = themeConfig(options);
	return {
		name: '@max-models/starlight-theme',
		hooks: {
			'config:setup'({ config: starlight, astroConfig, updateConfig, addIntegration, addRouteMiddleware }) {
				const title = typeof starlight.title === 'string' ? starlight.title : (Object.values(starlight.title ?? {})[0] ?? '');
				config.site = { title, description: starlight.description ?? '' };
				config.logo &&= starlight.logo === undefined;
				// link previews: the share image, as an absolute URL (needs Astro's `site`)
				const shareImage =
					options.shareImage !== false && astroConfig.site
						? new URL(`${astroConfig.base.replace(/\/?$/, '/')}og.png`, astroConfig.site).href
						: undefined;
				updateConfig({
					head: [
						...(shareImage
							? [
									{ tag: 'meta' as const, attrs: { property: 'og:image', content: shareImage } },
									{ tag: 'meta' as const, attrs: { property: 'og:image:width', content: '1200' } },
									{ tag: 'meta' as const, attrs: { property: 'og:image:height', content: '630' } },
									{ tag: 'meta' as const, attrs: { name: 'twitter:card', content: 'summary_large_image' } },
								]
							: []),
						...(starlight.head ?? []),
					],
					// the theme first, so a site's own customCss wins
					customCss: [
						'@max-models/starlight-theme/styles/math.css',
						'@max-models/starlight-theme/styles/theme.css',
						...(starlight.customCss ?? []),
					],
					components: {
						Header: '@max-models/starlight-theme/components/Header.astro',
						Banner: '@max-models/starlight-theme/components/Banner.astro',
						Hero: '@max-models/starlight-theme/components/Hero.astro',
						SiteTitle: '@max-models/starlight-theme/components/SiteTitle.astro',
						Footer: '@max-models/starlight-theme/components/Footer.astro',
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
							if (shareImage) {
								injectRoute({ pattern: '/og.png', entrypoint: '@max-models/starlight-theme/routes/og.png.ts', prerender: true });
							}
							if (config.citation) {
								injectRoute({ pattern: '/cite', entrypoint: '@max-models/starlight-theme/routes/cite.astro', prerender: true });
							}
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
