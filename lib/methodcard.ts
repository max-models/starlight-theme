// Method cards (the methodcard package): the math each numerical method of the project declares.
// `defineDocs({ methodcard: true })` reads them with `methodcard export` in the project's Python,
// adds methodcard's griffe extension to the API reference (a "Numerics" section on each method),
// and a catalogue page at <base>/numerics/ made of <MethodCard> components.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AstroIntegration } from 'astro';

export interface MethodcardOptions {
	/** Title of the catalogue page and its sidebar link. Default "Numerics". */
	title?: string;
	/** Qualified names (or prefixes ending in ".") of the methods left out of the catalogue. */
	exclude?: string[];
	/**
	 * One page per module at `<base>/numerics/<module>/`, and a sidebar group (the overview, then
	 * the modules) instead of a single link. Default false.
	 */
	pages?: boolean;
	/**
	 * Generate the overview at `<base>/numerics/` (every card, by module). `false` leaves it to the
	 * site: a hand-written `src/content/docs/numerics/index.mdx`. Default true.
	 */
	index?: boolean;
	/** Sidebar and page titles of modules by qualified name, e.g. `{ 'pkg.chain': 'Injector chain' }`. */
	labels?: Record<string, string>;
}

/** A module with cards: its page and label. */
export interface MethodcardModule {
	/** The qualified module name. */
	module: string;
	/** Its page, `<base>/numerics/<slug>/`. */
	slug: string;
	/** Its title in the sidebar and on its page. */
	label: string;
}

/** One card, as `methodcard export` writes it. */
export interface MethodCardData {
	name: string;
	summary: string;
	equations: Record<string, string>;
	order: number | Record<string, number> | null;
	assumptions: string[];
	references: string[];
	lean_theorems: string[];
	components: string[];
	/** "attribute" for a property. */
	kind: 'class' | 'function' | 'attribute';
	module: string;
	filepath: string;
	lineno: number | null;
}

/** What `virtual:starlight-theme/methodcards` exports. */
export interface MethodcardConfig {
	title: string;
	package: string;
	cards: MethodCardData[];
	/** The KaTeX macros of the site. */
	macros: Record<string, string>;
	/** The base path of the site, e.g. "/freeofcharge". */
	base: string;
	/** The source of the package on GitHub, to which a card's `filepath` is appended. */
	source: string;
	/** One page per module (see `MethodcardOptions.pages`). */
	pages: boolean;
	/** Whether the theme generates the overview page. */
	index: boolean;
	/** The modules with cards, in order. */
	modules: MethodcardModule[];
}

/** The layout version of `methodcard export` this theme reads. */
export const SCHEMA = 1;
export const VIRTUAL_MODULE = 'virtual:starlight-theme/methodcards';
const RESOLVED = `\0${VIRTUAL_MODULE}`;

const venvPython = process.platform === 'win32' ? join('.venv', 'Scripts', 'python.exe') : join('.venv', 'bin', 'python');

/** The project's Python: $DOCS_PYTHON, else the nearest .venv above `start`, else python3 (as bin/run-tool.mjs). */
export function findPython(start = process.cwd()): string {
	if (process.env.DOCS_PYTHON) return process.env.DOCS_PYTHON;
	for (let directory = start; ; directory = dirname(directory)) {
		if (existsSync(join(directory, venvPython))) return join(directory, venvPython);
		if (dirname(directory) === directory) break;
	}
	return process.platform === 'win32' ? 'python' : 'python3';
}

/** The top of the git checkout that holds `directory` (the directory itself outside git). */
export function gitRoot(directory: string): string {
	const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: directory, encoding: 'utf8' });
	return result.status === 0 ? result.stdout.trim() : directory;
}

const EXPORT = 'import sys; from methodcard.export import main; sys.exit(main(sys.argv[1:]))';

/** Run `methodcard export <pkg>` in the project's Python and return its cards. */
export function exportCards(pkg: string, search: string, python = findPython()): MethodCardData[] {
	const result = spawnSync(python, ['-c', EXPORT, 'export', pkg, '--search', search], { encoding: 'utf8' });
	if (result.error || result.status !== 0) {
		const reason = result.error?.message ?? result.stderr.trim().split('\n').at(-1);
		throw new Error(
			`methodcard: could not export the cards of ${pkg} with ${python}: ${reason}\n` +
				'Install methodcard in the project (it is a dependency of a package with cards), or set DOCS_PYTHON.'
		);
	}
	const data = JSON.parse(result.stdout) as { schema: number; cards: MethodCardData[] };
	if (data.schema !== SCHEMA) {
		throw new Error(`methodcard: export schema ${data.schema}, this theme reads ${SCHEMA}; update one of them`);
	}
	return data.cards;
}

/** Whether a card is left out by the `exclude` option. */
export function excluded(name: string, exclude: string[] = []): boolean {
	return exclude.some((pattern) => (pattern.endsWith('.') ? name.startsWith(pattern) : name === pattern));
}

/** The link to a method on the API reference pages of starlight-pydocs. */
export function apiLink(base: string, pkg: string, card: Pick<MethodCardData, 'name' | 'module'>): string {
	const path = card.module.split('.').slice(1).join('/');
	return `${base}/api/${pkg}/${path ? `${path}/` : ''}#${card.name}`;
}

/** The short name of a method: the last part of its qualified name. */
export function shortName(name: string): string {
	return name.split('.').at(-1) ?? name;
}

/** "2" or "x: 2, v: 1". */
export function orderText(order: MethodCardData['order']): string {
	if (order === null) return '';
	if (typeof order === 'number') return String(order);
	return Object.entries(order)
		.map(([key, value]) => `${key}: ${value}`)
		.join(', ');
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (char) => ESCAPES[char]);

/**
 * A docstring summary or a reference as inline HTML: ``code`` and `code` as code, $math$
 * through `math` (inline KaTeX), [text](https://...) as a link, the rest escaped.
 */
export function inlineHtml(text: string, math: (tex: string) => string): string {
	return text
		.split(/(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|``[^`]+``|`[^`]+`|\$[^$]+\$)/)
		.map((part) => {
			const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
			if (link) return `<a href="${escapeHtml(link[2])}">${inlineHtml(link[1], math)}</a>`;
			if (/^``[^`]+``$/.test(part)) return `<code>${escapeHtml(part.slice(2, -2))}</code>`;
			if (/^`[^`]+`$/.test(part)) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
			if (/^\$[^$]+\$$/.test(part)) return math(part.slice(1, -1));
			return escapeHtml(part);
		})
		.join('');
}

/** The cards by module, in module order. */
export function byModule(cards: MethodCardData[]): [string, MethodCardData[]][] {
	const groups = new Map<string, MethodCardData[]>();
	for (const card of [...cards].sort((a, b) => a.name.localeCompare(b.name))) {
		groups.set(card.module, [...(groups.get(card.module) ?? []), card]);
	}
	return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** The page of a module: its name without the package, `_` and `.` as `-` ("slowing-down"). */
export function moduleSlug(module: string): string {
	const rest = module.split('.').slice(1).join('-');
	return (rest || module).replaceAll('_', '-').toLowerCase();
}

/** The title of a module: the label given, else its last part in words ("Slowing down"). */
export function moduleLabel(module: string, labels: Record<string, string> = {}): string {
	if (labels[module]) return labels[module];
	const words = (module.split('.').at(-1) ?? module).replaceAll('_', ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The modules of the cards, sorted by name. */
export function cardModules(cards: MethodCardData[], labels: Record<string, string> = {}): MethodcardModule[] {
	return byModule(cards).map(([module]) => ({ module, slug: moduleSlug(module), label: moduleLabel(module, labels) }));
}

/** Where a card is shown: its module page, else the overview, else its API entry. */
export function cardLink(config: Pick<MethodcardConfig, 'base' | 'package' | 'pages' | 'index'>, card: Pick<MethodCardData, 'name' | 'module'>): string {
	if (config.pages) return `${config.base}/numerics/${moduleSlug(card.module)}/#${card.name}`;
	if (config.index) return `${config.base}/numerics/#${card.name}`;
	return apiLink(config.base, config.package, card);
}

/**
 * The sidebar entry: a link to the overview, or with `pages` a group of the overview and the
 * modules. Site-root paths: Starlight adds the base path to sidebar links itself.
 */
export function numericsSidebar(config: Pick<MethodcardConfig, 'title' | 'pages' | 'modules'>) {
	const overview = { label: config.pages ? 'Overview' : config.title, link: '/numerics/' };
	if (!config.pages) return [overview];
	const modules = config.modules.map((module) => ({ label: module.label, link: `/numerics/${module.slug}/` }));
	return [{ label: config.title, items: [overview, ...modules] }];
}

/** The Astro integration: the virtual module with the cards and the catalogue route. */
export function methodcardIntegration(config: MethodcardConfig): AstroIntegration {
	return {
		name: '@max-models/starlight-theme/methodcard',
		hooks: {
			'astro:config:setup'({ injectRoute, updateConfig }) {
				updateConfig({
					vite: {
						plugins: [
							{
								name: 'starlight-theme-methodcards',
								resolveId: (id: string) => (id === VIRTUAL_MODULE ? RESOLVED : undefined),
								load: (id: string) => (id === RESOLVED ? `export default ${JSON.stringify(config)};` : undefined),
							},
						],
					},
				});
				if (config.index) {
					injectRoute({ pattern: '/numerics', entrypoint: '@max-models/starlight-theme/routes/numerics.astro', prerender: true });
				}
				if (config.pages) {
					injectRoute({
						pattern: '/numerics/[module]',
						entrypoint: '@max-models/starlight-theme/routes/numerics-module.astro',
						prerender: true,
					});
				}
			},
		},
	};
}
