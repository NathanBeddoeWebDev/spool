import { json } from '@sveltejs/kit';
import { clientMetadata } from '$lib/scope.ts';

/** OAuth client metadata for the web app. Its URL is the client_id. */
export function GET({ url }) {
  return json(
    clientMetadata({
      clientId: `${url.origin}/client-metadata.json`,
      clientName: 'Spool',
      clientUri: url.origin,
      redirectUris: [`${url.origin}/`],
    }),
    { headers: { 'cache-control': 'public, max-age=600' } },
  );
}
