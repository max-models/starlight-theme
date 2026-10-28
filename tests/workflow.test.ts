// The CI workflows: Node comes from the newest release, not the runner's tool cache.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
