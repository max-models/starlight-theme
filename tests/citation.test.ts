// The citation and the license a site shows, from CITATION.cff, pyproject.toml and LICENSE.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { citationOf, readCitation, readLicense } from '../lib/citation.ts';
import { shareImageSvg } from '../lib/share-image.ts';

const software = `cff-version: 1.2.0
type: software
title: mpiarray
authors:
  - family-names: Lindqvist
    given-names: Max
version: 0.1.0
date-released: "2026-10-05"
url: https://max-models.github.io/mpiarray/
license: MIT
`;

describe('citationOf', () => {
	it('cites the software', () => {
		const { text, bibtex } = citationOf(software);
		expect(text).toBe('Max Lindqvist (2026) mpiarray, version 0.1.0. https://max-models.github.io/mpiarray/');
		expect(bibtex).toBe(`@software{lindqvist2026mpiarray,
  author = {Lindqvist, Max},
  title = {{mpiarray}},
  year = {2026},
  version = {0.1.0},
  url = {https://max-models.github.io/mpiarray/}
}`);
	});

	it('prefers the preferred-citation, an article', () => {
		const { text, bibtex } = citationOf(`${software}preferred-citation:
  type: article
  title: Distributed arrays
  authors:
    - family-names: Lindqvist
      given-names: Max
    - name: The PICNIC team
  journal: J. Comput. Phys.
  volume: 500
  start: 1
  end: 20
  year: 2027
  doi: 10.1000/xyz
`);
		expect(bibtex).toMatch(/^@article\{lindqvist2027distributed,/);
		expect(bibtex).toContain('author = {Lindqvist, Max and {The PICNIC team}}');
		expect(bibtex).toContain('pages = {1--20}');
		expect(bibtex).toContain('doi = {10.1000/xyz}');
		expect(bibtex).not.toContain('url =');
		expect(text).toBe('Max Lindqvist, The PICNIC team (2027) Distributed arrays. J. Comput. Phys. 500, 1--20. https://doi.org/10.1000/xyz');
	});
});

describe('readLicense', () => {
	it('takes the name from CITATION.cff, pyproject.toml or the license file', () => {
		const github = 'https://github.com/max-models/x';
		const root = mkdtempSync(join(tmpdir(), 'license-'));
		expect(readLicense(root, github, 'devel')).toBeUndefined();
		expect(readCitation(root)).toBeUndefined();
		writeFileSync(join(root, 'LICENSE.txt'), 'MIT License\n\nCopyright (c) 2026\n');
		expect(readLicense(root, github, 'devel')).toEqual({ name: 'MIT', href: `${github}/blob/devel/LICENSE.txt` });
		writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "x"\nlicense = "BSD-3-Clause"\n');
		expect(readLicense(root, github, 'main')?.name).toBe('BSD-3-Clause');
		writeFileSync(join(root, 'CITATION.cff'), software);
		expect(readLicense(root, github, 'main')?.name).toBe('MIT');
		expect(readCitation(root)?.text).toContain('mpiarray');
	});
});

describe('shareImageSvg', () => {
	it('draws the title and the description, escaped and cut to three lines', () => {
		const svg = shareImageSvg('a<b', 'word '.repeat(60), 'max-models.github.io/x');
		expect(svg).toContain('>a&lt;b</text>');
		expect(svg.match(/font-size="34"/g)).toHaveLength(3);
		expect(svg).toContain('…</text>');
		expect(svg).toContain('max-models.github.io/x');
	});
});
