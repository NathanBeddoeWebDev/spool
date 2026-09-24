import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      config: 'svelte.wrangler.jsonc',
      // Bindings for `vite dev` come from the real Worker config.
      platformProxy: { configPath: 'wrangler.jsonc' },
    }),
  },
};
