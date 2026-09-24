import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, readWebSession } from '$lib/server/auth.ts';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get(SESSION_COOKIE);
  // Only signed-in browsers carry the cookie, so readers of articles never touch the database.
  event.locals.did = token && event.platform?.env?.DB ? await readWebSession(event.platform.env, token) : null;
  const response = await resolve(event);
  // Pages without their own caching rules are revalidated, so a deploy reaches browsers right away.
  if (!response.headers.has('cache-control') && response.headers.get('content-type')?.startsWith('text/html')) {
    response.headers.set('cache-control', 'no-cache');
  }
  return response;
};
