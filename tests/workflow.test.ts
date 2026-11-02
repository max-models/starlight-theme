// The CI workflows: Node comes from the newest release, not the runner's tool cache.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const dir = join(__dirname, '..', '.github', 'workflows');

describe('setup-node', () => {
	for (const name of readdirSync(dir).filter((file) => file.endsWith('.yml'))) {
		it(`checks for the latest Node release in ${name}`, () => {
			const workflow = parse(readFileSync(join(dir, name), 'utf8'));
			for (const job of Object.values<any>(workflow.jobs)) {
				for (const step of job.steps ?? []) {
					if (String(step.uses ?? '').startsWith('actions/setup-node')) {
						expect(step.with['check-latest']).toBe(true);
					}
				}
			}
		});
	}
});

// The smoke paths of a site name pages of the code being built. The stable build next to a
// push or pull request from devel is the previous release, which lacks pages added since
// (e.g. numerics/index.html in the release adding method cards).
describe('smoke test of the docs', () => {
	const steps = (job: string) => parse(readFileSync(join(dir, 'docs.yml'), 'utf8')).jobs[job].steps as any[];
	const run = (script: string, cwd: string, env: Record<string, string>) =>
		spawnSync('bash', ['-c', script], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' });
	const page = (root: string, path: string) => {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), '<a href="/site/">');
	};

	it('checks only index.html in a build of another branch', () => {
		const script = steps('build').find((step) => step.name === 'Smoke test the built site').run;
		const docs = mkdtempSync(join(tmpdir(), 'smoke-'));
		page(docs, 'dist/index.html');
		const env = { SMOKE_PATHS: 'numerics/index.html', BASE: '/site/' };
		expect(run(script, docs, { ...env, CURRENT: 'false' }).status).toBe(0);
		const current = run(script, docs, { ...env, CURRENT: 'true' });
		expect(current.status).toBe(1);
		expect(current.stdout).toContain('missing dist/numerics/index.html');
	});

	it('checks the stable root of the assembled site only from the stable branch', () => {
		const script = steps('assemble').find((step) => step.name === 'Check the assembled site').run;
		const work = mkdtempSync(join(tmpdir(), 'assemble-'));
		mkdirSync(join(work, 'builds', 'site-stable'), { recursive: true });
		page(work, 'site/index.html');
		const env = { SMOKE_PATHS: 'numerics/index.html', STABLE: 'main', DEPLOY: 'false' };
		expect(run(script, work, { ...env, CURRENT_REF: 'devel' }).status).toBe(0);
		expect(run(script, work, { ...env, CURRENT_REF: 'main' }).status).toBe(1);
	});
});
