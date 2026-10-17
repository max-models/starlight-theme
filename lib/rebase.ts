// The dev build of a site is served at /<repo>/dev/, but its pages link to /<repo>/... like the
// stable build. These move such links into the dev site: in the content (a rehype plugin, so the
// link check sees the moved links too) and in the frontmatter (route-middleware.ts).

/** `href` moved from the base path `from` to `to` (both with a trailing slash), if it is under `from`. */
export function rebase(href: string, from: string, to: string): string {
	if (href === from.slice(0, -1)) return to;
	if (!href.startsWith(from) || href.startsWith(to)) return href;
	return to + href.slice(from.length);
}

interface Node {
	type: string;
	tagName?: string;
	properties?: Record<string, unknown>;
	attributes?: { type: string; name?: string; value?: unknown }[];
	value?: string;
	children?: Node[];
}

const URL_PROPERTIES = ['href', 'src'];
const URL_ATTRIBUTES = ['href', 'src', 'link'];

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The rehype plugin: links of elements, MDX components and raw HTML, and the frontmatter links. */
export function rehypeRebase({ from, to }: { from: string; to: string }) {
	const move = (href: unknown) => (typeof href === 'string' ? rebase(href, from, to) : href);
	const inRaw = new RegExp(`((?:href|src)=["'])${escapeRegExp(from)}(?!${escapeRegExp(to.slice(from.length))})`, 'g');
	const visit = (node: Node) => {
		if (node.type === 'element' && node.properties) {
			for (const name of URL_PROPERTIES) {
				if (name in node.properties) node.properties[name] = move(node.properties[name]);
			}
		} else if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.attributes) {
			for (const attribute of node.attributes) {
				if (attribute.type === 'mdxJsxAttribute' && URL_ATTRIBUTES.includes(attribute.name ?? '')) {
					attribute.value = move(attribute.value);
				}
			}
		} else if (node.type === 'raw' && node.value) {
			node.value = node.value.replace(inRaw, `$1${to}`);
		}
		node.children?.forEach(visit);
	};
	return (tree: Node, file: { data: { astro?: { frontmatter?: Record<string, any> } } }) => {
		visit(tree);
		// what the link check reads; the rendered page gets the same from the route middleware
		const frontmatter = file.data.astro?.frontmatter;
		if (frontmatter) rebaseFrontmatter(frontmatter, from, to);
	};
}

/** Hero actions and prev/next links of a page's frontmatter (or entry data), in place. */
export function rebaseFrontmatter(data: Record<string, any>, from: string, to: string): void {
	for (const action of data.hero?.actions ?? []) {
		if (typeof action?.link === 'string') action.link = rebase(action.link, from, to);
	}
	for (const key of ['prev', 'next']) {
		const value = data[key];
		if (typeof value === 'object' && value !== null && typeof value.link === 'string') {
			value.link = rebase(value.link, from, to);
		}
	}
}
