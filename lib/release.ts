// The latest release of a site's project, for the version badge of the hero: from PyPI when the
// site names its distribution (falling back to GitHub), else from the GitHub releases. Read once per build; a site that
// cannot reach either (offline, rate limited, no release yet) shows no badge.

export interface ReleaseSource {
	/** "owner/name" of the GitHub repository. */
	github: string | null;
	/** The distribution on PyPI. */
	pypi: string | null;
}

export interface Release {
	version: string;
	href: string;
}

const cache = new Map<string, Promise<Release | null>>();

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
	const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	return response.json();
}

async function fromPypi(name: string): Promise<Release> {
	const { info } = await fetchJson(`https://pypi.org/pypi/${name}/json`);
	return { version: info.version, href: `https://pypi.org/project/${name}/${info.version}/` };
}

async function fromGithub(repository: string): Promise<Release> {
	// with GITHUB_TOKEN (set by the docs workflow) from the API, else from the redirect of the
	// releases page, which has no limit of 60 unauthenticated calls an hour
	const token = process.env.GITHUB_TOKEN;
	let tag: string;
	if (token) {
		const release = await fetchJson(`https://api.github.com/repos/${repository}/releases/latest`, {
			accept: 'application/vnd.github+json',
			authorization: `Bearer ${token}`,
		});
		tag = release.tag_name;
	} else {
		const response = await fetch(`https://github.com/${repository}/releases/latest`, {
			redirect: 'manual',
			signal: AbortSignal.timeout(5000),
		});
		const match = response.headers.get('location')?.match(/\/releases\/tag\/([^/?#]+)$/);
		if (!match) throw new Error(`${repository}: no release`);
		tag = decodeURIComponent(match[1]);
	}
	return { version: tag.replace(/^v(?=\d)/, ''), href: `https://github.com/${repository}/releases/tag/${tag}` };
}

/** The latest release, or null. */
export function latestRelease(source: ReleaseSource | null): Promise<Release | null> {
	if (!source || (!source.pypi && !source.github)) return Promise.resolve(null);
	const key = `${source.pypi}|${source.github}`;
	if (!cache.has(key)) {
		const github = () => (source.github ? fromGithub(source.github) : Promise.reject(new Error('no repository')));
		const release = source.pypi ? fromPypi(source.pypi).catch(github) : github();
		cache.set(
			key,
			release.catch(() => null)
		);
	}
	return cache.get(key)!;
}
