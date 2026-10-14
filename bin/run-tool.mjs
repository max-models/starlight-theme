// Runs a Python tool of this package (tools/<name>.py) in the project's Python, which has the
// package and its docs dependencies. That is $DOCS_PYTHON, else the nearest .venv above the
// current directory, else python3. Used by the starlight-notebooks and starlight-gallery commands.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const venvPython = process.platform === 'win32' ? join('.venv', 'Scripts', 'python.exe') : join('.venv', 'bin', 'python');

function findPython() {
	if (process.env.DOCS_PYTHON) return process.env.DOCS_PYTHON;
	for (let directory = process.cwd(); ; directory = dirname(directory)) {
		if (existsSync(join(directory, venvPython))) return join(directory, venvPython);
		if (dirname(directory) === directory) break;
	}
	return process.platform === 'win32' ? 'python' : 'python3';
}

export function runTool(name) {
	const script = fileURLToPath(new URL(`../tools/${name}.py`, import.meta.url));
	const python = findPython();
	const result = spawnSync(python, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
	if (result.error) {
		console.error(`[${name}] could not run ${python}: ${result.error.message}`);
		console.error('Set DOCS_PYTHON to the Python interpreter of the project.');
	}
	process.exit(result.status ?? 1);
}
