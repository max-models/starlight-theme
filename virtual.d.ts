// Ambient types for the virtual module registered by lib/plugin.ts.
declare module 'virtual:starlight-theme/config' {
	const config: import('./lib/plugin.ts').ThemeConfig;
	export default config;
}

declare module 'virtual:starlight-theme/methodcards' {
	const config: import('./lib/methodcard.ts').MethodcardConfig;
	export default config;
}
