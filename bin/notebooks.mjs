#!/usr/bin/env node
// `starlight-notebooks <execute|convert|clean> [options]`: runs tools/notebooks.py of this package
// in the project's Python, which has the package and its docs dependencies (nbclient, nbformat,
// ipykernel). That is $DOCS_PYTHON, else the nearest .venv above the current directory, else
// python3. Run it from the site directory (docs/), as npm scripts do.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../tools/notebooks.py', import.meta.url));
const venvPython = process.platform === 'win32' ? join('.venv', 'Scripts', 'python.exe') : join('.venv', 'bin', 'python');

function findPython() {
	if (process.env.DOCS_PYTHON) return process.env.DOCS_PYTHON;
	for (let directory = process.cwd(); ; directory = dirname(directory)) {
		if (existsSync(join(directory, venvPython))) return join(directory, venvPython);
		if (dirname(directory) === directory) break;
	}
	return process.platform === 'win32' ? 'python' : 'python3';
}

const python = findPython();
const result = spawnSync(python, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) {
	console.error(`[notebooks] could not run ${python}: ${result.error.message}`);
	console.error('Set DOCS_PYTHON to the Python interpreter of the project.');
}
process.exit(result.status ?? 1);
