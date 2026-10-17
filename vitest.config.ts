// Tests of the TypeScript side (defineDocs, the plugin, the scaffold): `npm run test:js`.
// The Python tools have theirs in tests/test_*.py (`npm run test:py`).
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: { include: ['tests/**/*.test.ts'] },
});
