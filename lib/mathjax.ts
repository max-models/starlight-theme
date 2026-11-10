// LaTeX in Plotly figures. plotly.js typesets a label that is one `$...$` formula when MathJax 3
// or 4 is on the page (in titles, axis titles, legends, annotations and colour bars, not in hover
// labels). PlotlyFigure loads MathJax 3 only for a figure that has such a label, the way it loads
// plotly.js only for a figure in view; the site's KaTeX macros (`math.macros` of defineDocs) apply
// to the figures as to the text.

export type KatexMacros = Record<string, string>;
export type MathJaxMacros = Record<string, string | [string, number]>;

/** A label with a `$...$` formula; `\$` is a dollar sign. */
const FORMULA = /(?<!\\)\$(?:[^$\\]|\\.)+(?<!\\)\$/;

/** Whether any text of the figure (or of a part of it) has a `$...$` formula. */
export function hasMath(value: unknown): boolean {
	if (typeof value === 'string') return FORMULA.test(value);
	if (Array.isArray(value)) return value.some(hasMath);
	if (value && typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) {
			// numbers and templates of the data: no labels there
			if (key === 'x' || key === 'y' || key === 'z' || key === 'customdata' || key === 'hovertemplate') continue;
			if (hasMath(item)) return true;
		}
	}
	return false;
}

/**
 * KaTeX macros as MathJax's: `{ '\\vec': '\\boldsymbol{#1}' }` becomes `{ vec: ['\\boldsymbol{#1}', 1] }`,
 * the number of arguments being the highest `#n` of the definition.
 */
export function mathjaxMacros(macros: KatexMacros = {}): MathJaxMacros {
	const out: MathJaxMacros = {};
	for (const [name, definition] of Object.entries(macros)) {
		const key = name.replace(/^\\/, '');
		const args = Math.max(0, ...[...definition.matchAll(/#(\d)/g)].map((match) => Number(match[1])));
		out[key] = args ? [definition, args] : definition;
	}
	return out;
}

/**
 * The `window.MathJax` configuration: TeX to SVG, no typesetting of the page (KaTeX does that), no
 * menu. The words of a formula (`\\text{...}`) are drawn in `textFont`, the page's font, as the
 * labels without a formula are; only the math is in TeX's.
 */
export function mathjaxConfig(macros: KatexMacros = {}, textFont = '') {
	return {
		tex: { macros: mathjaxMacros(macros) },
		svg: { fontCache: 'local', ...(textFont ? { mtextFont: textFont } : {}) },
		startup: { typeset: false },
		options: { enableMenu: false },
	};
}

/** The TeX of a label that is one formula (`$\sigma_s\text{ [m}^2\text{]}$`), else null. */
export function formulaOf(text: string): string | null {
	const match = /^\s*\$((?:[^$\\]|\\.)+)\$\s*$/.exec(text);
	return match ? match[1] : null;
}

/** Plotly's text markup that a caption keeps: sub- and superscripts, bold and italics. */
const KEPT = /<(\/?)(sub|sup|b|i)>/gi;

/**
 * The parts of a label as HTML text: Plotly's `<sub>`, `<sup>`, `<b>` and `<i>` kept, `<br>` as a
 * space, any other markup dropped, everything else as text. For a caption, without innerHTML.
 */
export function captionParts(text: string): { tag: string | null; text: string }[] {
	const plain = text.replace(/<br\s*\/?>/gi, ' ').replace(/<(?!\/?(?:sub|sup|b|i)>)[^>]+>/gi, '');
	const parts: { tag: string | null; text: string }[] = [];
	let open: string | null = null;
	let position = 0;
	for (const match of plain.matchAll(KEPT)) {
		const before = plain.slice(position, match.index);
		if (before) parts.push({ tag: open, text: before });
		open = match[1] ? null : match[2].toLowerCase();
		position = match.index! + match[0].length;
	}
	const rest = plain.slice(position);
	if (rest) parts.push({ tag: open, text: rest });
	const entities: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };
	return parts.map((part) => ({ ...part, text: part.text.replace(/&(?:lt|gt|amp|quot|#39);/g, (e) => entities[e]) }));
}
