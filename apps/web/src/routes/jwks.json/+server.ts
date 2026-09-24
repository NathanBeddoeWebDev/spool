import { json } from '@sveltejs/kit';
import { requireEnv } from '$lib/server/env.ts';
import { OAUTH_DOCUMENT_HEADERS, getKeyset } from '$lib/server/oauth.ts';

/** Public keys the authorization server checks our signed token requests against. */
export async function GET({ platform }) {
  const keyset = await getKeyset(requireEnv(platform));
  return json(keyset.publicJwks, { headers: OAUTH_DOCUMENT_HEADERS });
}
