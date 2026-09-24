import { error, json } from '@sveltejs/kit';
import { OAUTH_DOCUMENT_HEADERS, isLoopback, webClientMetadata } from '$lib/server/oauth.ts';

/** OAuth client metadata for the web app. Its URL is the client_id. */
export function GET({ url }) {
  // Local development signs in as a loopback client, which has no hosted metadata.
  if (isLoopback(url.origin)) error(404, 'Not used in local development');
  return json(webClientMetadata(url.origin), { headers: OAUTH_DOCUMENT_HEADERS });
}
