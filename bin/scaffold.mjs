// What `starlight-theme-init` writes into a project: the docs/ site, its workflow and a Renovate
// config, from what it finds in the project (repository, pyproject.toml, package, tutorials/,
// examples/). Pure functions of that, so the tests can check them; bin/init.mjs does the writing.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Files of the old per-project setup that the theme replaces (removed by --migrate). */
export const REPLACED_FILES = [
	'docs/src/components/Header.astro',
	'docs/src/components/NotebookHeader.astro',
	'docs/src/components/NotebookImage.astro',
	'docs/src/components/RawHtml.astro',
	'docs/src/utils/base.ts',
	'docs/src/styles/custom.css',
	'docs/scripts/check-mdx.mjs',
	'docs/tools/notebooks.py',
	'docs/tools/mpi_kernel.py',
];

/** Direct dependencies of docs/package.json that come with the theme (removed by --migrate). */
export const REPLACED_DEPENDENCIES = [
	'katex',
	'remark-math',
	'rehype-katex',
	'starlight-pydocs',
	'starlight-links-validator',
	'@astrojs/markdown-remark',
	'@mdx-js/mdx',
];

const THEME = '@max-models/starlight-theme';

function git(root, ...args) {
	try {
		return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

/** Owner and name of a GitHub remote URL (ssh or https). */
export function parseRemote(url) {
	const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
	return match ? { owner: match[1], repo: match[2] } : undefined;
}

function hasFile(directory, suffix) {
	if (!existsSync(directory)) return false;
	for (const name of readdirSync(directory)) {
		if (name.startsWith('.') || name.startsWith('_')) continue;
		const path = join(directory, name);
		if (statSync(path).isDirectory() ? hasFile(path, suffix) : name.endsWith(suffix)) return true;
	}
	return false;
}

/** The import package in src/ (or the project root), skipping tests. */
function findPackage(root) {
	for (const directory of [join(root, 'src'), root]) {
		if (!existsSync(directory)) continue;
		const found = readdirSync(directory)
			.filter((name) => !['tests', 'docs', 'examples', 'tutorials'].includes(name) && !name.startsWith('.'))
			.filter((name) => existsSync(join(directory, name, '__init__.py')))
			.sort();
		if (found.length) return found[0];
	}
	return undefined;
}

/** What the scaffold needs to know about the project at `root`. */
export function detect(root) {
	const remote = parseRemote(git(root, 'remote', 'get-url', 'origin'));
	const pyprojectPath = join(root, 'pyproject.toml');
	const pyproject = existsSync(pyprojectPath) ? readFileSync(pyprojectPath, 'utf8') : '';
	const project = pyproject.split(/^\[project\]\s*$/m)[1]?.split(/^\[/m)[0] ?? '';
	const repo = remote?.repo ?? basename(root);
	return {
		owner: remote?.owner ?? 'max-models',
		repo,
		title: repo,
		description: project.match(/^description\s*=\s*"([^"]*)"/m)?.[1] ?? '',
		pythonPackage: findPackage(root),
		tutorials: hasFile(join(root, 'tutorials'), '.ipynb'),
		gallery: hasFile(join(root, 'examples'), '.py'),
	};
}

/** A JS string literal in single quotes. */
const js = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** The theme dependency and the versions of its peers, from the theme's own package.json. */
export function themeVersions(themePackage) {
	return {
		theme: `github:max-models/starlight-theme#v${themePackage.version}`,
		tag: `v${themePackage.version}`,
		starlight: themePackage.devDependencies['@astrojs/starlight'],
		astro: themePackage.devDependencies.astro,
		sharp: '^0.35.3',
	};
}

function scripts(project) {
	const convert = [project.tutorials && 'starlight-notebooks convert', project.gallery && 'starlight-gallery convert']
		.filter(Boolean)
		.map((command) => `${command} && `)
		.join('');
	return {
		dev: `${convert}DOCS_VALIDATE_LINKS=false astro dev`,
		build: `${convert}starlight-check-mdx && astro build`,
		preview: 'astro preview',
		...(project.tutorials ? { notebooks: 'starlight-notebooks' } : {}),
		...(project.gallery ? { gallery: 'starlight-gallery' } : {}),
		astro: 'astro',
	};
}

export function packageJson(project, versions) {
	return {
		name: `${project.repo}-docs`,
		private: true,
		type: 'module',
		version: '0.0.0',
		engines: { node: '>=22.12.0' },
		scripts: scripts(project),
		dependencies: {
			'@astrojs/starlight': versions.starlight,
			[THEME]: versions.theme,
			astro: versions.astro,
			sharp: versions.sharp,
		},
	};
}

/** An existing docs/package.json moved onto the theme: its dependency in, the replaced ones out. */
export function migratePackageJson(existing, project, versions) {
	const dependencies = { ...existing.dependencies };
	for (const name of REPLACED_DEPENDENCIES) delete dependencies[name];
	dependencies[THEME] = versions.theme;
	dependencies['@astrojs/starlight'] ??= versions.starlight;
	dependencies.astro ??= versions.astro;
	dependencies.sharp ??= versions.sharp;
	const sorted = Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)));
	return { ...existing, scripts: { ...scripts(project), ...existing.scripts }, dependencies: sorted };
}

export function astroConfig(project) {
	// the descriptions show in the <StartHere /> grid of the home page
	const nav = [
		`{ label: 'Getting started', link: '/getting-started/installation/', description: 'Install the package.' }`,
		project.tutorials && `{ label: 'Tutorials', link: '/tutorials/', description: 'Notebooks, run and converted to pages.' }`,
		project.gallery && `{ label: 'Gallery', link: '/examples/', description: 'Example scripts and their figures.' }`,
		project.pythonPackage &&
			`{ label: 'API', link: ${js(`/api/${project.pythonPackage}/`)}, section: '/api/', description: 'Generated from the docstrings.' }`,
	].filter(Boolean);
	const sidebar = [
		`{ label: 'Getting started', items: [{ label: 'Installation', slug: 'getting-started/installation' }] }`,
		project.tutorials && `{ label: 'Tutorials', items: [{ autogenerate: { directory: 'tutorials' } }] }`,
		project.gallery && `{ label: 'Gallery', items: [{ autogenerate: { directory: 'examples' } }] }`,
	].filter(Boolean);
	const lines = [
		`\trepo: ${js(project.repo)},`,
		project.owner !== 'max-models' && `\towner: ${js(project.owner)},`,
		`\ttitle: ${js(project.title)},`,
		`\tdescription: ${js(project.description || project.title)},`,
		project.pythonPackage && `\tpythonPackage: ${js(project.pythonPackage)},`,
		`\tnav: [\n${nav.map((item) => `\t\t${item},`).join('\n')}\n\t],`,
		`\tsidebar: [\n${sidebar.map((item) => `\t\t${item},`).join('\n')}\n\t],`,
	].filter(Boolean);
	return `// @ts-check
// The shared max-models docs setup (@max-models/starlight-theme): served at
// https://${project.owner}.github.io/${project.repo}/, with math${project.pythonPackage ? ', the API reference' : ''} and a link check.
import { defineDocs } from '@max-models/starlight-theme';

export default defineDocs({
${lines.join('\n')}
});
`;
}

function gitignore(project) {
	const generated = [
		project.tutorials && 'public/tutorials/\nsrc/content/docs/tutorials/*.mdx',
		project.gallery && 'public/examples/\nsrc/content/docs/examples/*.mdx',
	].filter(Boolean);
	return `# Astro
dist/
.astro/
node_modules/
${generated.length ? `# generated by starlight-notebooks / starlight-gallery (regenerated in CI)\n.cache/\n${generated.join('\n')}\n` : ''}`;
}

/** The command that installs the project, shown in the hero. */
const installCommand = (project) => `pip install git+https://github.com/${project.owner}/${project.repo}`;

function indexPage(project) {
	const features = [
		project.pythonPackage &&
			`\t<Card title=${JSON.stringify(project.pythonPackage)} icon="rocket">\n\t\t{${JSON.stringify(project.description || 'What the package does.')}}\n\t</Card>`,
		project.tutorials && `\t<Card title="Tutorials" icon="open-book">\n\t\tNotebooks that run in CI, so their output matches the code.\n\t</Card>`,
		project.gallery && `\t<Card title="Gallery" icon="seti:image">\n\t\tExample scripts with their figures.\n\t</Card>`,
	].filter(Boolean);
	return `---
title: ${JSON.stringify(project.title)}
description: ${JSON.stringify(project.description || project.title)}
template: splash
heroInstall: ${JSON.stringify(installCommand(project))}
hero:
  tagline: ${JSON.stringify(project.description || project.title)}
  actions:
    - text: Get started
      link: /${project.repo}/getting-started/installation/
      icon: right-arrow
    - text: View on GitHub
      link: https://github.com/${project.owner}/${project.repo}
      icon: external
      variant: minimal
---

import { Card, CardGrid } from '@astrojs/starlight/components';
import StartHere from '${THEME}/components/StartHere.astro';

${
	features.length
		? `## What is included

{/* a card per feature of the package */}
<CardGrid>
${features.join('\n')}
</CardGrid>

`
		: ''
}## Start here

<StartHere />
`;
}

function installationPage(project) {
	const usage = project.pythonPackage ? `\n\nThen, in Python:\n\n\`\`\`python\nimport ${project.pythonPackage}\n\`\`\`` : '';
	return `---
title: Installation
description: Install ${project.title}.
---

\`\`\`sh
${installCommand(project)}
\`\`\`${usage}
`;
}

export function workflow(project, versions) {
	const smoke = [
		project.tutorials && 'tutorials/index.html',
		project.gallery && 'examples/index.html',
		project.pythonPackage && `api/${project.pythonPackage}/index.html`,
	].filter(Boolean);
	const inputs = [
		!project.tutorials && 'notebooks: false',
		project.gallery && 'gallery: true',
		'# stable-branch: main  # deploy the latest release at /<repo>/ and devel at /<repo>/dev/',
		smoke.length && `smoke-paths: |\n${smoke.map((path) => `        ${path}`).join('\n')}`,
	].filter(Boolean);
	return `name: Docs

# The Astro + Starlight site in docs/, built on every push and pull request with the shared workflow
# of max-models/starlight-theme; deployed to GitHub Pages from devel.

on:
  push:
    branches: ["main", "devel"]
  pull_request:
    branches: ["main", "devel"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: docs-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  docs:
    uses: max-models/starlight-theme/.github/workflows/docs.yml@${versions.tag}
    with:
${inputs.map((input) => `      ${input}`).join('\n')}
`;
}

export function renovateConfig() {
	return `${JSON.stringify(
		{
			$schema: 'https://docs.renovatebot.com/renovate-schema.json',
			extends: ['config:recommended', 'github>max-models/starlight-theme:renovate-preset'],
			baseBranchPatterns: ['devel'],
		},
		null,
		2
	)}\n`;
}

export function makefileSnippet(project) {
	const notebooks = project.tutorials;
	const gallery = project.gallery;
	const convert = [notebooks && '\t$(NOTEBOOKS) convert', gallery && '\t$(GALLERY) convert'].filter(Boolean).join('\n');
	return `PYTHON ?= .venv/bin/python
DOCS_ENV = DOCS_PYTHON=$(abspath $(PYTHON))
${notebooks ? 'NOTEBOOKS = cd docs && $(DOCS_ENV) npx starlight-notebooks\n' : ''}${gallery ? 'GALLERY = cd docs && $(DOCS_ENV) npx starlight-gallery\n' : ''}
docs-install:  ## Python docs extra and the npm packages
	$(PYTHON) -m pip install -e ".[docs]"
	cd docs && npm ci
${
	notebooks
		? `
docs-notebooks:  ## execute the changed tutorials and convert all of them (FORCE=1 reruns all)
	$(NOTEBOOKS) execute $(if $(FORCE),--force,)
	$(NOTEBOOKS) convert
`
		: ''
}${
	gallery
		? `
docs-gallery:  ## run the changed examples and convert all of them (FORCE=1 reruns all)
	$(GALLERY) execute $(if $(FORCE),--force,)
	$(GALLERY) convert
`
		: ''
}
docs-dev:  ## live preview at http://localhost:4321/${project.repo}/
${convert ? `${convert}\n` : ''}	cd docs && $(DOCS_ENV) DOCS_VALIDATE_LINKS=false npx astro dev

docs-build:  ## the static site in docs/dist, as in CI
${convert ? `${convert}\n` : ''}	cd docs && npx starlight-check-mdx && $(DOCS_ENV) npx astro build
`;
}

/** The files of a new setup, by path relative to the project root. */
export function scaffold(project, versions) {
	return {
		'docs/package.json': `${JSON.stringify(packageJson(project, versions), null, 2)}\n`,
		'docs/astro.config.mjs': astroConfig(project),
		'docs/src/content.config.ts': `export { collections } from '${THEME}/content';\n`,
		'docs/tsconfig.json': `${JSON.stringify({ extends: 'astro/tsconfigs/strict', include: ['.astro/types.d.ts', '**/*'], exclude: ['dist'] }, null, 2)}\n`,
		'docs/.gitignore': gitignore(project),
		'docs/src/content/docs/index.mdx': indexPage(project),
		'docs/src/content/docs/getting-started/installation.md': installationPage(project),
		'.github/workflows/docs.yml': workflow(project, versions),
		'renovate.json': renovateConfig(),
	};
}
