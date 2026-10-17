// `<base>/favicon.svg`: the max-models icon, a wave on the teal of the palette. The theme plugin
// serves it when the site has no public/favicon.svg and sets no `favicon` of its own.
import type { APIRoute } from 'astro';

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="#087f7b"/>
<path d="M5 17.5c2.75-7 5.5-7 8.25 0s5.5 7 8.25 0 3.67-4.67 5.5-3.5" fill="none" stroke="#f5f2e8" stroke-width="3" stroke-linecap="round"/>
</svg>
`;

export const GET: APIRoute = () => new Response(icon, { headers: { 'content-type': 'image/svg+xml' } });
