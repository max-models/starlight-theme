// The max-models projects with a docs site of this theme: the "Projects" menu of the header, and
// the API inventories a site links its annotations to (the sibling packages it depends on).
import { existsSync, readFileSync } from 'node:fs';

export interface Project {
	/** Repository name: github.com/<owner>/<repo>, docs at <owner>.github.io/<repo>/. */
	repo: string;
	/** Name in the menu. */
	title: string;
	/** One line in the menu. */
	description?: string;
	/** The documented Python package (import name), if the site has an API reference. */
	pythonPackage?: string;
	/** Distribution name in pyproject.toml dependencies. Default: `pythonPackage`. */
	distribution?: string;
	/** GitHub user or organisation. Default "max-models". */
	owner?: string;
}

export const projects: Project[] = [
	{ repo: 'maybempi', title: 'maybempi', description: 'MPI when launched under MPI, a serial stand-in otherwise', pythonPackage: 'maybempi' },
	{ repo: 'mpiarray', title: 'mpiarray', description: 'Distributed NumPy/CuPy arrays with halo exchange', pythonPackage: 'mpiarray' },
	{ repo: 'simgeometry', title: 'simgeometry', description: 'Shapes, structured grids and domains', pythonPackage: 'simgeometry' },
	{ repo: 'patchwork', title: 'Patchwork', description: 'Block-structured adaptive meshes', pythonPackage: 'patchwork' },
	{ repo: 'plasmacoll', title: 'plasmacoll', description: 'Monte Carlo collisions with neutral gases', pythonPackage: 'plasmacoll' },
	{ repo: 'plasma-plots', title: 'plasma-plots', description: 'Plots of labeled xarray plasma output', pythonPackage: 'plasma_plots', distribution: 'plasma-plots' },
];

export function docsUrl(project: Project): string {
	return `https://${project.owner ?? 'max-models'}.github.io/${project.repo}/`;
}

/** The Sphinx inventory starlight-pydocs serves for the project's package. */
export function inventoryUrl(project: Project): string | undefined {
	return project.pythonPackage ? `${docsUrl(project)}api/${project.pythonPackage}/objects.inv` : undefined;
}

// PEP 503: names compare case-insensitively, with runs of -_. equal
const normalise = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');

/** The strings of the TOML array that starts at `start` (just after its "["), and where it ends. */
function readArray(text: string, start: number): { strings: string[]; end: number } {
	const strings: string[] = [];
	let depth = 1;
	let i = start;
	while (i < text.length && depth > 0) {
		const char = text[i];
		if (char === '"' || char === "'") {
			const close = text.indexOf(char, i + 1);
			if (close < 0) break;
			strings.push(text.slice(i + 1, close));
			i = close + 1;
			continue;
		}
		if (char === '#') i = text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i);
		else if (char === '[') depth += 1;
		else if (char === ']') depth -= 1;
		i += 1;
	}
	return { strings, end: i };
}

/**
 * The distribution names in the dependency lists of a pyproject.toml: `[project] dependencies`,
 * `[project.optional-dependencies]` and `[dependency-groups]`.
 */
export function dependenciesOf(pyproject: string): Set<string> {
	const names = new Set<string>();
	let section = '';
	const line = /^[ \t]*(?:\[([^\]\n]+)\][ \t]*(?:#.*)?$|([\w.-]+)[ \t]*=[ \t]*\[)/gm;
	for (let match = line.exec(pyproject); match; match = line.exec(pyproject)) {
		if (match[1] !== undefined) {
			section = match[1].trim();
			continue;
		}
		const wanted =
			section === 'project.optional-dependencies' ||
			section === 'dependency-groups' ||
			(section === 'project' && (match[2] === 'dependencies' || match[2].startsWith('optional-dependencies.')));
		const { strings, end } = readArray(pyproject, line.lastIndex);
		line.lastIndex = end;
		if (!wanted) continue;
		for (const requirement of strings) {
			// the name comes first, then a version, extra, marker or URL
			const name = requirement.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/)?.[1];
			if (name) names.add(normalise(name));
		}
	}
	return names;
}

/** The projects among `candidates` that the pyproject.toml at `path` depends on, except `repo` itself. */
export function dependencyProjects(path: string, repo: string, candidates: Project[] = projects): Project[] {
	if (!existsSync(path)) return [];
	const dependencies = dependenciesOf(readFileSync(path, 'utf8'));
	return candidates.filter(
		(project) =>
			project.repo !== repo &&
			project.pythonPackage !== undefined &&
			dependencies.has(normalise(project.distribution ?? project.pythonPackage))
	);
}
