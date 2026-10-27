// What the footer and the "Cite" page show about a project: how to cite it (from its CITATION.cff)
// and its license (from CITATION.cff, pyproject.toml or the LICENSE file). Read by defineDocs.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface Citation {
	/** One line: authors, year, title, version, URL. */
	text: string;
	bibtex: string;
}

export interface License {
	/** e.g. "MIT". */
	name: string;
	/** The license file on GitHub, if the repository has one. */
	href?: string;
}

interface CffPerson {
	'family-names'?: string;
	'given-names'?: string;
	name?: string;
}

interface CffWork {
	type?: string;
	title?: string;
	authors?: CffPerson[];
	version?: string;
	'date-released'?: string;
	year?: number | string;
	doi?: string;
	url?: string;
	'repository-code'?: string;
	journal?: string;
	volume?: number | string;
	issue?: number | string;
	pages?: string;
	start?: number | string;
	end?: number | string;
	license?: string;
	'preferred-citation'?: CffWork;
}

const personName = (person: CffPerson) =>
	person.name ?? [person['given-names'], person['family-names']].filter(Boolean).join(' ');
const bibtexName = (person: CffPerson) =>
	person.name ? `{${person.name}}` : [person['family-names'], person['given-names']].filter(Boolean).join(', ');

/** The citation of a CITATION.cff file: its preferred-citation if it has one, else the software. */
export function citationOf(cff: string): Citation {
	const data = parse(cff) as CffWork;
	const work = data['preferred-citation'] ?? data;
	const authors = work.authors ?? [];
	const year = String(work.year ?? work['date-released'] ?? '').slice(0, 4);
	const url = work.doi ? `https://doi.org/${work.doi}` : (work.url ?? work['repository-code']);
	const article = work.type === 'article' && work.journal;
	// lindqvist2026mpiarray: the first author, the year and the first word of the title
	const word = (text = '') => text.toLowerCase().split(/[^a-z0-9]+/).find(Boolean) ?? '';
	const key = `${word(authors[0]?.['family-names'] ?? authors[0]?.name) || 'anonymous'}${year}${word(work.title)}`;
	const pages = work.pages ?? (work.start ? `${work.start}${work.end ? `--${work.end}` : ''}` : undefined);
	const fields: [string, string | number | undefined][] = [
		['author', authors.map(bibtexName).join(' and ')],
		['title', work.title && `{${work.title}}`],
		['journal', article ? work.journal : undefined],
		['volume', work.volume],
		['number', work.issue],
		['pages', pages],
		['year', year],
		['version', article ? undefined : work.version],
		['doi', work.doi],
		['url', work.doi ? undefined : url],
	];
	const bibtex = `@${article ? 'article' : 'software'}{${key},\n${fields
		.filter(([, value]) => value !== undefined && value !== '')
		.map(([name, value]) => `  ${name} = {${value}}`)
		.join(',\n')}\n}`;
	const text = [
		authors.map(personName).join(', '),
		year && `(${year})`,
		work.title && `${work.title}${article ? '' : work.version ? `, version ${work.version}` : ''}.`,
		article && `${work.journal}${work.volume ? ` ${work.volume}` : ''}${pages ? `, ${pages}` : ''}.`,
		url,
	]
		.filter(Boolean)
		.join(' ');
	return { text, bibtex };
}

/** The citation of the project at `root`, if it has a CITATION.cff. */
export function readCitation(root: string): Citation | undefined {
	const path = join(root, 'CITATION.cff');
	return existsSync(path) ? citationOf(readFileSync(path, 'utf8')) : undefined;
}

const LICENSE_FILES = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING'];

/**
 * The license of the project at `root`: the name from CITATION.cff, pyproject.toml (`license =
 * "MIT"`) or the first line of the license file, and a link to that file in `github` (a
 * https://github.com/<owner>/<repo> URL) on `branch`.
 */
export function readLicense(root: string, github: string, branch: string): License | undefined {
	const file = LICENSE_FILES.find((name) => existsSync(join(root, name)));
	const cffPath = join(root, 'CITATION.cff');
	const pyprojectPath = join(root, 'pyproject.toml');
	const name =
		(existsSync(cffPath) ? (parse(readFileSync(cffPath, 'utf8')) as CffWork)?.license : undefined) ??
		(existsSync(pyprojectPath) ? readFileSync(pyprojectPath, 'utf8').match(/^license\s*=\s*"([^"]+)"/m)?.[1] : undefined) ??
		(file ? readFileSync(join(root, file), 'utf8').trim().split('\n')[0].replace(/\s+license$/i, '').trim() : undefined);
	if (!name) return undefined;
	return { name, ...(file ? { href: `${github}/blob/${branch}/${file}` } : {}) };
}
