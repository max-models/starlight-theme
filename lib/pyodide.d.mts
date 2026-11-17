// Types of lib/pyodide.mjs (plain JavaScript, so that the Node check of bin/pyodide.mjs can import
// it from node_modules, where Node does not strip TypeScript).

export declare const PYODIDE_VERSION: string;
export declare const PYODIDE_CDN: string;
export declare const WHEELS_JSON: string;
export declare const RUN_DEMO: string;

/** A slider (or, with `options`, a choice) of a live demo. */
export interface Control {
	/** The keyword argument of `run` it sets. */
	name: string;
	/** The text before the value; may hold HTML (units with <sup>). */
	label: string;
	/** The smallest value (of the exponent with `log`). */
	min?: number;
	/** The largest value (of the exponent with `log`). */
	max?: number;
	/** The step of the slider (of the exponent with `log`). */
	step?: number;
	/** The start; with `log` the value itself, not its exponent. */
	value: number | string;
	/** A logarithmic slider: it moves the exponent, from 10^min to 10^max. */
	log?: boolean;
	/** Shown after the value; may hold HTML. */
	unit?: string;
	/** A choice instead of a slider. */
	options?: (string | number)[];
	/** Significant digits of the value shown; default 3. */
	digits?: number;
}

export declare function sliderPosition(control: Control, value: number | string): number | string;
export declare function controlValue(control: Control, position: string): number | string;
export declare function formatValue(control: Control, value: number | string): string;
export declare function parseResult(json: string): {
	figures: Record<string, any>[];
	numbers: [string, string][];
	text: string;
};
