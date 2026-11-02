// The KaTeX CSS (styles/math.css) must come from the KaTeX that renders the math: rehype-katex
// brings its own, and with two versions installed the subscripts and superscripts are misplaced.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const minor = (version: string) => version.replace(/^[^\d]*/, '').split('.').slice(0, 2).join('.');

describe('KaTeX', () => {
	it('is the version rehype-katex renders with', () => {
		const theme = read(new URL('../package.json', import.meta.url).pathname);
		const rehype = read(new URL('../node_modules/rehype-katex/package.json', import.meta.url).pathname);
		expect(minor(theme.dependencies.katex)).toBe(minor(rehype.dependencies.katex));
	});

	it('is installed once', () => {
		const top = read(require.resolve('katex/package.json')).version;
		const fromRehype = read(createRequire(require.resolve('rehype-katex')).resolve('katex/package.json')).version;
		expect(fromRehype).toBe(top);
	});
});
