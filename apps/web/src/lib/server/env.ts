import type { D1Database, R2Bucket } from '@cloudflare/workers-types';

/**
 * Worker bindings and variables. Server modules take this explicitly instead
 * of reading $env, because the cron handler (worker/index.ts) runs them
 * outside SvelteKit.
 */
export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  PUBLIC_APP_ORIGIN?: string;
  /** ES256 private JWK (with a kid) for the confidential OAuth client. Secret. */
  OAUTH_PRIVATE_KEY?: string;
}

/** Bindings exist on Cloudflare and under `vite dev`; fail clearly otherwise. */
export function requireEnv(platform: App.Platform | undefined): Env {
  const env = platform?.env;
  if (!env?.DB || !env.IMAGES) throw new Error('D1 (DB) and R2 (IMAGES) bindings are not configured');
  return env;
}
