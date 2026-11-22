// Screenshots of the example site, compared with the ones in tests/visual/ (npm run test:visual),
// so a change of the look shows up in review. Build the site first (npm run build, without
// executing the notebooks and scripts, as CI does); after a deliberate change, update the images
// with `npm run test:visual -- --update-snapshots` and look at them before committing.
import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/visual',
	snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: 'http://localhost:4329',
		// text drawn the same on every machine, whatever its fontconfig says: no hinting, grey
		// anti-aliasing instead of subpixel, and sRGB colours
		launchOptions: {
			args: ['--font-render-hinting=none', '--disable-lcd-text', '--disable-font-subpixel-positioning', '--force-color-profile=srgb'],
		},
	},
	expect: {
		// the fonts are bundled, so only anti-aliasing differs between machines
		toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
	},
	webServer: {
		command: 'npm run preview -w example/docs -- --port 4329',
		url: 'http://localhost:4329/starlight-theme/',
		reuseExistingServer: !process.env.CI,
	},
});
