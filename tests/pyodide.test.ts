// lib/pyodide.mjs: the slider values of the live demos and the result of a demo's run().
import { describe, expect, it } from 'vitest';
import { PYODIDE_CDN, PYODIDE_VERSION, controlValue, formatValue, parseResult, sliderPosition } from '../lib/pyodide.mjs';
import pkg from '../package.json';

const linear = { name: 'dt', label: 'Time step', min: 0.1, max: 1, step: 0.1, value: 0.3 };
const log = { name: 'ne', label: 'Density', min: 16, max: 21, step: 0.05, value: 1e19, log: true };
const choice = { name: 'gas', label: 'Gas', options: ['Ar', 'He', 3], value: 'He' };

describe('controls', () => {
	it('puts a log slider at the exponent and reads the value back', () => {
		expect(sliderPosition(log, 1e19)).toBe(19);
		expect(controlValue(log, '19')).toBe(1e19);
		expect(controlValue(log, '0.3')).toBe(1.99526231497);
	});

	it('reads linear sliders and choices', () => {
		expect(controlValue(linear, '0.5')).toBe(0.5);
		expect(sliderPosition(choice, 'He')).toBe('He');
		expect(controlValue(choice, 'He')).toBe('He');
		expect(controlValue(choice, '3')).toBe(3);
	});

	it('formats values for the page', () => {
		expect(formatValue(log, 1e19)).toBe('1×10¹⁹');
		expect(formatValue(log, 2.5e-5)).toBe('2.5×10⁻⁵');
		expect(formatValue(linear, 0.30000000000000004)).toBe('0.3');
		expect(formatValue({ name: 'n', label: 'n', value: 5, step: 1 }, 5)).toBe('5');
		expect(formatValue(choice, 'Ar')).toBe('Ar');
	});
});

describe('parseResult', () => {
	it('takes one figure or a list, and formats numbers', () => {
		const one = parseResult(JSON.stringify({ figure: { data: [{ y: [1] }] }, numbers: { 'S<sub>CR</sub>': 1.234567e-17, Steps: 'ten' } }));
		expect(one.figures).toHaveLength(1);
		expect(one.numbers).toEqual([
			['S<sub>CR</sub>', '1.23×10⁻¹⁷'],
			['Steps', 'ten'],
		]);
		expect(one.text).toBe('');
		const two = parseResult(JSON.stringify({ figure: [{ data: [] }, { data: [] }], text: 'Done.' }));
		expect(two.figures).toHaveLength(2);
		expect(two.text).toBe('Done.');
	});
});

describe('version', () => {
	it('is the one the check installs', () => {
		expect(pkg.devDependencies.pyodide).toBe(PYODIDE_VERSION);
		expect(PYODIDE_CDN).toContain(`/v${PYODIDE_VERSION}/full/`);
	});
});
