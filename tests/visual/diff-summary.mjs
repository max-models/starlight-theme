// After a failed `npm run test:visual`: where each screenshot differs, from Playwright's diff
// images (test-results/**/*-diff.png, changed pixels in red), as the share of changed pixels in
// each 100 px band of rows, so a CI log shows whether a change is local (a layout or colour change)
// or spread over the whole page (text drawn differently).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

function* diffs(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* diffs(path);
		else if (entry.name.endsWith('-diff.png')) yield path;
	}
}

for (const path of diffs('test-results')) {
	const { data, info } = await sharp(path).raw().toBuffer({ resolveWithObject: true });
	const bands = [];
	let changed = 0;
	let left = info.width;
	let right = 0;
	for (let y = 0; y < info.height; y++) {
		for (let x = 0; x < info.width; x++) {
			const i = (y * info.width + x) * info.channels;
			// Playwright marks a changed pixel red and an anti-aliasing difference yellow
			const red = data[i] > 200 && data[i + 1] < 80 && data[i + 2] < 80;
			if (!red) continue;
			changed++;
			bands[Math.floor(y / 100)] = (bands[Math.floor(y / 100)] ?? 0) + 1;
			left = Math.min(left, x);
			right = Math.max(right, x);
		}
	}
	const share = (n, rows) => ((100 * n) / (rows * info.width)).toFixed(1) + '%';
	console.log(`${path}: ${changed} changed pixels, x ${left}-${right}`);
	for (let band = 0; band * 100 < info.height; band++) {
		console.log(`  y ${band * 100}-${band * 100 + 99}: ${share(bands[band] ?? 0, 100)}`);
	}
}
