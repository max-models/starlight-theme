// defineDocs and the theme plugin: what they make of the options and of DOCS_* variables.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Starlight and its plugins return their options, so the tests can look at them.
vi.mock('@astrojs/starlight', () => ({ default: (options: unknown) => ({ name: 'starlight', options }) }));
vi.mock('starlight-pydocs', () => ({
	default: (options: unknown) => ({ name: 'pydocs', options }),
	pydocsSidebarGroup: 'PYDOCS',
}));
vi.mock('starlight-links-validator', () => ({ default: (options: unknown) => ({ name: 'links', options }) }));

const { default: defineDocs } = await import('../lib/config.ts');
const { default: theme, themeConfig } = await import('../lib/plugin.ts');

type Any = Record<string, any>;

const minimal = {
	repo: 'simgeometry',
	title: 'simgeometry',
	description: 'Shapes.',
	nav: [{ label: 'API', link: '/api/simgeometry/', section: '/api/' }],
	sidebar: [{ label: 'Guides', items: [] }],
	crossref: false as const,
};

function build(options: Any = {}) {
	const config = defineDocs({ ...minimal, ...options }) as Any;
	const starlight = config.integrations[0].options as Any;
	const plugins = starlight.plugins as Any[];
	return {
		config,
		starlight,
		theme: plugins.find((plugin) => plugin.name === '@max-models/starlight-theme'),
		pydocs: plugins.find((plugin) => plugin.name === 'pydocs')?.options,
		links: plugins.find((plugin) => plugin.name === 'links')?.options,
	};
}

/** Run the theme plugin's hooks like Starlight and Astro would; return what they set up. */
function runTheme(plugin: Any, starlight: Any = {}, publicDir = new URL('file:///nonexistent/public/')) {
	const result: Any = { routes: [], middleware: [] };
	plugin.hooks['config:setup']({
		config: starlight,
		updateConfig: (update: Any) => (result.starlight = update),
		addRouteMiddleware: (middleware: Any) => result.middleware.push(middleware),
		addIntegration: (integration: Any) =>
			integration.hooks['astro:config:setup']({
				config: { publicDir },
				injectRoute: (route: Any) => result.routes.push(route),
				updateConfig: (update: Any) => {
					const vite = update.vite.plugins[0];
					result.virtual = JSON.parse(vite.load(vite.resolveId('virtual:starlight-theme/config')).replace(/^export default |;$/g, ''));
				},
			}),
	});
	return result;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('defineDocs', () => {
	it('serves the site at <owner>.github.io/<repo>/', () => {
		const { config, starlight } = build({ owner: 'someone', branch: 'main' });
		expect(config.site).toBe('https://someone.github.io');
		expect(config.base).toBe('/simgeometry');
		expect(starlight.editLink.baseUrl).toBe('https://github.com/someone/simgeometry/edit/main/docs/');
		expect(starlight.social[0].href).toBe('https://github.com/someone/simgeometry');
	});

	it('appends the API reference unless the sidebar places it', () => {
		const withPackage = build({ pythonPackage: 'simgeometry' });
		expect(withPackage.starlight.sidebar.at(-1)).toEqual({ label: 'API reference', items: ['PYDOCS'] });
		expect(withPackage.pydocs.packages[0]).toMatchObject({ name: 'simgeometry', search: ['../src'] });

		const placed = build({ pythonPackage: 'simgeometry', sidebar: [{ label: 'Reference', items: [{ label: 'API', items: ['PYDOCS'] }] }] });
		expect(placed.starlight.sidebar).toHaveLength(1);

		const none = build();
		expect(none.starlight.sidebar).toEqual(minimal.sidebar);
		expect(none.pydocs).toBeUndefined();
	});

	it('adds the base path to redirect targets', () => {
		const { config } = build({
			astro: {
				redirects: {
					'/old/': '/new/',
					'/kept/': '/simgeometry/kept/',
					'/away/': 'https://example.org/',
					'/moved/': { status: 301, destination: '/moved-here/' },
				},
			},
		});
		expect(config.redirects).toEqual({
			'/old/': '/simgeometry/new/',
			'/kept/': '/simgeometry/kept/',
			'/away/': 'https://example.org/',
			'/moved/': { status: 301, destination: '/simgeometry/moved-here/' },
		});
	});

	it('merges the starlight and astro overrides, plugins appended', () => {
		const extra = { name: 'extra', hooks: {} };
		const { config, starlight } = build({
			starlight: { lastUpdated: false, plugins: [extra] },
			astro: { trailingSlash: 'always' },
			logo: { src: './logo.svg' },
		});
		expect(starlight.lastUpdated).toBe(false);
		expect(starlight.plugins.at(-1)).toBe(extra);
		expect(starlight.plugins[0].name).toBe('@max-models/starlight-theme');
		expect(starlight.logo).toEqual({ src: './logo.svg' });
		expect(config.trailingSlash).toBe('always');
	});

	it('checks the links unless DOCS_VALIDATE_LINKS=false', () => {
		expect(build().links.exclude).toContain('/simgeometry/api/**');
		vi.stubEnv('DOCS_VALIDATE_LINKS', 'false');
		expect(build().links).toBeUndefined();
	});

	it('passes the KaTeX macros', () => {
		const { config } = build({ math: { macros: { '\\vect': '\\boldsymbol{#1}' } } });
		const plugins = config.markdown.processor.options.rehypePlugins;
		expect(plugins[0][1]).toEqual({ macros: { '\\vect': '\\boldsymbol{#1}' } });
		expect(plugins).toHaveLength(1);
	});
});

describe('stable and dev builds', () => {
	it('serves the dev build at <repo>/dev/ and moves its content links there', () => {
		vi.stubEnv('DOCS_CHANNEL', 'dev');
		const { config, theme: plugin, pydocs } = build({ pythonPackage: 'simgeometry', astro: { redirects: { '/a/': '/b/' } } });
		expect(config.base).toBe('/simgeometry/dev');
		expect(config.redirects['/a/']).toBe('/simgeometry/dev/b/');
		const rebase = config.markdown.processor.options.rehypePlugins[1];
		expect(rebase[1]).toEqual({ from: '/simgeometry/', to: '/simgeometry/dev/' });
		expect(pydocs.packages[0].sourceLink.ref).toBe('devel');
		const setup = runTheme(plugin);
		expect(setup.virtual.versions).toEqual({ current: 'dev', stable: '/simgeometry/', dev: '/simgeometry/dev/' });
		expect(setup.middleware).toEqual([{ entrypoint: '@max-models/starlight-theme/route-middleware' }]);
	});

	it('links the sources of the stable build to the release branch', () => {
		vi.stubEnv('DOCS_CHANNEL', 'stable');
		vi.stubEnv('DOCS_STABLE_BRANCH', 'release');
		const { config, theme: plugin, pydocs, starlight } = build({ pythonPackage: 'simgeometry' });
		expect(config.base).toBe('/simgeometry');
		expect(pydocs.packages[0].sourceLink.ref).toBe('release');
		expect(starlight.editLink.baseUrl).toContain('/edit/devel/'); // edits still go to devel
		const setup = runTheme(plugin);
		expect(setup.virtual.branch).toBe('release');
		expect(setup.virtual.versions.current).toBe('stable');
		expect(setup.middleware).toEqual([]);
	});

	it('rejects an unknown channel', () => {
		vi.stubEnv('DOCS_CHANNEL', 'beta');
		expect(() => build()).toThrow(/DOCS_CHANNEL/);
	});
});

describe('cross-references to sibling projects', () => {
	const inventories = (options: Any) => build({ pythonPackage: 'patchwork', repo: 'patchwork', ...options }).pydocs.inventories;

	it('adds the inventories of the projects named in crossref', () => {
		expect(inventories({ crossref: ['mpiarray', 'plasma-plots'] })).toEqual([
			'python',
			{ url: 'https://numpy.org/doc/stable/objects.inv' },
			{ url: 'https://max-models.github.io/mpiarray/api/mpiarray/objects.inv' },
			{ url: 'https://max-models.github.io/plasma-plots/api/plasma_plots/objects.inv' },
		]);
		expect(() => inventories({ crossref: ['nonexistent'] })).toThrow(/no project "nonexistent"/);
		expect(inventories({ crossref: false, inventories: ['python'] })).toEqual(['python']);
	});

	it('finds them in the dependencies of pyproject.toml by default', () => {
		const directory = mkdtempSync(join(tmpdir(), 'theme-'));
		const pyproject = join(directory, 'pyproject.toml');
		writeFileSync(pyproject, '[project]\nname = "patchwork"\ndependencies = ["maybempi>=0.1.2", "mpiarray@git+https://github.com/max-models/mpiarray@devel"]\n');
		expect(inventories({ crossref: undefined, pyproject, inventories: [] })).toEqual([
			{ url: 'https://max-models.github.io/maybempi/api/maybempi/objects.inv' },
			{ url: 'https://max-models.github.io/mpiarray/api/mpiarray/objects.inv' },
		]);
		expect(inventories({ crossref: undefined, pyproject: join(directory, 'missing.toml'), inventories: [] })).toEqual([]);
	});
});

describe('theme plugin', () => {
	it('fills the virtual config: nav sections, launch services, the projects menu', () => {
		const setup = runTheme(
			theme({
				repository: 'max-models/mpiarray',
				nav: [{ label: 'Guides', link: '/guides/intro/' }, { label: 'Home', link: 'https://example.org/' }],
				launch: ['colab'],
			})
		);
		expect(setup.virtual.branch).toBe('devel');
		expect(setup.virtual.nav.map((link: Any) => link.section)).toEqual(['/guides/', 'https://example.org/']);
		expect(setup.virtual.launch).toEqual(['colab']);
		expect(setup.virtual.versions).toBeNull();
		const current = setup.virtual.projects.filter((project: Any) => project.current);
		expect(current.map((project: Any) => project.href)).toEqual(['https://max-models.github.io/mpiarray/']);
		expect(themeConfig({ repository: 'a/b', projects: false }).projects).toEqual([]);
	});

	it('puts its CSS first and keeps the site components', () => {
		const setup = runTheme(theme({ repository: 'a/b' }), { customCss: ['./own.css'], components: { Header: './MyHeader.astro' } });
		expect(setup.starlight.customCss.at(-1)).toBe('./own.css');
		expect(setup.starlight.components.Header).toBe('./MyHeader.astro');
		expect(setup.starlight.components.Banner).toBe('@max-models/starlight-theme/components/Banner.astro');
	});

	it('serves the favicon unless the site has its own', () => {
		expect(runTheme(theme({ repository: 'a/b' })).routes).toEqual([
			{ pattern: '/favicon.svg', entrypoint: '@max-models/starlight-theme/routes/favicon.svg.ts', prerender: true },
		]);
		expect(runTheme(theme({ repository: 'a/b' }), { favicon: '/icon.png' }).routes).toEqual([]);
		const publicDir = mkdtempSync(join(tmpdir(), 'public-'));
		writeFileSync(join(publicDir, 'favicon.svg'), '<svg/>');
		expect(runTheme(theme({ repository: 'a/b' }), {}, new URL(`file://${publicDir}/`)).routes).toEqual([]);
	});
});
