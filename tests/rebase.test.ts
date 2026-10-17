// The links of the dev build, moved from /<repo>/ into /<repo>/dev/.
import { describe, expect, it } from 'vitest';
import { rebase, rebaseFrontmatter, rehypeRebase } from '../lib/rebase.ts';

const from = '/site/';
const to = '/site/dev/';

describe('rebase', () => {
	it('moves links under the stable base only', () => {
		expect(rebase('/site/guides/', from, to)).toBe('/site/dev/guides/');
		expect(rebase('/site', from, to)).toBe('/site/dev/');
		expect(rebase('/site/dev/guides/', from, to)).toBe('/site/dev/guides/');
		expect(rebase('/sitemap/', from, to)).toBe('/sitemap/');
		expect(rebase('https://example.org/site/', from, to)).toBe('https://example.org/site/');
		expect(rebase('#top', from, to)).toBe('#top');
	});
});

describe('rehypeRebase', () => {
	it('moves the links of elements, MDX components, raw HTML and the frontmatter', () => {
		const tree = {
			type: 'root',
			children: [
				{ type: 'element', tagName: 'a', properties: { href: '/site/a/' }, children: [] },
				{ type: 'element', tagName: 'img', properties: { src: '/site/img.png' }, children: [] },
				{
					type: 'mdxJsxFlowElement',
					attributes: [
						{ type: 'mdxJsxAttribute', name: 'href', value: '/site/b/' },
						{ type: 'mdxJsxAttribute', name: 'title', value: '/site/not-a-link/' },
						{ type: 'mdxJsxExpressionAttribute', value: '...props' },
					],
					children: [],
				},
				{ type: 'raw', value: '<a href="/site/c/">c</a> <a href=\'/site/dev/d/\'>d</a> <img src="/site/e.png">' },
			],
		};
		const file = { data: { astro: { frontmatter: { hero: { actions: [{ link: '/site/start/' }, { link: 'https://x.org/' }] }, next: { link: '/site/n/' } } } } };
		rehypeRebase({ from, to })(tree, file);
		const [a, img, jsx, raw] = tree.children as any[];
		expect(a.properties.href).toBe('/site/dev/a/');
		expect(img.properties.src).toBe('/site/dev/img.png');
		expect(jsx.attributes.map((attribute: any) => attribute.value)).toEqual(['/site/dev/b/', '/site/not-a-link/', '...props']);
		expect(raw.value).toBe('<a href="/site/dev/c/">c</a> <a href=\'/site/dev/d/\'>d</a> <img src="/site/dev/e.png">');
		expect(file.data.astro.frontmatter.hero.actions.map((action) => action.link)).toEqual(['/site/dev/start/', 'https://x.org/']);
		expect(file.data.astro.frontmatter.next.link).toBe('/site/dev/n/');
	});

	it('leaves prev/next settings that are not links alone', () => {
		const data: Record<string, any> = { prev: false, next: 'Next page' };
		rebaseFrontmatter(data, from, to);
		expect(data).toEqual({ prev: false, next: 'Next page' });
	});
});
