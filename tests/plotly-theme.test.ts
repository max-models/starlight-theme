// The site's colours for Plotly figures: palette slots and the hints of web figures.
import { describe, expect, it } from 'vitest';
import { calmLayout, colorSlot, compactFigure, hasControls, inkAndPaper, isBlack, isWhite, movableTitle, movableYTitle, paletteFigure, recolorTrace, themeControls, webHints, withAlphaOf } from '../lib/plotly-theme.ts';

const palette = ['#111111', '#222222', '#333333'];

describe('webHints', () => {
	it('reads layout.meta.web and ignores plain figures', () => {
		expect(webHints({ layout: { meta: { web: { version: 1, aspect: 2 } } } })).toEqual({ version: 1, aspect: 2 });
		expect(webHints({ layout: { meta: 'text' } })).toEqual({});
		expect(webHints({})).toEqual({});
	});
});

describe('withAlphaOf', () => {
	it('keeps the transparency of an rgba colour', () => {
		expect(withAlphaOf('#0072b2', 'rgba(1, 2, 3, 0.25)')).toBe('rgba(0, 114, 178, 0.25)');
		expect(withAlphaOf('#abc', 'rgba(1,2,3,0.5)')).toBe('rgba(170, 187, 204, 0.5)');
		expect(withAlphaOf('#0072b2', '#ff0000')).toBe('#0072b2');
		expect(withAlphaOf('var(--x)', 'rgba(1,2,3,0.5)')).toBe('var(--x)');
	});
});

describe('recolorTrace', () => {
	it('gives a slotted trace the palette colour, wrapping around the palette', () => {
		const trace = { meta: { color_slot: 4 }, line: { color: '#ff7f0e', width: 2 }, marker: { color: '#ff7f0e' } };
		const out = recolorTrace(trace, palette);
		expect(out.line).toEqual({ color: '#222222', width: 2 });
		expect(out.marker.color).toBe('#222222');
		expect(trace.line.color).toBe('#ff7f0e'); // the input is unchanged
	});

	it('keeps per-point colours, other traces and the fill transparency', () => {
		const points = { meta: { color_slot: 0 }, marker: { color: [1, 2, 3] } };
		expect(recolorTrace(points, palette).marker.color).toEqual([1, 2, 3]);
		const plain = { line: { color: 'black' } };
		expect(recolorTrace(plain, palette)).toBe(plain);
		const band = { meta: { color_slot: 1 }, fillcolor: 'rgba(255, 127, 14, 0.2)' };
		expect(recolorTrace(band, palette).fillcolor).toBe('rgba(34, 34, 34, 0.2)');
		expect(colorSlot({ meta: { color_slot: -1 } })).toBeNull();
	});
});

describe('ink', () => {
	it('gives black traces the text colour', () => {
		expect(isBlack('black') && isBlack('#000') && isBlack('rgb(0, 0, 0)') && isBlack('rgba(0,0,0,0.3)')).toBe(true);
		expect(isBlack('#000001') || isBlack(undefined)).toBe(false);
		const reference = { line: { color: 'black', dash: 'dot' }, fillcolor: 'rgba(0,0,0,0.1)' };
		const out = recolorTrace(reference, palette, '#eeeadd');
		expect(out.line).toEqual({ color: '#eeeadd', dash: 'dot' });
		expect(out.fillcolor).toBe('rgba(238, 234, 221, 0.1)');
		expect(recolorTrace(reference, palette)).toBe(reference);
	});
});

describe('paletteFigure', () => {
	it('recolours data and frames and sets the colorway', () => {
		const figure = {
			data: [{ meta: { color_slot: 2 }, line: { color: '#2ca02c' } }, { y: [1, 2] }],
			layout: { title: 'x' },
			frames: [{ name: '1', data: [{ meta: { color_slot: 2 }, line: { color: '#2ca02c' } }] }],
		};
		const out = paletteFigure(figure, palette);
		expect(out.data![0].line.color).toBe('#333333');
		expect(out.data![1]).toEqual({ y: [1, 2] });
		expect(out.frames![0].data[0].line.color).toBe('#333333');
		expect(out.frames![0].name).toBe('1');
		expect(out.layout).toEqual({ title: 'x', colorway: palette });
	});

	it('leaves a figure alone without a palette', () => {
		const figure = { data: [{ meta: { color_slot: 0 }, line: { color: '#1f77b4' } }], layout: {} };
		expect(paletteFigure(figure, []).layout).toEqual({});
		expect(paletteFigure(figure, []).data![0].line.color).toBe('#1f77b4');
	});
});

describe('themeControls', () => {
	const colors = { text: '#eee', background: '#123', border: '#456', active: '#0ff' };

	it('gives buttons and sliders the page colours and keeps the rest', () => {
		const layout = {
			title: 'movie',
			updatemenus: [{ type: 'buttons', font: { size: 12 }, buttons: [{ label: 'Play' }] }],
			sliders: [{ steps: [{ label: '0' }], currentvalue: { prefix: 't = ' } }],
		};
		const out = themeControls(layout, colors);
		expect(out.title).toBe('movie');
		expect(out.updatemenus[0]).toMatchObject({ bgcolor: '#123', bordercolor: '#456', font: { size: 12, color: '#eee' } });
		expect(out.updatemenus[0].buttons).toEqual([{ label: 'Play' }]);
		expect(out.updatemenus[0].showactive).toBe(false); // no fixed light blue on the active button
		expect(themeControls({ updatemenus: [{ type: 'buttons', showactive: true }] }, colors).updatemenus[0].showactive).toBe(true);
		expect(themeControls({ updatemenus: [{ type: 'dropdown' }] }, colors).updatemenus[0]).not.toHaveProperty('showactive');
		expect(out.sliders[0]).toMatchObject({ bgcolor: '#123', activebgcolor: '#0ff', tickcolor: '#456', font: { color: '#eee' } });
		expect(out.sliders[0].currentvalue).toEqual({ prefix: 't = ', font: { color: '#eee' } });
		expect(layout.sliders[0]).not.toHaveProperty('bgcolor'); // the input is unchanged
	});

	it('leaves a layout without controls alone', () => {
		expect(themeControls({ xaxis: {} }, colors)).toEqual({ xaxis: {} });
	});
});

describe('compactFigure', () => {
	const figure = {
		data: [{ type: 'heatmap', colorbar: { title: 'φ' } }, { type: 'scatter', marker: { colorbar: { thickness: 20 } } }, { y: [1] }],
		layout: {
			title: { text: 'Energy' },
			margin: { l: 80, r: 80, t: 100, b: 80 },
			xaxis: { title: 't' },
			yaxis: { title: { text: 'E', standoff: 12 }, tickvals: [0, 1] },
			xaxis2: { tickvals: [0, 1] },
			legend: { x: 1.02, y: 1, font: { size: 9 } },
			font: { size: 14 },
			coloraxis: { colorbar: { thickness: 30 } },
		},
	};

	it('puts the legend above the plot and shrinks margins, font and colorbars', () => {
		const out = compactFigure(figure);
		const layout = out.layout!;
		expect(layout.legend).toEqual({ x: 0, y: 1, font: { size: 9 }, orientation: 'h', xanchor: 'left', yanchor: 'top', yref: 'container' });
		// the one y axis's title is shown above the plot: no room for it at the left
		expect(layout.margin).toEqual({ l: 16, r: 12, t: 16, b: 64, pad: 0 });
		expect(layout.title).toEqual({ text: '' }); // shown above the figure instead
		expect(layout.font.size).toBe(12);
		expect(layout.coloraxis.colorbar.thickness).toBe(10);
		expect(out.data![0].colorbar).toEqual({ title: 'φ', thickness: 10, xpad: 4 });
		expect(out.data![1].marker.colorbar.thickness).toBe(10);
		expect(out.data![2]).toBe(figure.data[2]);
		expect(figure.layout.legend.x).toBe(1.02); // the input is unchanged
	});

	it('gives the axes automargin, a title standoff and fewer x ticks', () => {
		const layout = compactFigure(figure).layout!;
		expect(layout.xaxis).toEqual({ title: { text: 't', standoff: 6 }, automargin: true, nticks: 6 });
		expect(layout.yaxis).toEqual({ title: { text: '' }, tickvals: [0, 1], automargin: true }); // above the plot
		expect(layout.xaxis2).toEqual({ tickvals: [0, 1], automargin: true });
	});

	it('keeps small margins, a hidden legend and a figure without a layout', () => {
		const layout = compactFigure({ layout: { margin: { l: 4, b: 2 }, showlegend: false } }).layout!;
		expect(layout.margin).toEqual({ l: 4, r: 12, t: 16, b: 2, pad: 0 });
		expect(layout).not.toHaveProperty('legend');
		expect(compactFigure({}).layout!.margin.l).toBe(16);
		const movie = compactFigure({ layout: { sliders: [{}], margin: { b: 60 } } }).layout!;
		expect(movie.margin).toMatchObject({ t: 70, b: 150 });
		expect(compactFigure({ layout: { updatemenus: [{}], margin: { t: 40, b: 200 } } }).layout!.margin).toMatchObject({ t: 40, b: 200 });
	});
});

describe('hasControls', () => {
	it('finds sliders and buttons', () => {
		expect(hasControls({ layout: { sliders: [{}] } })).toBe(true);
		expect(hasControls({ layout: { updatemenus: [{}] } })).toBe(true);
		expect(hasControls({ layout: { sliders: [] } })).toBe(false);
		expect(hasControls({})).toBe(false);
	});
});

describe('movableTitle', () => {
	it('takes a fixed title out of the figure, without markup', () => {
		expect(movableTitle({ layout: { title: { text: 'Power<br>per bin of E<sub>φ</sub>' } } })).toBe('Power per bin of Eφ');
		expect(movableTitle({ layout: { title: 'Energy' } })).toBe('Energy');
		expect(movableTitle({ layout: {} })).toBe('');
	});

	it('keeps a title that the frames of an animation change', () => {
		const movie = { layout: { title: 't = 0' }, frames: [{ layout: { title: 't = 1' } }] };
		expect(movableTitle(movie)).toBe('');
		expect(compactFigure(movie).layout!.title).toBe('t = 0');
	});
});

describe('movableYTitle', () => {
	it('moves the one y axis title above a phone\'s plot', () => {
		const figure = { layout: { xaxis: { title: { text: 'x' } }, yaxis: { title: { text: '$p\\text{ [W m}^{-3}\\text{]}$' } } } };
		expect(movableYTitle(figure)).toBe('$p\\text{ [W m}^{-3}\\text{]}$');
		const out = compactFigure(figure).layout!;
		expect(out.yaxis.title).toEqual({ text: '' });
		expect(out.xaxis.title.text).toBe('x');
		expect(out.margin.l).toBe(16);
	});

	it('leaves twin axes, panels and scenes as they are', () => {
		expect(movableYTitle({ layout: { yaxis: { title: 'a' }, yaxis2: { title: 'b' } } })).toBe('');
		expect(movableYTitle({ layout: { yaxis: { title: 'a' }, scene: {} } })).toBe('');
		expect(movableYTitle({ layout: { yaxis: {} } })).toBe('');
		expect(compactFigure({ layout: { yaxis: { title: 'a' }, yaxis2: { title: 'b' } } }).layout!.margin.l).toBe(56);
	});
});

describe('compactFigure with an animation', () => {
	it('moves a slider below the buttons in its row', () => {
		const layout = {
			margin: { b: 145 },
			updatemenus: [{ type: 'buttons', x: 0, y: 0, buttons: [{}, {}] }],
			sliders: [{ x: 0.08, len: 0.92, y: 0, pad: { t: 45 } }],
		};
		const out = compactFigure({ layout }).layout!;
		expect(out.sliders[0]).toEqual({ x: 0, len: 1, y: 0, pad: { t: 95 } });
		expect(out.margin.b).toBe(200);
		// a slider in a row of its own stays
		const alone = compactFigure({ layout: { updatemenus: [{ x: 0, y: 1.1 }], sliders: [{ x: 0.1, y: 0 }] } }).layout!;
		expect(alone.sliders[0]).toEqual({ x: 0.1, y: 0 });
	});
});

describe('ink and paper', () => {
	it('maps black to the text colour and white to the background', () => {
		expect(isWhite('white') && isWhite('#FFF') && isWhite('rgba(255, 255, 255, 0.5)')).toBe(true);
		expect(isWhite('#fffffe')).toBe(false);
		expect(inkAndPaper('black', '#eee', '#012')).toBe('#eee');
		expect(inkAndPaper('rgba(255,255,255,0.5)', '#eee', '#001122')).toBe('rgba(0, 17, 34, 0.5)');
		expect(inkAndPaper('#ff0000', '#eee', '#012')).toBe('#ff0000');
		expect(inkAndPaper('white', '#eee')).toBe('white'); // no paper given
	});

	it('recolours white lines, marker edges and text of a trace', () => {
		const trace = { line: { color: 'white' }, marker: { color: '#1f77b4', line: { color: 'black', width: 1 } }, textfont: { color: 'black' } };
		const out = recolorTrace(trace, palette, '#eee', '#012');
		expect(out.line.color).toBe('#012');
		expect(out.marker).toEqual({ color: '#1f77b4', line: { color: '#eee', width: 1 } });
		expect(out.textfont.color).toBe('#eee');
		// a slotted trace takes its palette colour, its edges still ink and paper
		const slotted = recolorTrace({ meta: { color_slot: 0 }, marker: { color: '#1f77b4', line: { color: 'white' } } }, palette, '#eee', '#012');
		expect(slotted.marker).toEqual({ color: '#111111', line: { color: '#012' } });
	});
});

describe('calmLayout', () => {
	const colors = { text: '#eee', muted: '#999', line: '#444', grid: '#222', background: '#012', hover: '#123', font: 'system-ui' };

	it('draws the axes without a box, with quiet ticks and light grid lines', () => {
		const layout = {
			xaxis: { mirror: true, linecolor: 'black', ticks: 'outside', ticklen: 8, title: { text: 't', font: { size: 14 } } },
			yaxis2: { mirror: 'ticks', tickfont: { size: 10 }, title: 'E' },
			scene: { xaxis: {} },
		};
		const out = calmLayout(layout, colors);
		expect(out.xaxis).toEqual({
			mirror: false, linecolor: '#444', tickcolor: '#444', gridcolor: '#222', zerolinecolor: '#444',
			ticks: 'outside', ticklen: 4, tickfont: { color: '#999' }, title: { text: 't', font: { size: 14, color: '#eee' } },
		});
		expect(out.yaxis2).toMatchObject({ mirror: false, tickfont: { size: 10, color: '#999' }, title: 'E' });
		expect(out.yaxis2).not.toHaveProperty('ticklen');
		expect(out.scene).toBe(layout.scene);
		expect(out.hoverlabel).toEqual({ bgcolor: '#123', bordercolor: '#444', font: { color: '#eee', family: 'system-ui' } });
	});

	it('gives annotations and shapes ink and paper', () => {
		const layout = {
			annotations: [{ text: 'a', font: { color: 'black', size: 9 }, arrowcolor: 'black', bgcolor: 'white' }, { text: 'b' }],
			shapes: [{ type: 'line', line: { color: 'rgba(0,0,0,0.5)', dash: 'dot' } }, { type: 'rect', fillcolor: 'white' }, { type: 'rect', fillcolor: '#ff0000' }],
		};
		const out = calmLayout(layout, colors);
		expect(out.annotations[0]).toEqual({ text: 'a', font: { color: '#eee', size: 9 }, arrowcolor: '#eee', bgcolor: '#012' });
		expect(out.annotations[1]).toEqual({ text: 'b' });
		expect(out.shapes[0].line).toEqual({ color: 'rgba(238, 238, 238, 0.5)', dash: 'dot' });
		expect(out.shapes[1].fillcolor).toBe('#012');
		expect(out.shapes[2].fillcolor).toBe('#ff0000');
	});
});

describe('labels on colour maps', () => {
	const colors = { text: '#eee', muted: '#999', line: '#444', grid: '#222', background: '#012', hover: '#123', font: 'system-ui' };

	it('keeps the colours of annotations on the data of a colour map', () => {
		const layout = { annotations: [{ text: '0.5', x: 0, y: 0, xref: 'x', yref: 'y', font: { color: 'white' } }, { text: 'note', xref: 'paper', yref: 'paper', font: { color: 'black' } }] };
		const out = calmLayout(layout, colors, [{ type: 'heatmap', z: [[1]] }]);
		expect(out.annotations[0].font.color).toBe('white');
		expect(out.annotations[1].font.color).toBe('#eee');
		// without a colour map they take ink and paper
		expect(calmLayout(layout, colors, [{ type: 'scatter' }]).annotations[0].font.color).toBe('#012');
		// on other axes too
		expect(calmLayout(layout, colors, [{ type: 'heatmap', xaxis: 'x2', yaxis: 'y2' }]).annotations[0].font.color).toBe('#012');
	});

	it('keeps the text colour of a colour map trace', () => {
		const heatmap = { type: 'heatmap', textfont: { color: 'white' } };
		expect(recolorTrace(heatmap, palette, '#eee', '#012')).toBe(heatmap);
	});
});

describe('legends', () => {
	const colors = { text: '#eee', muted: '#999', line: '#444', grid: '#222', background: '#012', hover: '#123', font: 'system-ui' };

	it('take the page colours, every legend of a figure', () => {
		const layout = {
			legend: { bgcolor: 'rgba(255, 255, 255, 0.8)', x: 1 },
			legend2: { bgcolor: 'white', bordercolor: 'black', font: { color: 'black', size: 9 } },
			legend3: {},
		};
		const out = calmLayout(layout, colors);
		expect(out.legend).toEqual({ bgcolor: 'rgba(0, 17, 34, 0.8)', x: 1 });
		expect(out.legend2).toEqual({ bgcolor: '#012', bordercolor: '#444', font: { color: '#eee', size: 9 } });
		expect(out.legend3).toEqual({ bgcolor: 'rgba(0,0,0,0)' });
	});
});
