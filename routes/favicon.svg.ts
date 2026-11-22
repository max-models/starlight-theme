// `<base>/favicon.svg`: the max-models icon, the wave of the logo in the teal of the palette. The theme plugin
// serves it when the site has no public/favicon.svg and sets no `favicon` of its own.
import type { APIRoute } from 'astro';

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<path d="M3 17.5c3.2-8.5 6.4-8.5 9.6 0s6.4 8.5 9.6 0 4.27-5.67 6.4-4.25" fill="none" stroke="#087f7b" stroke-width="3.5" stroke-linecap="round"/>
</svg>
`;

export const GET: APIRoute = () => new Response(icon, { headers: { 'content-type': 'image/svg+xml' } });
