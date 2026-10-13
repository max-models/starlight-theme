// The Starlight plugin: the look of the max-models sites (palette, header with a row of section
// links, KaTeX styles) and the settings the components read (repository, branch, nav links).
// `defineDocs` adds it for you; use it directly in a site that builds its own Astro config.
import type { StarlightPlugin } from '@astrojs/starlight/types';
import type { ViteUserConfig } from 'astro';

export interface NavLink {
	label: string;
	/** Site-root path, e.g. "/getting-started/installation/" (the base path is added), or a full URL. */
	link: string;
	/** Path prefix that marks the link as current; defaults to the first segment of `link`. */
	section?: string;
}

export interface ThemeOptions {
	/** GitHub repository as "owner/name": the "View on GitHub" links of notebook pages. */
	repository: string;
	/** Branch for the notebook source links. Default "devel". */
	branch?: string;
	/** Links in the header, between the title and the search. */
	nav?: NavLink[];
}

/** What `virtual:starlight-theme/config` exports. */
export interface ThemeConfig {
	repository: string;
	branch: string;
	nav: Required<NavLink>[];
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

export default function theme(options: ThemeOptions): StarlightPlugin {
	const config: ThemeConfig = {
		repository: options.repository,
		branch: options.branch ?? 'devel',
		nav: (options.nav ?? []).map((link) => ({ ...link, section: link.section ?? sectionOf(link.link) })),
	};
	return {
		name: '@max-models/starlight-theme',
		hooks: {
			'config:setup'({ config: starlight, updateConfig, addIntegration }) {
				updateConfig({
					// the theme first, so a site's own customCss wins
					customCss: [
						'@max-models/starlight-theme/styles/math.css',
						'@max-models/starlight-theme/styles/theme.css',
						...(starlight.customCss ?? []),
					],
					components: {
						Header: '@max-models/starlight-theme/components/Header.astro',
						...starlight.components,
					},
				});
				addIntegration({
					name: '@max-models/starlight-theme/config',
					hooks: {
						'astro:config:setup'({ updateConfig: updateAstroConfig }) {
							updateAstroConfig({ vite: { plugins: [viteConfigModule(config)] } });
						},
					},
				});
			},
		},
	};
}
