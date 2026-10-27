// `<base>/og.png`: the share image of the site (lib/share-image.ts), rendered with sharp, which every
// site has for Astro's images. The theme plugin adds the page and its og:image meta tags.
import type { APIRoute } from 'astro';
import theme from 'virtual:starlight-theme/config';
import { shareImageSvg } from '../lib/share-image.ts';

export const GET: APIRoute = async () => {
	const { default: sharp } = await import('sharp');
	const url = `${theme.family.href.replace(/^https:\/\//, '')}${theme.repository.split('/')[1] ?? ''}`;
	const svg = shareImageSvg(theme.site.title, theme.site.description, url);
	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
