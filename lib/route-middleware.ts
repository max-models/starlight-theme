// Starlight route middleware of the dev build (added by the theme plugin with `versions`): moves the
// hero and prev/next links of the frontmatter from /<repo>/ into /<repo>/dev/, see rebase.ts.
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import theme from 'virtual:starlight-theme/config';
import { rebase, rebaseFrontmatter } from './rebase.ts';

export const onRequest = defineRouteMiddleware((context) => {
	const versions = theme.versions;
	if (versions?.current !== 'dev') return;
	const route = context.locals.starlightRoute;
	rebaseFrontmatter(route.entry.data as Record<string, any>, versions.stable, versions.dev);
	for (const link of [route.pagination.prev, route.pagination.next]) {
		if (link) link.href = rebase(link.href, versions.stable, versions.dev);
	}
});
