// The share image of a site for link previews (og:image): the streamlines of the home page with the
// site title and description, 1200 x 630 in the dark palette. routes/og.png.ts renders it to PNG.
import { heroPattern } from './hero-pattern.ts';

const WIDTH = 1200;
const HEIGHT = 630;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lines of at most `width` characters, at most `count` of them (the last one cut with an ellipsis). */
function wrap(text: string, width: number, count: number): string[] {
	const lines: string[] = [];
	for (const word of text.split(/\s+/).filter(Boolean)) {
		const last = lines.at(-1);
		if (last !== undefined && last.length + word.length + 1 <= width) lines[lines.length - 1] = `${last} ${word}`;
		else lines.push(word);
	}
	if (lines.length > count) {
		lines.length = count;
		lines[count - 1] = `${lines[count - 1].replace(/[\s,.;:]*$/, '')}…`;
	}
	return lines;
}

/** The share image as SVG: `url` is shown at the bottom, e.g. "max-models.github.io/simgeometry". */
export function shareImageSvg(title: string, description: string, url: string): string {
	const pattern = heroPattern(title, WIDTH, HEIGHT);
	const font = "font-family=\"Inter, 'Helvetica Neue', 'DejaVu Sans', Arial, sans-serif\"";
	const titleSize = title.length > 18 ? 72 : 96;
	const lines = wrap(description, 44, 3);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
<defs>
<radialGradient id="glow" cx="0.75" cy="0.5" r="0.6"><stop offset="0" stop-color="#0d3a38"/><stop offset="1" stop-color="#07131d"/></radialGradient>
<linearGradient id="fade" x1="0" x2="1"><stop offset="0.1" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.6" stop-color="#fff"/></linearGradient>
<mask id="mask"><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade)"/></mask>
</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
<g mask="url(#mask)" fill="none" stroke="#63eee6" stroke-width="2">
${pattern.lines.map((line) => `<path d="${line.d}" stroke-opacity="${line.opacity}"/>`).join('\n')}
<circle cx="${pattern.circle.cx}" cy="${pattern.circle.cy}" r="${pattern.circle.r}" fill="#07131d" stroke-width="3"/>
</g>
<g transform="translate(80 92)"><rect width="56" height="56" rx="12" fill="#63eee6"/><path d="M8.75 30.6c4.8-12.25 9.6-12.25 14.4 0s9.6 12.25 14.4 0 6.4-8.2 9.6-6.1" fill="none" stroke="#07131d" stroke-width="5.25" stroke-linecap="round"/></g>
<text x="80" y="${HEIGHT / 2 - 10}" ${font} font-size="${titleSize}" font-weight="700" fill="#eeeadd">${escape(title)}</text>
${lines.map((line, index) => `<text x="80" y="${HEIGHT / 2 + 60 + index * 44}" ${font} font-size="34" fill="#a9b7bb">${escape(line)}</text>`).join('\n')}
<text x="80" y="${HEIGHT - 60}" ${font} font-size="26" fill="#63eee6">${escape(url)}</text>
</svg>`;
}
