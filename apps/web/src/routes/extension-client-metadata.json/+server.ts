import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { clientMetadata } from '$lib/scope.ts';

/**
 * OAuth client metadata for the browser extension. The extension can't host
 * its own metadata, so the web app does, listing the extension's identity
 * redirect URIs (https://<id>.chromiumapp.org/ on Chrome).
 */
export function GET({ url }) {
  const redirectUris = (env.PUBLIC_EXTENSION_REDIRECT_URIS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!redirectUris.length) error(404, 'Extension sign-in is not configured');
  return json(
    clientMetadata({
      clientId: `${url.origin}/extension-client-metadata.json`,
      clientName: 'Spool for your browser',
      clientUri: url.origin,
      redirectUris,
    }),
    { headers: { 'cache-control': 'public, max-age=600' } },
  );
}
