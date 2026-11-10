// Where a site's source lives, for the "Source on ..." and "View on ..." links, the edit links, the
// license and CITATION.cff links, the social icon and the API reference's source links. By default
// GitHub (github.com/<owner>/<repo>); the `source` option points them at another forge, such as a
// self-hosted GitLab, or turns them off.

/** The URL layouts the links know. */
export type SourceHost = 'github' | 'gitlab';

/** The `source` option of defineDocs and of the theme plugin. */
export interface SourceOptions {
	/** The repository's web page, e.g. "https://gitlab.mpcdf.mpg.de/maxlin/resources". */
	url: string;
	/** Its URL layout. Default "gitlab" when the host name contains "gitlab", else "github". */
	host?: SourceHost;
	/** The forge's name in "Source on <label>" and "View on <label>". Default "GitHub" or "GitLab". */
	label?: string;
}

/** The resolved source, as the components read it. */
export interface Source {
	url: string;
	host: SourceHost;
	label: string;
}

const LABELS: Record<SourceHost, string> = { github: 'GitHub', gitlab: 'GitLab' };

/** The source of a site whose GitHub repository is `repository` ("owner/name"); null for none. */
export function resolveSource(option: SourceOptions | false | undefined, repository: string): Source | null {
	if (option === false) return null;
	if (option === undefined) return { url: `https://github.com/${repository}`, host: 'github', label: 'GitHub' };
	const url = option.url.replace(/\/+$/, '');
	const host = option.host ?? (/gitlab/i.test(new URL(url).hostname) ? 'gitlab' : 'github');
	return { url, host, label: option.label ?? LABELS[host] };
}

/** GitLab puts its pages under "/-/". */
const pages = (source: Source) => (source.host === 'gitlab' ? `${source.url}/-` : source.url);

/** A file of the repository on `branch`, e.g. "docs/index.mdx"; a line anchor may follow ("#L12"). */
export function blobUrl(source: Source, branch: string, path: string): string {
	return `${pages(source)}/blob/${branch}/${path}`;
}

/** The editor of a file (or, with a trailing slash, the prefix of the files of a folder) on `branch`. */
export function editUrl(source: Source, branch: string, path: string): string {
	return `${pages(source)}/edit/${branch}/${path}`;
}

/** "owner/name" when the source is a github.com repository (Colab, Binder and releases need one), else null. */
export function githubRepository(source: Source | null): string | null {
	const match = source?.host === 'github' ? /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(source.url) : null;
	return match ? match[1] : null;
}

/** The source links of the API reference (starlight-pydocs `sourceLink`), or undefined for none. */
export function pydocsSourceLink(source: Source | null, ref: string, root: string) {
	if (!source) return undefined;
	const repo = githubRepository(source);
	if (repo) return { host: 'github' as const, repo, ref, root };
	const range = source.host === 'gitlab' ? '#L{start}-{end}' : '#L{start}-L{end}';
	return { template: `${pages(source)}/blob/{ref}/{path}${range}`, ref, root };
}
