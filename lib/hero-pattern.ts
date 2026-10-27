// The header picture of the home pages: streamlines of the flow past a cylinder, drawn as SVG paths.
// The cylinder's place and size come from a seed (the site title), so every site gets its own
// picture in the same style.

export interface HeroPattern {
	width: number;
	height: number;
	/** The cylinder. */
	circle: { cx: number; cy: number; r: number };
	/** One path per streamline, with its opacity (fainter away from the cylinder). */
	lines: { d: string; opacity: number }[];
	/** Small dots on the streamlines, like tracer particles. */
	dots: { cx: number; cy: number }[];
}

/** A deterministic random generator in [0, 1) from a string (FNV-1a hash, then mulberry32). */
export function seededRandom(seed: string): () => number {
	let state = 2166136261;
	for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The height above the axis of the streamline psi = c (c > 0) of the potential flow past a cylinder
 * of radius r, psi = y (1 - r^2 / (x^2 + y^2)), at x (relative to the centre).
 */
export function streamlineY(x: number, c: number, r: number): number {
	const psi = (y: number) => y * (1 - (r * r) / (x * x + y * y));
	let lo = Math.sqrt(Math.max(r * r - x * x, 0));
	let hi = c + r;
	for (let i = 0; i < 50; i++) {
		const mid = (lo + hi) / 2;
		if (psi(mid) < c) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

const round = (value: number) => Math.round(value * 10) / 10;

export function heroPattern(seed: string, width = 1200, height = 480): HeroPattern {
	const random = seededRandom(seed);
	const r = height * (0.13 + 0.06 * random());
	const cx = width * (0.66 + 0.12 * random());
	const cy = height * (0.42 + 0.16 * random());
	const spacing = height / 15;
	const lines: HeroPattern['lines'] = [];
	const dots: HeroPattern['dots'] = [];
	for (const side of [1, -1]) {
		for (let c = spacing / 2; c < height * 1.1; c += spacing) {
			const points: string[] = [];
			for (let x = -20; x <= width + 20; x += 15) {
				points.push(`${round(x)},${round(cy - side * streamlineY(x - cx, c, r))}`);
			}
			lines.push({ d: `M${points.join('L')}`, opacity: round(Math.max(0.15, 1 - c / (height * 0.6))) });
			if (random() < 0.35) {
				const x = cx + (random() - 0.6) * width * 0.5;
				dots.push({ cx: round(x), cy: round(cy - side * streamlineY(x - cx, c, r)) });
			}
		}
	}
	return { width, height, circle: { cx: round(cx), cy: round(cy), r: round(r) }, lines, dots };
}
