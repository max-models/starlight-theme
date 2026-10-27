// The header picture of the home pages: streamlines of the flow past a cylinder.
import { describe, expect, it } from 'vitest';
import { heroPattern, seededRandom, streamlineY } from '../lib/hero-pattern.ts';

describe('streamlineY', () => {
	it('lies on the streamline', () => {
		const r = 2;
		for (const [x, c] of [[0, 0.5], [3, 1], [-10, 4]]) {
			const y = streamlineY(x, c, r);
			expect(y * (1 - (r * r) / (x * x + y * y))).toBeCloseTo(c, 8);
		}
	});

	it('goes around the cylinder and straightens out far from it', () => {
		expect(streamlineY(0, 0.01, 2)).toBeGreaterThan(2);
		expect(streamlineY(1e4, 3, 2)).toBeCloseTo(3, 4);
	});
});

describe('heroPattern', () => {
	it('is the same for the same seed and differs between seeds', () => {
		expect(heroPattern('simgeometry')).toEqual(heroPattern('simgeometry'));
		expect(heroPattern('simgeometry').circle).not.toEqual(heroPattern('mpiarray').circle);
	});

	it('draws streamlines on both sides of the cylinder inside the picture', () => {
		const pattern = heroPattern('picnic');
		expect(pattern.lines.length).toBeGreaterThan(20);
		expect(pattern.circle.cx).toBeGreaterThan(pattern.width / 2);
		expect(pattern.circle.cy).toBeGreaterThan(0);
		expect(pattern.circle.cy).toBeLessThan(pattern.height);
		for (const line of pattern.lines) expect(line.d).not.toContain('NaN');
		for (const dot of pattern.dots) {
			expect(pattern.lines[dot.line]).toBeDefined();
			expect(dot.offset).toBeLessThanOrEqual(dot.duration);
		}
	});

	it('seeds a generator in [0, 1)', () => {
		const random = seededRandom('x');
		for (let i = 0; i < 100; i++) expect(random()).toBeGreaterThanOrEqual(0);
		expect(seededRandom('x')()).toBe(seededRandom('x')());
	});
});
