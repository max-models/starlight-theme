// The content collections of a Starlight site. In the site: src/content.config.ts with
//     export { collections } from '@max-models/starlight-theme/content';
// Starlight's frontmatter, plus `heroBackground`: the header picture of a page with a hero (see
// components/Hero.astro), an image, `{ dark, light }` images, or `false` for none.
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro/zod';

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: ({ image }) =>
				z.object({
					heroBackground: z.union([image(), z.object({ dark: image(), light: image() }), z.literal(false)]).optional(),
				}),
		}),
	}),
};
