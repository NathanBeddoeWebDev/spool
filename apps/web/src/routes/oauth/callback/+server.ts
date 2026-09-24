import { redirect } from '@sveltejs/kit';
import { startWebSession } from '$lib/server/auth.ts';
import { requireEnv } from '$lib/server/env.ts';
import { getOAuthClient } from '$lib/server/oauth.ts';

/** Where the authorization server sends the browser back to. */
export async function GET({ url, platform, cookies }) {
  const env = requireEnv(platform);
  let target = '/';
  try {
    const client = await getOAuthClient(env, url.origin);
    const { session } = await client.callback(url.searchParams);
    await startWebSession(env, cookies, session.sub, url.protocol === 'https:');
  } catch (err) {
    console.error(err);
    const message =
      url.searchParams.get('error') === 'access_denied'
        ? 'Sign-in was cancelled.'
        : 'Sign-in didn’t finish. Please try again.';
    target = `/?signin_error=${encodeURIComponent(message)}`;
  }
  redirect(303, target);
}
