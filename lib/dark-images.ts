// Dark variants of images: a Markdown image `x.png` that has an `x.dark.png` next to it is shown
// as `x.png` in light mode and as `x.dark.png` in dark mode, with Starlight's `dark:sl-hidden` and
// `light:sl-hidden` classes. Pages write the image once; a figure script writes both files.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface Node {
	type: string;
	url?: string;
	alt?: string | null;
	title?: string | null;
	data?: { hProperties?: Record<string, unknown> };
	children?: Node[];
}

const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;

/** The dark variant's path of an image path (`a/b.png` → `a/b.dark.png`), or null. */
export function darkPath(url: string): string | null {
	const [path, query = ''] = url.split(/(?=[?#])/);
	if (!IMAGE.test(path) || /\.dark\.[a-z]+$/i.test(path)) return null;
	return path.replace(IMAGE, '.dark.$1') + query;
}

/** Whether a URL points to a file next to the page (not to a site path or another server). */
function isLocal(url: string): boolean {
	return !/^([a-z]+:|\/\/|\/|#)/i.test(url);
}

function withClass(node: Node, name: string): Node {
	const properties = node.data?.hProperties ?? {};
	const existing = properties.className;
	const classes = Array.isArray(existing) ? existing : typeof existing === 'string' ? existing.split(' ') : [];
	return { ...node, data: { ...node.data, hProperties: { ...properties, className: [...classes, name] } } };
}

/**
 * The remark plugin. `exists` checks a file (a parameter for the tests); the images are resolved
 * against the page's file.
 */
export function remarkDarkImages({ exists = existsSync }: { exists?: (path: string) => boolean } = {}) {
	return (tree: Node, file: { path?: string; history?: string[] }) => {
		const page = file.path ?? file.history?.at(-1);
		if (!page) return;
		const folder = dirname(page);
		const walk = (node: Node) => {
			if (!node.children) return;
			const children: Node[] = [];
			for (const child of node.children) {
				const dark = child.type === 'image' && child.url && isLocal(child.url) ? darkPath(child.url) : null;
				if (dark && exists(resolve(folder, dark.split(/[?#]/)[0]))) {
					children.push(withClass(child, 'dark:sl-hidden'), withClass({ ...child, url: dark }, 'light:sl-hidden'));
				} else {
					walk(child);
					children.push(child);
				}
			}
			node.children = children;
		};
		walk(tree);
	};
}
