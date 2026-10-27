// starlight-theme-init: what it finds in a project and the files it writes.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
	astroConfig,
	detect,
	makefileSnippet,
	migratePackageJson,
	parseRemote,
	scaffold,
	themeVersions,
	workflow,
} from '../bin/scaffold.mjs';
import themePackage from '../package.json' with { type: 'json' };

const versions = themeVersions(themePackage);

function project(files: Record<string, string>, remote?: string) {
	const root = mkdtempSync(join(tmpdir(), 'init-'));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(root, path, '..'), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	if (remote) {
		execFileSync('git', ['init', '-q'], { cwd: root });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: root });
	}
	return root;
}

describe('parseRemote', () => {
	it('reads ssh and https GitHub remotes', () => {
		expect(parseRemote('git@github.com:max-models/simgeometry.git')).toEqual({ owner: 'max-models', repo: 'simgeometry' });
		expect(parseRemote('https://github.com/spokes3d/gallery')).toEqual({ owner: 'spokes3d', repo: 'gallery' });
		expect(parseRemote('https://gitlab.com/a/b.git')).toBeUndefined();
	});
});

describe('detect', () => {
	it('finds the repository, description, package, tutorials and examples', () => {
		const root = project(
			{
				'pyproject.toml': '[project]\nname = "x"\ndescription = "Grids."\n\n[tool.x]\ndescription = "other"\n',
				'src/tests/__init__.py': '',
				'src/grids/__init__.py': '',
				'tutorials/basics/intro.ipynb': '{}',
				'examples/_helpers.py': '',
			},
			'git@github.com:someone/grids.git'
		);
		expect(detect(root)).toEqual({
			owner: 'someone',
			repo: 'grids',
			title: 'grids',
			description: 'Grids.',
			pythonPackage: 'grids',
			tutorials: true,
			gallery: false, // only a private helper
		});
	});

	it('falls back to the directory name and a flat layout', () => {
		const root = project({ 'pyproject.toml': '', 'flatpkg/__init__.py': '' });
		const found = detect(root);
		expect(found.owner).toBe('max-models');
		expect(found.repo).toMatch(/^init-/);
		expect(found.pythonPackage).toBe('flatpkg');
	});
});

const full = {
	owner: 'max-models',
	repo: 'grids',
	title: "Grids' site",
	description: 'Grids.',
	pythonPackage: 'grids',
	tutorials: true,
	gallery: true,
};

describe('scaffold', () => {
	it('writes the site, the workflow and the Renovate config', () => {
		const files = scaffold(full, versions);
		expect(Object.keys(files).sort()).toEqual([
			'.github/workflows/docs.yml',
			'docs/.gitignore',
			'docs/astro.config.mjs',
			'docs/package.json',
			'docs/src/content.config.ts',
			'docs/src/content/docs/getting-started/installation.md',
			'docs/src/content/docs/index.mdx',
			'docs/tsconfig.json',
			'renovate.json',
		]);
		const pkg = JSON.parse(files['docs/package.json']);
		expect(pkg.dependencies['@max-models/starlight-theme']).toBe(`github:max-models/starlight-theme#v${themePackage.version}`);
		expect(pkg.scripts.build).toBe('starlight-notebooks convert && starlight-gallery convert && starlight-check-mdx && astro build');
		expect(files['docs/.gitignore']).toContain('src/content/docs/examples/*.mdx');
		const index = files['docs/src/content/docs/index.mdx'];
		expect(index).toContain('link: /grids/getting-started/installation/');
		expect(index).toContain('heroInstall: "pip install git+https://github.com/max-models/grids"');
		expect(index).toContain('<StartHere />');
		expect(index).toContain('<Card title="Gallery"');
		expect(JSON.parse(files['renovate.json']).extends).toContain('github>max-models/starlight-theme:renovate-preset');
	});

	it('writes an astro.config.mjs with the nav and sidebar of what the project has', () => {
		const config = astroConfig(full);
		expect(config).toContain("title: 'Grids\\' site',");
		expect(config).toContain("{ label: 'API', link: '/api/grids/', section: '/api/', description: 'Generated from the docstrings.' },");
		expect(config).toContain("{ label: 'Gallery', items: [{ autogenerate: { directory: 'examples' } }] },");
		expect(config).not.toContain('owner:');
		const bare = astroConfig({ ...full, owner: 'someone', pythonPackage: undefined, tutorials: false, gallery: false });
		expect(bare).toContain("owner: 'someone',");
		expect(bare).not.toMatch(/Tutorials|Gallery|API|pythonPackage/);
	});

	it('writes a workflow that calls the reusable one of this version', () => {
		const parsed = parse(workflow(full, versions));
		expect(parsed.jobs.docs.uses).toBe(`max-models/starlight-theme/.github/workflows/docs.yml@v${themePackage.version}`);
		expect(parsed.jobs.docs.with).toEqual({
			gallery: true,
			'smoke-paths': 'tutorials/index.html\nexamples/index.html\napi/grids/index.html\n',
		});
		expect(parse(workflow({ ...full, tutorials: false, gallery: false, pythonPackage: undefined }, versions)).jobs.docs.with).toEqual({
			notebooks: false,
		});
	});

	it('gives Makefile targets for what the project has', () => {
		const snippet = makefileSnippet(full);
		expect(snippet).toContain('docs-notebooks:');
		expect(snippet).toContain('docs-gallery:');
		expect(snippet).toContain('$(GALLERY) convert\n\tcd docs && npx starlight-check-mdx');
		expect(makefileSnippet({ ...full, tutorials: false, gallery: false })).not.toMatch(/NOTEBOOKS|GALLERY/);
	});
});

describe('migratePackageJson', () => {
	it('swaps the replaced dependencies for the theme and keeps the rest', () => {
		const migrated = migratePackageJson(
			{
				name: 'old-docs',
				scripts: { dev: 'astro dev', custom: 'x' },
				dependencies: { katex: '1', 'starlight-pydocs': '0.2', astro: '^7.0.0', 'starlight-llms-txt': '1' },
			},
			{ ...full, gallery: false },
			versions
		);
		expect(migrated.name).toBe('old-docs');
		expect(migrated.scripts.dev).toBe('astro dev'); // the project's scripts win
		expect(migrated.scripts.notebooks).toBe('starlight-notebooks');
		expect(migrated.scripts.custom).toBe('x');
		expect(Object.keys(migrated.dependencies)).toEqual(['@astrojs/starlight', '@max-models/starlight-theme', 'astro', 'sharp', 'starlight-llms-txt']);
		expect(migrated.dependencies.astro).toBe('^7.0.0');
	});
});
