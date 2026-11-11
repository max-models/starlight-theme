// The source of a site: GitHub by default, another forge, or none.
import { describe, expect, it } from 'vitest';
import { blobUrl, editUrl, githubRepository, pydocsSourceLink, resolveSource } from '../lib/source.ts';

describe('resolveSource', () => {
	it('defaults to the GitHub repository', () => {
		const source = resolveSource(undefined, 'max-models/simgeometry');
		expect(source).toEqual({ url: 'https://github.com/max-models/simgeometry', host: 'github', label: 'GitHub' });
		expect(githubRepository(source)).toBe('max-models/simgeometry');
		expect(blobUrl(source!, 'devel', 'LICENSE')).toBe('https://github.com/max-models/simgeometry/blob/devel/LICENSE');
		expect(editUrl(source!, 'devel', 'docs/')).toBe('https://github.com/max-models/simgeometry/edit/devel/docs/');
	});

	it('takes another forge from its URL, guessing GitLab from the host name', () => {
		const source = resolveSource({ url: 'https://gitlab.mpcdf.mpg.de/maxlin/resources/' }, 'max-models/resources');
		expect(source).toEqual({ url: 'https://gitlab.mpcdf.mpg.de/maxlin/resources', host: 'gitlab', label: 'GitLab' });
		expect(githubRepository(source)).toBeNull();
		expect(blobUrl(source!, 'main', 'CITATION.cff')).toBe('https://gitlab.mpcdf.mpg.de/maxlin/resources/-/blob/main/CITATION.cff');
		expect(editUrl(source!, 'main', 'docs/')).toBe('https://gitlab.mpcdf.mpg.de/maxlin/resources/-/edit/main/docs/');
	});

	it('keeps an explicit host and label, and false means no source', () => {
		const source = resolveSource({ url: 'https://code.example.org/a/b', host: 'gitlab', label: 'Example' }, 'a/b');
		expect(source).toEqual({ url: 'https://code.example.org/a/b', host: 'gitlab', label: 'Example' });
		expect(resolveSource(false, 'a/b')).toBeNull();
		expect(githubRepository(null)).toBeNull();
	});
});

describe('pydocsSourceLink', () => {
	it('uses the GitHub preset on github.com and a template elsewhere', () => {
		const github = resolveSource(undefined, 'a/b');
		expect(pydocsSourceLink(github, 'devel', '..')).toEqual({ host: 'github', repo: 'a/b', ref: 'devel', root: '..' });
		const gitlab = resolveSource({ url: 'https://gitlab.example.org/g/b' }, 'a/b');
		expect(pydocsSourceLink(gitlab, 'main', '..')).toEqual({
			template: 'https://gitlab.example.org/g/b/-/blob/{ref}/{path}#L{start}-{end}',
			ref: 'main',
			root: '..',
		});
		const enterprise = resolveSource({ url: 'https://github.example.org/a/b', host: 'github' }, 'a/b');
		expect(pydocsSourceLink(enterprise, 'main', '..')?.template).toBe('https://github.example.org/a/b/blob/{ref}/{path}#L{start}-L{end}');
		expect(pydocsSourceLink(null, 'main', '..')).toBeUndefined();
	});
});
