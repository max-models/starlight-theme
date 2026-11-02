// Method cards: the export, the helpers of the catalogue, and what defineDocs({ methodcard }) adds.
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	apiLink,
	byModule,
	cardLink,
	cardModules,
	inlineHtml,
	moduleLabel,
	moduleSlug,
	numericsSidebar, excluded, exportCards, findPython, gitRoot, methodcardIntegration, orderText, shortName, VIRTUAL_MODULE } from '../lib/methodcard.ts';

vi.mock('@astrojs/starlight', () => ({ default: (options: unknown) => ({ name: 'starlight', options }) }));
vi.mock('starlight-pydocs', () => ({
	default: (options: unknown) => ({ name: 'pydocs', options }),
	pydocsSidebarGroup: 'PYDOCS',
}));
vi.mock('starlight-links-validator', () => ({ default: (options: unknown) => ({ name: 'links', options }) }));

const { default: defineDocs } = await import('../lib/config.ts');

type Any = Record<string, any>;

const card = (name: string, extra: Any = {}) => ({
	name,
	summary: 'A method.',
	equations: { update: 'x^{n+1} = x^n' },
	order: null,
	assumptions: [],
	references: [],
	lean_theorems: [],
	components: [],
	kind: 'function',
	module: name.split('.').slice(0, -1).join('.'),
	filepath: 'pkg/schemes.py',
	lineno: 3,
	...extra,
});

/** A stand-in for the project's Python that prints `output` (and exits with `status`). */
function fakePython(output: string, status = 0): string {
	const directory = mkdtempSync(join(tmpdir(), 'methodcard-'));
	writeFileSync(join(directory, 'out.json'), output);
	const script = join(directory, 'python');
	writeFileSync(script, `#!/bin/sh\necho "$@" > "${directory}/args"\ncat "${directory}/out.json"\necho "ModuleNotFoundError: No module named 'methodcard'" >&2\nexit ${status}\n`);
	chmodSync(script, 0o755);
	return script;
}

const exported = (cards: Any[], schema = 1) => JSON.stringify({ schema, package: 'pkg', cards });

const minimal = {
	repo: 'pkg',
	title: 'pkg',
	description: 'A package.',
	nav: [],
	sidebar: [{ label: 'Guides', items: [] }],
	crossref: false as const,
	pythonPackage: 'pkg',
	pyproject: '/project/pyproject.toml',
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('exportCards', () => {
	it('runs methodcard export in the project Python', () => {
		const cards = [card('pkg.schemes.drift')];
		expect(exportCards('pkg', '../src', fakePython(exported(cards)))).toEqual(cards);
	});

	it('explains a failure', () => {
		expect(() => exportCards('pkg', '../src', fakePython('', 1))).toThrow(/No module named 'methodcard'.*\n.*Install methodcard/);
		expect(() => exportCards('pkg', '../src', '/no/such/python')).toThrow(/could not export the cards of pkg/);
	});

	it('checks the schema', () => {
		expect(() => exportCards('pkg', '../src', fakePython(exported([], 2)))).toThrow(/schema 2, this theme reads 1/);
	});

	it('finds the top of the git checkout', () => {
		expect(gitRoot(join(__dirname, '..', 'example'))).toBe(resolve(__dirname, '..'));
		const outside = mkdtempSync(join(tmpdir(), 'nogit-'));
		expect(gitRoot(outside)).toBe(outside);
	});

	it('finds the Python like the notebook tool', () => {
		vi.stubEnv('DOCS_PYTHON', '/some/python');
		expect(findPython()).toBe('/some/python');
		vi.stubEnv('DOCS_PYTHON', '');
		expect(findPython(mkdtempSync(join(tmpdir(), 'novenv-')))).toMatch(/python3?$/);
	});
});

describe('helpers', () => {
	it('links to the API reference of starlight-pydocs', () => {
		expect(apiLink('/pkg', 'pkg', { name: 'pkg.schemes.drift', module: 'pkg.schemes' })).toBe('/pkg/api/pkg/schemes/#pkg.schemes.drift');
		expect(apiLink('/pkg', 'pkg', { name: 'pkg.Drift', module: 'pkg' })).toBe('/pkg/api/pkg/#pkg.Drift');
		expect(apiLink('/pkg/dev', 'pkg', { name: 'pkg.a.b.f', module: 'pkg.a.b' })).toBe('/pkg/dev/api/pkg/a/b/#pkg.a.b.f');
	});

	it('formats orders, names and exclusions', () => {
		expect(orderText(null)).toBe('');
		expect(orderText(2)).toBe('2');
		expect(orderText({ x: 2, v: 1 })).toBe('x: 2, v: 1');
		expect(shortName('pkg.schemes.Leapfrog')).toBe('Leapfrog');
		expect(excluded('pkg.a.f', ['pkg.a.'])).toBe(true);
		expect(excluded('pkg.a.f', ['pkg.a.f'])).toBe(true);
		expect(excluded('pkg.ab.f', ['pkg.a'])).toBe(false);
		expect(excluded('pkg.a.f')).toBe(false);
	});

	it('renders a summary inline', () => {
		const math = (tex: string) => `<m>${tex}</m>`;
		expect(inlineHtml('The integral of ``f`` on `[a, b]`, $h = (b - a)/n$ & <more>', math)).toBe(
			'The integral of <code>f</code> on <code>[a, b]</code>, <m>h = (b - a)/n</m> &amp; &lt;more&gt;'
		);
	});

	it('renders links in references', () => {
		const math = (tex: string) => `<m>${tex}</m>`;
		expect(inlineHtml('[Stix, Plasma Phys. $14$](https://doi.org/10.1088/x) and `code`', math)).toBe(
			'<a href="https://doi.org/10.1088/x">Stix, Plasma Phys. <m>14</m></a> and <code>code</code>'
		);
		expect(inlineHtml('[not a link](javascript:alert(1))', math)).toBe('[not a link](javascript:alert(1))');
	});

	it('names the module pages', () => {
		expect(moduleSlug('freeofcharge.slowing_down')).toBe('slowing-down');
		expect(moduleSlug('pkg.sub.module_name')).toBe('sub-module-name');
		expect(moduleSlug('pkg')).toBe('pkg');
		expect(moduleLabel('freeofcharge.slowing_down')).toBe('Slowing down');
		expect(moduleLabel('freeofcharge.chain', { 'freeofcharge.chain': 'Injector chain' })).toBe('Injector chain');
		expect(cardModules([card('pkg.b_c.f'), card('pkg.a.g')] as any, { 'pkg.a': 'First' })).toEqual([
			{ module: 'pkg.a', slug: 'a', label: 'First' },
			{ module: 'pkg.b_c', slug: 'b-c', label: 'B c' },
		]);
	});

	it('links a card to its module page, the overview or the API', () => {
		const target = { name: 'pkg.slowing_down.f', module: 'pkg.slowing_down' };
		const config = { base: '/pkg', package: 'pkg', pages: true, index: true };
		expect(cardLink(config, target)).toBe('/pkg/numerics/slowing-down/#pkg.slowing_down.f');
		expect(cardLink({ ...config, pages: false }, target)).toBe('/pkg/numerics/#pkg.slowing_down.f');
		expect(cardLink({ ...config, pages: false, index: false }, target)).toBe('/pkg/api/pkg/slowing_down/#pkg.slowing_down.f');
	});

	it('makes a sidebar link, or a group with the module pages', () => {
		const modules = [{ module: 'pkg.a', slug: 'a', label: 'A' }];
		const config = { title: 'Numerics', base: '/pkg', pages: false, index: true, modules };
		expect(numericsSidebar(config)).toEqual([{ label: 'Numerics', link: '/numerics/' }]);
		expect(numericsSidebar({ ...config, pages: true })).toEqual([
			{
				label: 'Numerics',
				items: [
					{ label: 'Overview', link: '/numerics/' },
					{ label: 'A', link: '/numerics/a/' },
				],
			},
		]);
	});

	it('injects the module pages, and the overview unless the site has its own', () => {
		const routes = (pages: boolean, index: boolean) => {
			const found: Any[] = [];
			const config = { title: 'N', package: 'pkg', cards: [], macros: {}, base: '/pkg', source: '', pages, index, modules: [] };
			(methodcardIntegration(config).hooks['astro:config:setup'] as any)({
				injectRoute: (route: Any) => found.push(route.pattern),
				updateConfig: () => {},
			});
			return found;
		};
		expect(routes(false, true)).toEqual(['/numerics']);
		expect(routes(true, true)).toEqual(['/numerics', '/numerics/[module]']);
		expect(routes(true, false)).toEqual(['/numerics/[module]']);
	});

	it('groups the cards by module', () => {
		const groups = byModule([card('pkg.z.g'), card('pkg.a.f'), card('pkg.z.a')] as any);
		expect(groups.map(([module, cards]) => [module, cards.map((c) => c.name)])).toEqual([
			['pkg.a', ['pkg.a.f']],
			['pkg.z', ['pkg.z.a', 'pkg.z.g']],
		]);
	});

	it('serves the cards as a virtual module and injects the catalogue', () => {
		const config = { title: 'Numerics', package: 'pkg', cards: [], macros: {}, base: '/pkg', source: '', pages: false, index: true, modules: [] };
		const routes: Any[] = [];
		let vite: Any;
		(methodcardIntegration(config).hooks['astro:config:setup'] as any)({
			injectRoute: (route: Any) => routes.push(route),
			updateConfig: (update: Any) => (vite = update.vite.plugins[0]),
		});
		expect(routes).toEqual([{ pattern: '/numerics', entrypoint: '@max-models/starlight-theme/routes/numerics.astro', prerender: true }]);
		const id = vite.resolveId(VIRTUAL_MODULE);
		expect(JSON.parse(vite.load(id).replace(/^export default |;$/g, ''))).toEqual(config);
		expect(vite.resolveId('other')).toBeUndefined();
		expect(vite.load('other')).toBeUndefined();
	});
});

describe('defineDocs({ methodcard })', () => {
	function build(options: Any = {}) {
		const config = defineDocs({ ...minimal, ...options }) as Any;
		const starlight = config.integrations[0].options as Any;
		return {
			config,
			sidebar: starlight.sidebar as Any[],
			pydocs: starlight.plugins.find((plugin: Any) => plugin.name === 'pydocs')?.options.packages[0],
			runner: starlight.plugins.find((plugin: Any) => plugin.name === 'pydocs')?.options.runner,
			integration: config.integrations.find((integration: Any) => integration.name === '@max-models/starlight-theme/methodcard'),
		};
	}

	function virtualConfig(integration: Any): Any {
		let vite: Any;
		integration.hooks['astro:config:setup']({ injectRoute: () => {}, updateConfig: (update: Any) => (vite = update.vite.plugins[0]) });
		return JSON.parse(vite.load(vite.resolveId(VIRTUAL_MODULE)).replace(/^export default |;$/g, ''));
	}

	it('adds nothing by default', () => {
		const { pydocs, integration, sidebar } = build();
		expect(pydocs.extensions).toBeUndefined();
		expect(integration).toBeUndefined();
		expect(sidebar.map((item) => item.label)).toEqual(['Guides', 'API reference']);
	});

	it('adds the griffe extension, the sidebar link and the catalogue', () => {
		vi.stubEnv('DOCS_PYTHON', fakePython(exported([card('pkg.schemes.drift'), card('pkg.private.helper')])));
		const { pydocs, runner, integration, sidebar } = build({
			methodcard: { exclude: ['pkg.private.'] },
			math: { macros: { '\\vect': '\\boldsymbol{#1}' } },
			pydocs: { extensions: ['griffe_inherited_docstrings'], extraRequirements: ['griffe-inherited-docstrings'] },
		});
		expect(pydocs.extensions).toEqual(['griffe_inherited_docstrings', 'methodcard.griffe_extension']);
		expect(pydocs.extraRequirements).toEqual(['griffe-inherited-docstrings', 'methodcard']);
		expect(runner).toEqual({ command: [process.env.DOCS_PYTHON, '-m', 'griffe'] });
		expect(sidebar.map((item) => item.label)).toEqual(['Guides', 'Numerics', 'API reference']);
		expect(sidebar[1].link).toBe('/numerics/');
		const links = build({ methodcard: true }).config.integrations[0].options.plugins.find((plugin: Any) => plugin.name === 'links').options;
		expect(links.exclude).toEqual(expect.arrayContaining(['/pkg/numerics/', '/pkg/numerics/#*']));
		const config = virtualConfig(integration);
		expect(config.cards.map((c: Any) => c.name)).toEqual(['pkg.schemes.drift']);
		expect(config).toMatchObject({
			title: 'Numerics',
			package: 'pkg',
			base: '/pkg',
			macros: { '\\vect': '\\boldsymbol{#1}' },
		});
		expect(config.source).toMatch(/^https:\/\/github\.com\/max-models\/pkg\/blob\/devel\/.*\/$/);
	});

	it('adds the module pages to the sidebar with pages', () => {
		vi.stubEnv('DOCS_PYTHON', fakePython(exported([card('pkg.chain.f'), card('pkg.slowing_down.g')])));
		const { sidebar, integration } = build({ methodcard: { pages: true, index: false, labels: { 'pkg.chain': 'Injector chain' } } });
		expect(sidebar[1]).toEqual({
			label: 'Numerics',
			items: [
				{ label: 'Overview', link: '/numerics/' },
				{ label: 'Injector chain', link: '/numerics/chain/' },
				{ label: 'Slowing down', link: '/numerics/slowing-down/' },
			],
		});
		const config = virtualConfig(integration);
		expect(config).toMatchObject({ pages: true, index: false });
		expect(config.modules.map((m: Any) => m.slug)).toEqual(['chain', 'slowing-down']);
	});

	it('takes a title and keeps the site integrations', () => {
		vi.stubEnv('DOCS_PYTHON', fakePython(exported([])));
		const extra = { name: 'extra', hooks: {} };
		const { config, sidebar, integration } = build({ methodcard: { title: 'Methods' }, astro: { integrations: [extra] } });
		expect(sidebar[1]).toEqual({ label: 'Methods', link: '/numerics/' });
		expect(config.integrations.at(-1)).toBe(extra);
		expect(virtualConfig(integration).title).toBe('Methods');
	});

	it('needs a Python package', () => {
		expect(() => build({ pythonPackage: undefined, methodcard: true })).toThrow(/needs pythonPackage/);
	});
});
