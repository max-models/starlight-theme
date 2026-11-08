// Dark variants of Markdown images.
import { describe, expect, it } from 'vitest';
import { darkPath, remarkDarkImages } from '../lib/dark-images.ts';

describe('darkPath', () => {
	it('puts .dark before the extension', () => {
		expect(darkPath('../assets/figures/energy.png')).toBe('../assets/figures/energy.dark.png');
		expect(darkPath('a.SVG?raw')).toBe('a.dark.SVG?raw');
		expect(darkPath('a.dark.png')).toBeNull();
		expect(darkPath('notes.txt')).toBeNull();
	});
});

describe('remarkDarkImages', () => {
	const files = new Set(['/site/src/assets/energy.png', '/site/src/assets/energy.dark.png', '/site/src/assets/plain.png']);
	const run = (tree: any) => {
		remarkDarkImages({ exists: (path) => files.has(path) })(tree, { path: '/site/src/content/docs/guide.mdx' });
		return tree;
	};
	const image = (url: string) => ({ type: 'image', url, alt: 'Energy' });

	it('shows the dark variant in dark mode and the image in light mode', () => {
		const tree = run({ type: 'root', children: [{ type: 'paragraph', children: [image('../../assets/energy.png')] }] });
		expect(tree.children[0].children).toEqual([
			{ type: 'image', url: '../../assets/energy.png', alt: 'Energy', data: { hProperties: { className: ['dark:sl-hidden'] } } },
			{ type: 'image', url: '../../assets/energy.dark.png', alt: 'Energy', data: { hProperties: { className: ['light:sl-hidden'] } } },
		]);
	});

	it('leaves images without a dark variant, site paths and remote images alone', () => {
		const children = [image('../../assets/plain.png'), image('/figures/energy.png'), image('https://example.org/energy.png')];
		const tree = run({ type: 'root', children: [{ type: 'paragraph', children: [...children] }] });
		expect(tree.children[0].children).toEqual(children);
	});

	it('does nothing without the page file', () => {
		const tree = { type: 'root', children: [image('../../assets/energy.png')] };
		remarkDarkImages({ exists: () => true })(tree, {});
		expect(tree.children).toHaveLength(1);
	});
});
