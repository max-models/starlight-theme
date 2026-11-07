// The site's colours for Plotly figures: palette slots and the hints of web figures.
import { describe, expect, it } from 'vitest';
import { colorSlot, isBlack, paletteFigure, recolorTrace, themeControls, webHints, withAlphaOf } from '../lib/plotly-theme.ts';

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
