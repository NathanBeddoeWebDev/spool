import { error, json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { requireEnv } from '$lib/server/env.ts';
import { cleanUp, publishDue } from '$lib/server/scheduler.ts';

/**
 * Development only: `vite dev` has no cron trigger, so this runs the
 * scheduler once. The Composer's scheduled list calls it while it's open.
 */
export async function POST({ platform, url }) {
  if (!dev) error(404);
  const env = requireEnv(platform);
  await publishDue(env, { appOrigin: (publicEnv.PUBLIC_APP_ORIGIN || url.origin).replace(/\/+$/, '') });
  await cleanUp(env);
  return json({ ok: true });
}
