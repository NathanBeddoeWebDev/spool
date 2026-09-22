import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ browser }) => ({
    name: 'Spool',
    description: 'Write posts, threads and articles for Bluesky without opening the feed.',
    permissions: ['storage', 'identity', 'activeTab', 'scripting', ...(browser === 'firefox' ? [] : ['sidePanel'])],
    action: { default_title: 'Write with Spool' },
    commands:
      browser === 'firefox'
        ? {
            _execute_sidebar_action: {
              suggested_key: { default: 'Alt+Shift+S' },
              description: 'Open the Spool composer',
            },
          }
        : {
            _execute_action: {
              suggested_key: { default: 'Alt+Shift+S', mac: 'Alt+Shift+S' },
              description: 'Open the Spool composer',
            },
          },
    // A fixed key keeps the extension ID (and so its OAuth redirect URI)
    // stable across machines. Generate one per the README.
    ...(process.env.SPOOL_EXTENSION_KEY ? { key: process.env.SPOOL_EXTENSION_KEY } : {}),
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko: { id: 'spool@example.com' } } } : {}),
  }),
});
