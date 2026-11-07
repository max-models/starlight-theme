// The site's colours for a Plotly figure: the data palette for its traces and the hints of a web
// figure (layout.meta.web, written by maxplotlib.web; see the README, "Plotly figures").
// Pure functions, used by components/PlotlyFigure.astro and tested in tests/plotly-theme.test.ts.

export type Trace = Record<string, any>;
export type Figure = { data?: Trace[]; layout?: Record<string, any>; frames?: Record<string, any>[] };

/** The hints a web figure carries in `layout.meta.web`. */
export interface WebHints {
	version?: number;
	title?: string;
	alt?: string;
	/** Width over height. */
	aspect?: number;
	/** Keep a white plot area in dark mode, for colours chosen for a white background. */
	white_plot?: boolean;
}

/** The number of data colours the theme defines as `--mm-data-1` ... `--mm-data-8`. */
export const PALETTE_SIZE = 8;

/** The hints of a figure, or an empty object for a plain Plotly figure. */
export function webHints(figure: Figure): WebHints {
	const web = figure.layout?.meta?.web;
	return web && typeof web === 'object' && !Array.isArray(web) ? (web as WebHints) : {};
}

const RGBA = /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)$/i;

/** `#rrggbb` (or `#rgb`) with the alpha of `like` when that is an `rgba(...)` colour. */
export function withAlphaOf(color: string, like: unknown): string {
	const match = typeof like === 'string' ? RGBA.exec(like.trim()) : null;
	if (!match) return color;
	let hex = color.trim().replace('#', '');
	if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
	if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
	return `rgba(${r}, ${g}, ${b}, ${match[1]})`;
}

const BLACK = /^(black|#000|#000000|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(,\s*[\d.]+\s*)?\))$/i;

/** Whether a colour is black, which a figure uses for reference curves drawn in "ink". */
export function isBlack(color: unknown): boolean {
	return typeof color === 'string' && BLACK.test(color.trim());
}

/** The palette slot of a trace (`trace.meta.color_slot`), or null. */
export function colorSlot(trace: Trace): number | null {
	const slot = trace?.meta?.color_slot;
	return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

/**
 * The trace in the site's colours wherever it had a single colour (the line, the markers and the
 * fill, keeping a fill's transparency): the palette colour of its slot, and `ink` (the text
 * colour) for black. Other colours are unchanged.
 */
export function recolorTrace(trace: Trace, palette: string[], ink?: string): Trace {
	const slot = colorSlot(trace);
	const color = slot !== null && palette.length ? palette[slot % palette.length] : undefined;
	const swap = (value: unknown) => {
		if (typeof value !== 'string') return value;
		const target = color ?? (ink && isBlack(value) ? ink : undefined);
		return target ? withAlphaOf(target, value) : value;
	};
	const out: Trace = { ...trace };
	let changed = false;
	for (const key of ['line', 'marker'] as const) {
		const value = trace[key]?.color;
		if (typeof value === 'string' && swap(value) !== value) {
			out[key] = { ...trace[key], color: swap(value) };
			changed = true;
		}
	}
	if (typeof trace.fillcolor === 'string' && swap(trace.fillcolor) !== trace.fillcolor) {
		out.fillcolor = swap(trace.fillcolor);
		changed = true;
	}
	return changed ? out : trace;
}

/**
 * The figure's data and frames in the site's colours (see `recolorTrace`); the layout gets the
 * palette as its colorway, for the traces without a colour.
 */
export function paletteFigure(figure: Figure, palette: string[], ink?: string): Figure {
	const recolor = (data?: Trace[]) => data?.map((trace) => recolorTrace(trace, palette, ink));
	const out: Figure = { ...figure, data: recolor(figure.data) ?? [] };
	if (figure.frames) out.frames = figure.frames.map((frame) => ({ ...frame, data: recolor(frame.data) }));
	if (palette.length) out.layout = { ...(figure.layout ?? {}), colorway: palette };
	return out;
}

/** The colours of the page that a figure's controls take. */
export interface ControlColors {
	/** The text, also of the button labels and the slider's ticks. */
	text: string;
	/** The background of the buttons and the slider's rail. */
	background: string;
	/** The borders of the buttons and the slider. */
	border: string;
	/** The slider's handle while dragged. */
	active: string;
}

/**
 * The layout's buttons (`updatemenus`) and sliders in the page's colours: without a template,
 * Plotly draws them white with light text, which cannot be read in dark mode.
 */
export function themeControls(layout: Record<string, any>, colors: ControlColors): Record<string, any> {
	const out = { ...layout };
	if (Array.isArray(layout.updatemenus)) {
		out.updatemenus = layout.updatemenus.map((menu: Record<string, any>) => ({
			// Plotly draws the active button in a fixed light blue: off for buttons (Play, Pause)
			...(menu.type === 'buttons' && menu.showactive === undefined ? { showactive: false } : {}),
			...menu,
			bgcolor: colors.background,
			bordercolor: colors.border,
			font: { ...menu.font, color: colors.text },
		}));
	}
	if (Array.isArray(layout.sliders)) {
		out.sliders = layout.sliders.map((slider: Record<string, any>) => ({
			...slider,
			bgcolor: colors.background,
			bordercolor: colors.border,
			activebgcolor: colors.active,
			tickcolor: colors.border,
			font: { ...slider.font, color: colors.text },
			currentvalue: { ...slider.currentvalue, font: { ...slider.currentvalue?.font, color: colors.text } },
		}));
	}
	return out;
}
