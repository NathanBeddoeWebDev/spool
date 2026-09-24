import { OAuthResolverError } from '@atproto/oauth-client';
import { error, json } from '@sveltejs/kit';
import { OAUTH_SCOPE } from '@spool/core';
import { NO_STORE } from '$lib/server/api.ts';
import { requireEnv } from '$lib/server/env.ts';
import { getOAuthClient } from '$lib/server/oauth.ts';

/** Start signing in. Returns the authorization server URL to send the browser to. */
export async function POST({ request, platform, url }) {
  if (url.hostname === 'localhost') error(400, 'Open this page on 127.0.0.1 instead of localhost to sign in.');
  const { handle } = (await request.json().catch(() => ({}))) as { handle?: unknown };
  const input = typeof handle === 'string' ? handle.trim().replace(/^@/, '') : '';
  if (!input) error(400, 'Enter your handle');

  const client = await getOAuthClient(requireEnv(platform), url.origin);
  let redirect: URL;
  try {
    redirect = await client.authorize(input, { scope: OAUTH_SCOPE });
  } catch (err) {
    console.error(err);
    if (err instanceof OAuthResolverError) {
      error(400, `Couldn’t find a sign-in page for ${input}. Check the handle and try again.`);
    }
    error(502, `Your account’s server turned down the sign-in request. (${(err as Error).message})`);
  }
  return json({ url: redirect.href }, { headers: NO_STORE });
}
