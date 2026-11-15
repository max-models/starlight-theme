// Heatmaps that do not flash while an animation plays.
//
// plotly.js draws a heatmap as an SVG <image> holding a PNG data URL. An animation frame that
// redraws (`redraw: true`, which a heatmap needs) builds the heatmap's layer anew, with a new
// <image>, and a browser shows nothing until it has decoded the new picture: for an instant the
// page shows through, and the figure flashes between the heatmap's colours and the page's
// background (light or dark) on every frame. Here a copy of the last picture that was painted
// stays underneath the layer, so the gap shows the previous frame instead of the page.

const BACKDROP = 'steady-backdrop';

/** The heatmap pictures of a plot, without the copies in the backdrops. */
function heatmapImages(plot: Element): SVGImageElement[] {
	return [...plot.querySelectorAll<SVGImageElement>('g.hm > image')].filter((image) => !image.closest(`.${BACKDROP}`));
}

function hrefOf(image: Element): string {
	return image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
}

/** The layer of a heatmap picture that plotly.js builds anew: its `g.heatmaplayer`. */
function layerOf(image: Element): Element | null {
	return image.closest('g.heatmaplayer') ?? image.parentElement?.parentElement ?? null;
}

/** Resolves once the picture of a URL is decoded (also if it cannot be). */
function decoded(url: string): Promise<void> {
	const picture = new Image();
	picture.src = url;
	return picture.decode().catch(() => undefined);
}

/** Two animation frames: what was decoded has then been painted. */
function painted(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** A copy of a layer that plotly.js does not recognise: without classes and ids. */
function inertCopy(layer: Element): Element {
	const copy = layer.cloneNode(true) as Element;
	for (const element of [copy, ...copy.querySelectorAll('*')]) {
		element.removeAttribute('class');
		element.removeAttribute('id');
	}
	copy.setAttribute('class', BACKDROP);
	copy.setAttribute('aria-hidden', 'true');
	copy.setAttribute('pointer-events', 'none');
	return copy;
}

/**
 * Keep the heatmaps of a plot steady while an animation redraws them.
 *
 * Below each heatmap layer sits a copy of it as it was last painted (plotly.js keeps elements it
 * did not make where they are). After every redraw the copy is moved back below the new layer,
 * and replaced by a copy of the new layer once its pictures are decoded and painted; a redraw
 * that comes sooner keeps the older copy for the time being.
 *
 * @returns A function that stops watching the plot.
 */
export function steadyHeatmaps(plot: Element): () => void {
	let scheduled = false;
	let cleanup: ReturnType<typeof setTimeout> | undefined;

	/** Copy a layer into its backdrop once its pictures are decoded and painted. */
	function remember(layer: Element) {
		const hrefs = [...layer.querySelectorAll('g.hm > image')].map(hrefOf);
		Promise.all(hrefs.map(decoded))
			.then(painted)
			.then(() => {
				// a newer layer has replaced this one: its own copy follows
				if (!layer.isConnected) return;
				const previous = layer.previousElementSibling;
				const copy = inertCopy(layer);
				if (previous?.classList.contains(BACKDROP)) previous.replaceWith(copy);
				else layer.before(copy);
			});
	}

	function update() {
		scheduled = false;
		const layers = new Set(heatmapImages(plot).map(layerOf).filter((layer): layer is Element => !!layer?.parentElement));
		// a backdrop goes below the new layer that replaced its own; while a redraw has removed the
		// old layer and not yet added the new one, it stays where it is
		let orphans = false;
		for (const backdrop of plot.querySelectorAll(`.${BACKDROP}`)) {
			if (layers.has(backdrop.nextElementSibling!)) continue;
			const layer = [...layers].find((candidate) => candidate.parentElement === backdrop.parentElement);
			if (layer) layer.before(backdrop);
			else orphans = true;
		}
		// a heatmap that stays gone (a hidden trace, a figure without heatmaps) takes its backdrop along
		clearTimeout(cleanup);
		if (orphans) {
			cleanup = setTimeout(() => {
				for (const backdrop of plot.querySelectorAll(`.${BACKDROP}`)) {
					if (!backdrop.nextElementSibling?.querySelector('g.hm > image')) backdrop.remove();
				}
			}, 1000);
		}
		for (const layer of layers) remember(layer);
	}

	const observer = new MutationObserver((mutations) => {
		// only the redraws of heatmaps by plotly.js: not hover labels, not the changes made here
		const ours = (node: Node) => !!(node as Element).closest?.(`.${BACKDROP}`);
		const heatmap = (node: Node) =>
			node instanceof Element && !ours(node) && (!!node.closest('g.hm') || node.matches('g.heatmaplayer') || !!node.querySelector('g.hm'));
		const relevant = mutations.some(
			(mutation) => heatmap(mutation.target) || [...mutation.addedNodes, ...mutation.removedNodes].some(heatmap)
		);
		if (relevant && !scheduled) {
			scheduled = true;
			queueMicrotask(update);
		}
	});
	observer.observe(plot, { childList: true, subtree: true });
	update();
	return () => observer.disconnect();
}
