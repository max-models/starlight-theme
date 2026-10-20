// The entries of the "Projects" menu, from the theme's list at build time or from projects.json in
// the browser. No Node imports: the header script bundles this module.

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

export interface MenuEntry {
	title: string;
	description: string;
	href: string;
	current: boolean;
}

/** Where every site reads the menu at page load, so a new project needs no theme release. */
export const PROJECTS_URL = 'https://max-models.github.io/projects.json';

export function docsUrl(project: Project): string {
	return `https://${project.owner ?? 'max-models'}.github.io/${project.repo}/`;
}

const isProject = (value: unknown): value is Project =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as Project).repo === 'string' &&
	typeof (value as Project).title === 'string';

/** The menu of the site github.com/<owner>/<repo>; entries without a repo and title are skipped. */
export function menuEntries(projects: unknown, owner: string, repo: string): MenuEntry[] {
	if (!Array.isArray(projects)) return [];
	return projects.filter(isProject).map((project) => ({
		title: project.title,
		description: typeof project.description === 'string' ? project.description : '',
		href: docsUrl(project),
		current: project.repo === repo && (project.owner ?? 'max-models') === owner,
	}));
}
