// Brings in the adapter's Platform fields (ctx, caches, cf).
import type {} from '@sveltejs/adapter-cloudflare';
import type { Env } from '$lib/server/env.ts';

declare global {
  namespace App {
    interface Platform {
      env: Env;
    }
    interface Locals {
      /** The signed-in account, from the session cookie. */
      did: string | null;
    }
  }
}
export {};
