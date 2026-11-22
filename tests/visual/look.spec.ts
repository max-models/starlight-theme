// The look of the example site: the home page, a docs page and the gallery, in both colour schemes
// and on a phone. The release line is removed (it comes from GitHub at build time, when GitHub
// answers) and the hero's tracer dots are stopped at their start.
import { expect, test, type Page } from '@playwright/test';

const pages = [
	{ name: 'home', path: '/starlight-theme/' },
	{ name: 'installation', path: '/starlight-theme/getting-started/installation/' },
	{ name: 'gallery', path: '/starlight-theme/examples/' },
];

async function open(page: Page, path: string, scheme: 'light' | 'dark') {
	await page.addInitScript((value) => localStorage.setItem('starlight-theme', value), scheme);
	await page.goto(path);
	await page.evaluate(async () => {
		await document.fonts.ready;
		document.querySelector('.hero .release')?.remove();
		const svg = document.querySelector<SVGSVGElement>('.hero .backdrop svg');
		svg?.pauseAnimations();
		svg?.setCurrentTime(0);
	});
}

for (const scheme of ['light', 'dark'] as const) {
	for (const { name, path } of pages) {
		test(`${name}, ${scheme}`, async ({ page }) => {
			await page.setViewportSize({ width: 1280, height: 900 });
			await open(page, path, scheme);
			await expect(page).toHaveScreenshot(`${name}-${scheme}.png`);
		});
	}
}

test('installation, phone', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await open(page, '/starlight-theme/getting-started/installation/', 'light');
	await expect(page).toHaveScreenshot('installation-phone.png');
});
