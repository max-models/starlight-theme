// Pyodide (Python compiled to WebAssembly) for the live demos: the version the pages load from
// the CDN and the check (bin/pyodide.mjs) runs under Node, the slider values, and the contract of a
// demo's Python. Plain JavaScript, so that both the Astro component and the Node check import it.

/** The Pyodide release of the pages and of the check; both must use the same one. */
export const PYODIDE_VERSION = '314.0.6';

/** Where the pages load Pyodide and its packages (NumPy, SciPy, ...) from. */
export const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** The list of wheels a site serves for its demos, written by tools/pyodide_wheels.py. */
export const WHEELS_JSON = 'pyodide/wheels.json';

/** @typedef {import('./pyodide.d.mts').Control} Control A slider or choice; see pyodide.d.mts. */

/**
 * The position of a control's slider for a value (the exponent on a log slider).
 * @param {Control} control
 * @param {number | string} value
 */
export function sliderPosition(control, value) {
	if (control.options) return String(value);
	return control.log ? Math.log10(Number(value)) : Number(value);
}

/**
 * The value a control passes to `run` for a slider position.
 * @param {Control} control
 * @param {string} position The slider's (or select's) value.
 */
export function controlValue(control, position) {
	if (control.options) {
		const match = control.options.find((option) => String(option) === position);
		return match ?? position;
	}
	const x = Number(position);
	if (!control.log) return x;
	// 10 ** 0.3 is 1.9952623149688795: rounded to the digits shown, the value is what the reader sees
	return Number((10 ** x).toPrecision(12));
}

/**
 * The value as the page shows it next to the slider.
 * @param {Control} control
 * @param {number | string} value
 */
export function formatValue(control, value) {
	if (typeof value !== 'number') return String(value);
	const digits = control.digits ?? 3;
	const magnitude = Math.abs(value);
	if (magnitude !== 0 && (magnitude >= 1e4 || magnitude < 1e-2)) {
		const [mantissa, exponent] = value.toExponential(digits - 1).split('e');
		return `${Number(mantissa)}×10${superscript(Number(exponent))}`;
	}
	if (Number.isInteger(value) && control.step !== undefined && Number.isInteger(control.step)) return String(value);
	return String(Number(value.toPrecision(digits)));
}

const SUPERSCRIPTS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** @param {number} exponent */
function superscript(exponent) {
	return [...String(exponent)].map((c) => SUPERSCRIPTS[/** @type {keyof typeof SUPERSCRIPTS} */ (c)] ?? c).join('');
}

/**
 * The Python that runs a demo's `run(**values)` and returns its result as JSON. A demo's `run`
 * returns a dict with
 *
 * - `figure`: a Plotly figure as a dict (`data`, `layout`), or a list of them;
 * - `numbers`: optional, `{label: text}` (a number is formatted with three digits);
 * - `text`: optional, a sentence shown below the figure.
 *
 * NumPy arrays and scalars in it become lists and numbers; a plotly.graph_objects Figure becomes
 * its dict.
 */
export const RUN_DEMO = `
import json as _json
import math as _math


def _demo_plain(value):
    """The result as JSON types; NaN and infinities become null (a gap in a Plotly line)."""
    if hasattr(value, "to_plotly_json"):
        value = value.to_plotly_json()
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, dict):
        return {str(key): _demo_plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_demo_plain(item) for item in value]
    if isinstance(value, float):
        return value if _math.isfinite(value) else None
    if value is None or isinstance(value, (bool, int, str)):
        return value
    raise TypeError(f"{type(value).__name__} is not JSON serializable")


def _demo_json(values_json):
    result = run(**_json.loads(values_json))
    if not isinstance(result, dict) or "figure" not in result and "numbers" not in result:
        raise TypeError("run() must return a dict with 'figure' and/or 'numbers'")
    return _json.dumps(_demo_plain(result), allow_nan=False)
`;

/**
 * The result of `_demo_json` as figures, numbers and text.
 * @param {string} json
 * @returns {{ figures: Record<string, any>[], numbers: [string, string][], text: string }}
 */
export function parseResult(json) {
	const result = JSON.parse(json);
	const figures = result.figure === undefined || result.figure === null ? [] : Array.isArray(result.figure) ? result.figure : [result.figure];
	const numbers = Object.entries(result.numbers ?? {}).map(([label, value]) => [label, typeof value === 'number' ? formatValue({ name: label, label, value }, value) : String(value)]);
	return { figures, numbers: /** @type {[string, string][]} */ (numbers), text: result.text ? String(result.text) : '' };
}
