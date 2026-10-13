// The content collections of a Starlight site. In the site: src/content.config.ts with
//     export { collections } from '@max-models/starlight-theme/content';
import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
