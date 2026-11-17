#!/usr/bin/env node
// `starlight-pyodide <wheels|check> [options]`, run in docs/:
//
//   wheels  builds the wheels the live demos install (tools/pyodide_wheels.py, in the project's
//           Python; needs uv) into public/pyodide/ with wheels.json.
//   check   runs the package in Pyodide under Node, as the browser would: installs the wheels of
//           wheels.json with micropip (their dependencies from Pyodide's packages or PyPI), imports
//           every module of the project's packages, runs each demo's `run()` with its defaults,
//           and optionally a pytest directory. Needs the npm package `pyodide` of the version in
//           lib/pyodide.mjs, installed in docs/ (`npm install --no-save pyodide@<version>`).
//
// check options:
//   --wheels DIR        the wheels and their wheels.json (default public/pyodide)
//   --demo FILE         a demo's Python (repeatable; default every src/components/*_demo.py)
//   --pytest DIR        a test directory to run in Pyodide (e.g. ../tests/portable)
//   --forbid A,B        modules no import may load (default cupy,mpi4py)
//   --skip REGEX        modules of the project not to import (e.g. "\.backends\.jax")
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { PYODIDE_VERSION, RUN_DEMO, parseResult } from '../lib/pyodide.mjs';
import { runTool } from './run-tool.mjs';

// Node's report of an uncaught error starts with the throwing source line, inside Pyodide one
// minified line of ~65 KB, which CI logs cut off together with the message after it.
process.on('uncaughtException', (error) => {
	console.error(error?.stack ?? error);
	process.exit(1);
});

const [command, ...rest] = process.argv.slice(2);

function options(args) {
	const out = { wheels: 'public/pyodide', demo: [], pytest: '', forbid: 'cupy,mpi4py', skip: '' };
	for (let i = 0; i < args.length; i++) {
		const key = args[i].replace(/^--/, '');
		if (!(key in out) || i + 1 >= args.length) throw new Error(`unknown option or missing value: ${args[i]}`);
		const value = args[++i];
		if (Array.isArray(out[key])) out[key].push(value);
		else out[key] = value;
	}
	return out;
}

function demoFiles(given) {
	if (given.length) return given;
	const dir = join('src', 'components');
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith('_demo.py'))
		.map((name) => join(dir, name));
}

function filesBelow(dir) {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (name === '__pycache__') return [];
		return statSync(path).isDirectory() ? filesBelow(path) : [path];
	});
}

// Imports every module of the installed project (the last wheel), with a guard that fails any
// import of the forbidden modules; returns the modules and the failures.
const IMPORT_ALL = `
import importlib
import importlib.abc
import importlib.metadata
import pkgutil
import re
import sys
import traceback

assert sys.platform == "emscripten", sys.platform


class _Forbid(importlib.abc.MetaPathFinder):
    def __init__(self, names):
        self.names = set(names)
        self.attempted = []

    def find_spec(self, fullname, path=None, target=None):
        if fullname.split(".")[0] in self.names:
            self.attempted.append(fullname)
            raise ImportError(f"{fullname} is not available in the browser")


_guard = _Forbid(_mm_forbid)
sys.meta_path.insert(0, _guard)


def _mm_top_level(distribution):
    names = set()
    for file in distribution.files or []:
        first = file.parts[0]
        if first.endswith((".dist-info", ".data")) or first.startswith("__"):
            continue
        names.add(first[:-3] if first.endswith(".py") else first)
    return sorted(names)


def _mm_import_all(distribution_name, skip):
    distribution = importlib.metadata.distribution(distribution_name)
    imported, failed = [], []
    skip = re.compile(skip) if skip else None
    for top in _mm_top_level(distribution):
        names = [top]
        try:
            package = importlib.import_module(top)
        except Exception:
            failed.append((top, traceback.format_exc()))
            continue
        if hasattr(package, "__path__"):
            names += [info.name for info in pkgutil.walk_packages(package.__path__, top + ".", onerror=lambda name: None)]
        for name in names:
            if ".tests" in name or ".test_" in name or (skip and skip.search(name)):
                continue
            try:
                importlib.import_module(name)
                imported.append(name)
            except Exception:
                failed.append((name, traceback.format_exc()))
    return distribution.version, imported, failed, list(_guard.attempted)
`;

async function check(args) {
	const opts = options(args);
	const listing = join(opts.wheels, 'wheels.json');
	if (!existsSync(listing)) throw new Error(`no ${listing}: run "npx starlight-pyodide wheels" first`);
	const { wheels } = JSON.parse(readFileSync(listing, 'utf8'));

	let loadPyodide;
	try {
		({ loadPyodide } = await import('pyodide'));
	} catch {
		throw new Error(`the npm package pyodide is missing: npm install --no-save pyodide@${PYODIDE_VERSION}`);
	}
	const pyodide = await loadPyodide();
	if (pyodide.version !== PYODIDE_VERSION) {
		throw new Error(`pyodide ${pyodide.version} is installed, the pages load ${PYODIDE_VERSION}: npm install --no-save pyodide@${PYODIDE_VERSION}`);
	}
	await pyodide.loadPackage(opts.pytest ? ['micropip', 'pytest'] : ['micropip']);

	let failures = 0;
	const fail = (message) => {
		failures++;
		console.error(`FAIL ${message}`);
	};

	// the wheels, from the emscripten file system, in the order of wheels.json
	const uris = wheels.map((wheel) => {
		pyodide.FS.writeFile(`/tmp/${wheel}`, readFileSync(join(opts.wheels, wheel)));
		return `emfs:/tmp/${wheel}`;
	});
	pyodide.globals.set('_mm_wheels', pyodide.toPy(uris));
	let begin = performance.now();
	await pyodide.runPythonAsync('import micropip\nawait micropip.install(list(_mm_wheels))');
	console.log(`installed ${wheels.join(', ')} and their dependencies in ${((performance.now() - begin) / 1000).toFixed(1)} s`);

	// every module of the project
	const project = basename(wheels.at(-1)).split('-')[0];
	pyodide.globals.set('_mm_forbid', pyodide.toPy(opts.forbid.split(',').filter(Boolean)));
	pyodide.runPython(IMPORT_ALL);
	begin = performance.now();
	const [version, imported, failed, forbidden] = pyodide
		.runPython(`_mm_import_all(${JSON.stringify(project)}, ${JSON.stringify(opts.skip)})`)
		.toJs();
	console.log(`imported ${imported.length} modules of ${project} ${version} in ${((performance.now() - begin) / 1000).toFixed(1)} s`);
	for (const [name, trace] of failed) fail(`import ${name}\n${trace}`);
	if (forbidden.length) console.log(`imports of ${[...new Set(forbidden)].join(', ')} were refused (forbidden in the browser)`);

	// each demo with the defaults of its run()
	for (const file of demoFiles(opts.demo)) {
		const namespace = pyodide.globals.get('dict')();
		begin = performance.now();
		try {
			const code = readFileSync(file, 'utf8');
			await pyodide.loadPackagesFromImports(code);
			await pyodide.runPythonAsync(code, { globals: namespace });
			await pyodide.runPythonAsync(RUN_DEMO, { globals: namespace });
			const result = parseResult(namespace.get('_demo_json')('{}'));
			if (!result.figures.length && !result.numbers.length) throw new Error('run() returned no figure and no numbers');
			for (const figure of result.figures) {
				if (!Array.isArray(figure.data) || !figure.data.length) throw new Error('a figure without data');
			}
			console.log(`demo ${file}: ${result.figures.length} figure(s), ${result.numbers.length} number(s) in ${((performance.now() - begin) / 1000).toFixed(2)} s`);
		} catch (error) {
			fail(`demo ${file}\n${error?.message ?? error}`);
		}
	}

	// a test directory, run against the installed wheels (not the sources)
	if (opts.pytest) {
		const root = resolve(opts.pytest);
		for (const path of filesBelow(root)) {
			const target = `/mm-tests/${relative(root, path)}`;
			pyodide.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
			pyodide.FS.writeFile(target, readFileSync(path));
		}
		const code = pyodide.runPython('import pytest\nint(pytest.main(["-q", "-p", "no:cacheprovider", "-o", "addopts=", "/mm-tests"]))');
		if (code !== 0) fail(`pytest ${opts.pytest} in Pyodide: exit code ${code}`);
	}

	if (failures) {
		console.error(`${failures} failure(s) in Pyodide ${PYODIDE_VERSION}`);
		process.exit(1);
	}
	console.log(`${project} runs in Pyodide ${PYODIDE_VERSION}`);
}

if (command === 'wheels') runTool('pyodide_wheels', rest);
else if (command === 'check') await check(rest);
else {
	console.error('usage: starlight-pyodide <wheels|check> [options] (see bin/pyodide.mjs)');
	process.exit(2);
}
