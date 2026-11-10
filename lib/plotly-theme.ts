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
const WHITE = /^(white|#fff|#ffffff|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(,\s*[\d.]+\s*)?\))$/i;

/** Whether a colour is white, which a figure drawn for a white page uses as "paper". */
export function isWhite(color: unknown): boolean {
	return typeof color === 'string' && WHITE.test(color.trim());
}

/**
 * Black ("ink") as the page's text colour and white ("paper") as its background, keeping the
 * transparency; other colours are unchanged. A figure drawn for a white page then reads on a
 * dark one too.
 */
export function inkAndPaper(color: unknown, ink?: string, paper?: string): unknown {
	if (ink && isBlack(color)) return withAlphaOf(ink, color);
	if (paper && isWhite(color)) return withAlphaOf(paper, color);
	return color;
}

/** Whether a colour is black, which a figure uses for reference curves drawn in "ink". */
export function isBlack(color: unknown): boolean {
	return typeof color === 'string' && BLACK.test(color.trim());
}

/** The palette slot of a trace (`trace.meta.color_slot`), or null. */
export function colorSlot(trace: Trace): number | null {
	const slot = trace?.meta?.color_slot;
	return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

/** Trace types that colour an area by value: text on them is coloured against the colour map. */
const COLOR_MAPS = /^(heatmap|histogram2d|histogram2dcontour|contour|image|densitymapbox)$/;

/** Whether a trace colours an area by value, so that its own text keeps its colours. */
export function isColorMap(trace: Trace): boolean {
	return typeof trace?.type === 'string' && COLOR_MAPS.test(trace.type);
}

/**
 * The trace in the site's colours wherever it had a single colour (the line, the markers and the
 * fill, keeping a fill's transparency): the palette colour of its slot; else `ink` (the text
 * colour) for black and `paper` (the background) for white, also for the markers' edges and the
 * text. Other colours are unchanged.
 */
export function recolorTrace(trace: Trace, palette: string[], ink?: string, paper?: string): Trace {
	const slot = colorSlot(trace);
	const color = slot !== null && palette.length ? palette[slot % palette.length] : undefined;
	const swap = (value: unknown) => {
		if (typeof value !== 'string') return value;
		return color ? withAlphaOf(color, value) : inkAndPaper(value, ink, paper);
	};
	const out: Trace = { ...trace };
	let changed = false;
	for (const key of ['line', 'marker', 'textfont'] as const) {
		const value = trace[key]?.color;
		if (key === 'textfont' && isColorMap(trace)) continue; // cell labels contrast with the colour map
		const swapped = key === 'textfont' ? inkAndPaper(value, ink, paper) : swap(value);
		if (typeof value === 'string' && swapped !== value) {
			out[key] = { ...trace[key], color: swapped };
			changed = true;
		}
	}
	const edge = trace.marker?.line?.color;
	if (typeof edge === 'string' && inkAndPaper(edge, ink, paper) !== edge) {
		out.marker = { ...(out.marker ?? trace.marker), line: { ...trace.marker.line, color: inkAndPaper(edge, ink, paper) } };
		changed = true;
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
export function paletteFigure(figure: Figure, palette: string[], ink?: string, paper?: string): Figure {
	const recolor = (data?: Trace[]) => data?.map((trace) => recolorTrace(trace, palette, ink, paper));
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

/**
 * The media query of a narrow (phone) screen, on which a figure is shown compact: see
 * `compactFigure`. The same width as the CSS of components/PlotlyFigure.astro.
 */
export const COMPACT_QUERY = '(max-width: 40rem)';

const CARTESIAN_AXIS = /^[xy]axis\d*$/;

export function titleText(title: unknown): string {
	if (typeof title === 'string') return title;
	if (title && typeof title === 'object' && typeof (title as any).text === 'string') return (title as any).text;
	return '';
}

function compactColorbar(colorbar: unknown): Record<string, any> | undefined {
	if (!colorbar || typeof colorbar !== 'object') return undefined;
	const bar = colorbar as Record<string, any>;
	return { ...bar, thickness: Math.min(bar.thickness ?? 30, 10), xpad: Math.min(bar.xpad ?? 10, 4) };
}

/**
 * The figure for a narrow screen, as chart tools for the web lay them out on phones: the legend
 * in a row above the plot instead of beside it, small margins (the axes make room for their
 * tick labels; room for the buttons and slider of an animation), at most six ticks on an x
 * axis, a font of at most 12 px and thin colorbars. The data stay as they are.
 */
export function compactFigure(figure: Figure): Figure {
	const layout = figure.layout ?? {};
	const out: Record<string, any> = { ...layout };
	const axes = Object.keys(layout).filter((key) => CARTESIAN_AXIS.test(key));
	const titled = (prefix: string) => axes.some((key) => key.startsWith(prefix) && titleText(layout[key]?.title));
	const margin = layout.margin ?? {};
	const controls = hasControls(figure);
	const title = movableTitle(figure);
	// the y axis's title, shown above the plot as text (see movableYTitle): along the axis, a long
	// one is longer than a phone's plot is high
	const yTitle = movableYTitle(figure);
	// buttons in the slider's row (Play and Pause beside it) cover its start on a narrow screen:
	// the slider moves to a row of its own below them
	const menus: Record<string, any>[] = Array.isArray(layout.updatemenus) ? layout.updatemenus : [];
	const besideButtons = (slider: Record<string, any>) =>
		menus.some((menu) => Math.abs((menu.y ?? 1) - (slider.y ?? 0)) < 0.05 && (menu.x ?? -0.05) <= (slider.x ?? 0));
	const sliders: Record<string, any>[] = Array.isArray(layout.sliders) ? layout.sliders : [];
	const moved = sliders.some(besideButtons);
	const cap = (value: unknown, max: number) => Math.min(typeof value === 'number' ? value : max, max);
	out.margin = {
		...margin,
		l: cap(margin.l, titled('y') && !yTitle ? 56 : 16),
		r: cap(margin.r, 12),
		// the buttons (above the plot) and the slider (below it) of an animation sit in the
		// margins, and Plotly does not make room for a slider: 150 px fit it with its labels
		t: controls ? cap(margin.t, 70) : cap(margin.t, titleText(layout.title) && !title ? 44 : 16),
		b: controls ? Math.max(typeof margin.b === 'number' ? margin.b : 0, 150) + (moved ? 50 : 0) : cap(margin.b, titled('x') ? 64 : 16),
		pad: 0,
	};
	for (const key of axes) {
		const axis = { ...layout[key], automargin: true };
		if (yTitle && key.startsWith('y')) axis.title = { text: '' };
		const text = titleText(axis.title);
		// without a standoff Plotly pins an automargin axis's title to the edge of the figure
		if (text) axis.title = { ...(typeof axis.title === 'object' ? axis.title : { text }), standoff: axis.title?.standoff ?? 6 };
		if (key.startsWith('x') && axis.tickvals === undefined && axis.dtick === undefined && axis.nticks === undefined) axis.nticks = 6;
		out[key] = axis;
	}
	if (layout.showlegend !== false) {
		// at the top of the figure: hung from the plot's top edge (y > 1), Plotly draws a horizontal
		// legend about 15 px too low, over the plot
		out.legend = { ...layout.legend, orientation: 'h', x: 0, xanchor: 'left', y: 1, yanchor: 'top', yref: 'container' };
	}
	out.font = { ...layout.font, size: Math.min(layout.font?.size ?? 12, 12) };
	if (title) out.title = { text: '' }; // shown above the figure, see movableTitle
	if (moved) {
		out.sliders = sliders.map((slider) =>
			besideButtons(slider) ? { ...slider, x: 0, len: 1, pad: { ...slider.pad, t: (slider.pad?.t ?? 20) + 50 } } : slider
		);
	}
	for (const key of Object.keys(layout).filter((key) => /^coloraxis\d*$/.test(key))) {
		const bar = compactColorbar(layout[key]?.colorbar);
		if (bar) out[key] = { ...layout[key], colorbar: bar };
	}
	const data = figure.data?.map((trace) => {
		const bar = compactColorbar(trace.colorbar);
		const markerBar = compactColorbar(trace.marker?.colorbar);
		if (!bar && !markerBar) return trace;
		return { ...trace, ...(bar ? { colorbar: bar } : {}), ...(markerBar ? { marker: { ...trace.marker, colorbar: markerBar } } : {}) };
	});
	return { ...figure, ...(data ? { data } : {}), layout: out };
}

/**
 * The title that a narrow screen shows as text above the figure instead of in it, where Plotly
 * cannot wrap it and it collides with the legend: the figure's title, unless an animation's
 * frames change it. Plotly's markup (`<br>`, `<sub>`, ...) is dropped.
 */
export function movableTitle(figure: Figure): string {
	if (figure.frames?.some((frame) => frame.layout?.title !== undefined)) return '';
	return titleText(figure.layout?.title)
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, '')
		.trim();
}

/**
 * The title of a figure's y axis that a narrow screen shows as text above the plot, where it can
 * wrap, instead of along the axis: the title of the figure's one y axis (none for twin axes,
 * several panels or 3D scenes, whose titles stay where they are), as written (markup and
 * formulas included).
 */
export function movableYTitle(figure: Figure): string {
	const layout = figure.layout ?? {};
	if (Object.keys(layout).some((key) => /^scene\d*$/.test(key))) return '';
	const yAxes = Object.keys(layout).filter((key) => /^yaxis\d*$/.test(key));
	if (yAxes.length !== 1 || yAxes[0] !== 'yaxis') return '';
	return titleText(layout.yaxis?.title).trim();
}

/** Whether a figure has controls below or above the plot: a slider or buttons (an animation). */
export function hasControls(figure: Figure): boolean {
	const layout = figure.layout ?? {};
	return (Array.isArray(layout.sliders) && layout.sliders.length > 0) || (Array.isArray(layout.updatemenus) && layout.updatemenus.length > 0);
}

/** The page's colours that a figure's axes, labels and annotations take (see `calmLayout`). */
export interface PageColors {
	/** Titles, annotations and black ("ink"). */
	text: string;
	/** Tick labels: quieter than the titles. */
	muted: string;
	/** Axis lines, ticks and zero lines. */
	line: string;
	/** Grid lines. */
	grid: string;
	/** The page background, for white ("paper"). */
	background: string;
	/** The background of hover labels. */
	hover: string;
	/** The font of the page. */
	font: string;
}

/**
 * The layout as web charts draw it: the axes' lines only at the bottom and left (no box), short
 * ticks in the line colour, quiet tick labels, light grid lines (where the figure has them), hover
 * labels in the page's colours, legends without a white box, and black and white annotations and
 * shapes in the page's text and background colours. Annotations placed in the data of axes that show a colour map (`data`)
 * keep their colours, chosen against it.
 */
export function calmLayout(layout: Record<string, any>, colors: PageColors, data: Trace[] = []): Record<string, any> {
	const mapped = new Set(data.filter(isColorMap).flatMap((trace) => [trace.xaxis ?? 'x', trace.yaxis ?? 'y']));
	const onColorMap = (note: Record<string, any>) => mapped.has(note.xref ?? 'x') && mapped.has(note.yref ?? 'y');
	const out: Record<string, any> = { ...layout };
	for (const key of Object.keys(layout).filter((key) => CARTESIAN_AXIS.test(key))) {
		const axis = layout[key] ?? {};
		const title = axis.title;
		out[key] = {
			...axis,
			mirror: false,
			linecolor: colors.line,
			tickcolor: colors.line,
			gridcolor: colors.grid,
			zerolinecolor: colors.line,
			...(axis.ticks ? { ticklen: Math.min(axis.ticklen ?? 5, 4) } : {}),
			tickfont: { ...axis.tickfont, color: colors.muted },
			...(title && typeof title === 'object' ? { title: { ...title, font: { ...title.font, color: colors.text } } } : {}),
		};
	}
	// every legend (a figure can have legend2, legend3, ...): no white box behind the page's text
	for (const key of Object.keys(layout).filter((key) => /^legend\d*$/.test(key))) {
		const legend = layout[key] ?? {};
		out[key] = {
			...legend,
			bgcolor: legend.bgcolor ? inkAndPaper(legend.bgcolor, colors.text, colors.background) : 'rgba(0,0,0,0)',
			...(legend.bordercolor ? { bordercolor: colors.line } : {}),
			...(legend.font?.color ? { font: { ...legend.font, color: inkAndPaper(legend.font.color, colors.text, colors.background) } } : {}),
		};
	}
	out.hoverlabel = {
		...layout.hoverlabel,
		bgcolor: colors.hover,
		bordercolor: colors.line,
		font: { ...layout.hoverlabel?.font, color: colors.text, family: colors.font },
	};
	if (Array.isArray(layout.annotations)) {
		out.annotations = layout.annotations.map((note: Record<string, any>) => onColorMap(note) ? note : {
			...note,
			...(note.font?.color ? { font: { ...note.font, color: inkAndPaper(note.font.color, colors.text, colors.background) } } : {}),
			...(note.arrowcolor ? { arrowcolor: inkAndPaper(note.arrowcolor, colors.text, colors.background) } : {}),
			...(note.bgcolor ? { bgcolor: inkAndPaper(note.bgcolor, colors.text, colors.background) } : {}),
		});
	}
	if (Array.isArray(layout.shapes)) {
		out.shapes = layout.shapes.map((shape: Record<string, any>) => ({
			...shape,
			...(shape.line?.color ? { line: { ...shape.line, color: inkAndPaper(shape.line.color, colors.text, colors.background) } } : {}),
			...(shape.fillcolor ? { fillcolor: inkAndPaper(shape.fillcolor, colors.text, colors.background) } : {}),
		}));
	}
	return out;
}
