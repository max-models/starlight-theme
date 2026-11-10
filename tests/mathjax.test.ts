import { describe, expect, it } from 'vitest';
import { formulaOf, hasMath, mathjaxConfig, mathjaxMacros } from '../lib/mathjax.ts';

describe('hasMath', () => {
	it('finds a formula in any label of the figure', () => {
		expect(hasMath({ data: [{ name: 'electrons' }], layout: { xaxis: { title: { text: '$\\rho$' } } } })).toBe(true);
		expect(hasMath({ data: [{ name: '$n_e$' }] })).toBe(true);
		expect(hasMath({ layout: { annotations: [{ text: 'fit: $\\gamma = 0.1$' }] } })).toBe(true);
	});

	it('ignores dollar signs that are no formula, data and templates', () => {
		expect(hasMath({ layout: { title: { text: 'costs \\$5 and \\$10' } } })).toBe(false);
		expect(hasMath({ layout: { title: { text: 'one $ sign' } } })).toBe(false);
		expect(hasMath({ data: [{ x: ['$a$'], hovertemplate: '$%{y}$' }] })).toBe(false);
		expect(hasMath({ data: [{ y: [1, 2, 3] }], layout: {} })).toBe(false);
	});
});

describe('mathjaxMacros', () => {
	it('turns KaTeX macros into MathJax ones with their number of arguments', () => {
		expect(mathjaxMacros({ '\\vec': '\\boldsymbol{#1}', '\\R': '\\mathbb{R}', '\\pair': '(#1, #2)' })).toEqual({
			vec: ['\\boldsymbol{#1}', 1],
			R: '\\mathbb{R}',
			pair: ['(#1, #2)', 2],
		});
		expect(mathjaxMacros()).toEqual({});
	});

	it('puts them in a configuration that leaves the page to KaTeX', () => {
		const config = mathjaxConfig({ '\\R': '\\mathbb{R}' });
		expect(config.tex.macros).toEqual({ R: '\\mathbb{R}' });
		expect(config.startup.typeset).toBe(false);
	});
});

describe('formulaOf', () => {
	it('returns the TeX of a label that is one formula', () => {
		expect(formulaOf('$\\sigma_s\\text{ [m}^2\\text{]}$')).toBe('\\sigma_s\\text{ [m}^2\\text{]}');
		expect(formulaOf('plain')).toBeNull();
		expect(formulaOf('fit: $\\gamma$')).toBeNull();
	});
});
