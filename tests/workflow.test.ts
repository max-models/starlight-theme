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

// A push to the dev branch also builds the stable site from the last release, which may lack
// the pages that the dev branch's smoke paths list: only the stable branch's own push checks them.
describe('smoke paths of the stable build', () => {
	const workflow = parse(readFileSync(join(dir, 'docs.yml'), 'utf8'));
	const steps: any[] = Object.values<any>(workflow.jobs).flatMap((job) => job.steps ?? []);

	it('are checked in the build only for the dev build or a push to the stable branch', () => {
		const smoke = steps.find((step) => step.name === 'Smoke test the built site');
		expect(smoke.env.SMOKE_PATHS).toContain("matrix.channel != 'stable'");
		expect(smoke.env.SMOKE_PATHS).toContain("format('refs/heads/{0}', inputs.stable-branch)");
	});

	const check = steps.find((step) => step.name === 'Check the assembled site');
	function run(env: Record<string, string>, files: string[]): number {
		const site = mkdtempSync(join(tmpdir(), 'site-'));
		for (const file of files) {
			mkdirSync(dirname(join(site, 'site', file)), { recursive: true });
			writeFileSync(join(site, 'site', file), '');
		}
		const result = spawnSync('bash', ['-e', '-c', check.run], { cwd: site, env: { ...process.env, ...env }, encoding: 'utf8' });
		return result.status ?? 1;
	}
	const env = { SMOKE_PATHS: 'numerics/index.html', STABLE: 'main', DEPLOY: 'true' };
	const release = ['index.html', 'dev/index.html', 'dev/numerics/index.html'];

	it('passes a push to devel whose new page is not released yet', () => {
		expect(run({ ...env, REF: 'refs/heads/devel' }, release)).toBe(0);
	});

	it('fails the release without the page, and the dev build without it', () => {
		expect(run({ ...env, REF: 'refs/heads/main' }, release)).toBe(1);
		expect(run({ ...env, REF: 'refs/heads/devel' }, ['index.html', 'dev/index.html'])).toBe(1);
	});

	it('checks a single build in full', () => {
		expect(run({ SMOKE_PATHS: 'numerics/index.html', STABLE: '', DEPLOY: 'false', REF: 'refs/pull/1/merge' }, ['index.html'])).toBe(1);
		expect(run({ SMOKE_PATHS: 'numerics/index.html', STABLE: '', DEPLOY: 'false', REF: 'refs/pull/1/merge' }, ['index.html', 'numerics/index.html'])).toBe(0);
	});
});
