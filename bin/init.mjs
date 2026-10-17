#!/usr/bin/env node
// `starlight-theme-init [options]`: set up the docs of a project with this theme, in the project root
// (or its docs/). Writes docs/ (package.json, astro.config.mjs, the first pages, ...), the docs
// workflow and a Renovate config, from what it finds in the project; files that exist are left
// alone. Without installing anything first:
//
//     npx --package github:max-models/starlight-theme#v0.3.0 starlight-theme-init
//
// --migrate moves a project from the old copied setup: removes the files the theme replaces and
// updates the existing docs/package.json. Then `cd docs && npm install`.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
	REPLACED_FILES,
	detect,
	makefileSnippet,
	migratePackageJson,
	scaffold,
	themeVersions,
} from './scaffold.mjs';

const usage = `Usage: starlight-theme-init [options]   (in the project root)

  --repo <name>          repository name (default: from the git remote)
  --owner <name>         GitHub user or organisation (default: from the git remote)
  --title <text>         site title (default: the repository name)
  --description <text>   site description (default: from pyproject.toml)
  --package <name>       Python package of the API reference (default: found in src/)
  --migrate              remove the files the theme replaces, update docs/package.json
  --force                overwrite files that exist
  --dry-run              only print what would be done
  -h, --help             this help`;

const { values: options } = parseArgs({
	options: {
		repo: { type: 'string' },
		owner: { type: 'string' },
		title: { type: 'string' },
		description: { type: 'string' },
		package: { type: 'string' },
		migrate: { type: 'boolean', default: false },
		force: { type: 'boolean', default: false },
		'dry-run': { type: 'boolean', default: false },
		help: { type: 'boolean', short: 'h', default: false },
	},
});
if (options.help) {
	console.log(usage);
	process.exit(0);
}

let root = process.cwd();
if (basename(root) === 'docs' && existsSync(join(root, '..', 'pyproject.toml'))) root = resolve(root, '..');
if (!existsSync(join(root, 'pyproject.toml'))) {
	console.error(`[init] no pyproject.toml in ${root}; run it in the root of the project`);
	process.exit(1);
}

const detected = detect(root);
const project = {
	...detected,
	repo: options.repo ?? detected.repo,
	owner: options.owner ?? detected.owner,
	title: options.title ?? options.repo ?? detected.title,
	description: options.description ?? detected.description,
	pythonPackage: options.package ?? detected.pythonPackage,
};
const themePackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const versions = themeVersions(themePackage);
const dryRun = options['dry-run'];
const log = (message) => console.log(`[init${dryRun ? ' dry run' : ''}] ${message}`);

log(`${project.owner}/${project.repo}: package ${project.pythonPackage ?? '(none)'}, ` +
	`tutorials ${project.tutorials ? 'yes' : 'no'}, gallery ${project.gallery ? 'yes' : 'no'}`);

function write(path, content) {
	const target = join(root, path);
	if (!dryRun) {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
}

const packagePath = 'docs/package.json';
for (const [path, content] of Object.entries(scaffold(project, versions))) {
	const exists = existsSync(join(root, path));
	if (path === packagePath && exists && options.migrate && !options.force) {
		const existing = JSON.parse(readFileSync(join(root, path), 'utf8'));
		write(path, `${JSON.stringify(migratePackageJson(existing, project, versions), null, 2)}\n`);
		log(`updated ${path}`);
	} else if (path === 'renovate.json' && ['.github/renovate.json', 'renovate.json5', '.renovaterc.json'].some((other) => existsSync(join(root, other)))) {
		log(`kept the existing Renovate config; extend github>max-models/starlight-theme:renovate-preset there`);
	} else if (exists && !options.force) {
		log(`kept ${path} (exists; --force overwrites it)`);
	} else {
		write(path, content);
		log(`${exists ? 'overwrote' : 'wrote'} ${path}`);
	}
}

if (options.migrate) {
	for (const path of REPLACED_FILES) {
		if (!existsSync(join(root, path))) continue;
		if (!dryRun) rmSync(join(root, path));
		log(`removed ${path} (now in the theme)`);
	}
}

console.log(`
Next:
  cd docs && npm install
  add to the docs extra of pyproject.toml: griffe${project.tutorials ? ', ipykernel, nbclient, nbformat' : ''}${project.gallery ? ', and what the examples import' : ''}
  enable GitHub Pages with "GitHub Actions" as the source

Makefile targets:

${makefileSnippet(project)}`);
if (dryRun) log('nothing was written');
