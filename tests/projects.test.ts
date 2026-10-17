// The dependency lists of a pyproject.toml, for the cross-references to sibling projects.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dependenciesOf, dependencyProjects, inventoryUrl, projects } from '../lib/projects.ts';

const pyproject = `[build-system]
requires = ["hatchling"]  # not a dependency

[project]
name = "tree-d-3d"
description = "mpiarray is mentioned here, not depended on"
dependencies = [
  "cunumpy@git+https://github.com/max-models/cunumpy@devel",
  "numpy",
  "Pyccel>2.0",
  # "commented-out",
  "simgeometry @ git+https://github.com/max-models/simgeometry@devel",
]
optional-dependencies.docs = ["griffe", "plasma_plots[full]>=0.2; python_version>'3.10'"]

[project.optional-dependencies]
mpi = [ "maybempi[mpi]>=0.1", "mpi4py" ]

[dependency-groups]
dev = ["pytest", { include-group = "docs" }]

[tool.something]
packages = ["patchwork"]
`;

describe('dependenciesOf', () => {
	it('reads the dependency lists only, with normalised names', () => {
		expect([...dependenciesOf(pyproject)].sort()).toEqual([
			'cunumpy',
			'docs', // the include-group of the table; harmless
			'griffe',
			'maybempi',
			'mpi4py',
			'numpy',
			'plasma-plots',
			'pyccel',
			'pytest',
			'simgeometry',
		]);
	});
});

describe('dependencyProjects', () => {
	it('finds the projects of the dependencies, except the site itself', () => {
		const directory = mkdtempSync(join(tmpdir(), 'projects-'));
		const path = join(directory, 'pyproject.toml');
		writeFileSync(path, pyproject);
		expect(dependencyProjects(path, 'tree-d-3d').map((project) => project.repo)).toEqual([
			'maybempi',
			'simgeometry',
			'plasma-plots',
		]);
		expect(dependencyProjects(path, 'simgeometry').map((project) => project.repo)).not.toContain('simgeometry');
	});
});

describe('inventoryUrl', () => {
	it('is the objects.inv of the API reference', () => {
		const plasmaPlots = projects.find((project) => project.repo === 'plasma-plots')!;
		expect(inventoryUrl(plasmaPlots)).toBe('https://max-models.github.io/plasma-plots/api/plasma_plots/objects.inv');
		expect(inventoryUrl({ repo: 'x', title: 'x' })).toBeUndefined();
	});
});
