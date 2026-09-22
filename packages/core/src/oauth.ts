/**
 * Granular OAuth scopes shared by the web app and the extension: write posts,
 * write standard.site records, upload images. Nothing else. Everything we
 * read (profiles, handles, records) comes from public endpoints.
 *
 * If a PDS you target doesn't support granular scopes yet, swap this for
 * 'atproto transition:generic'.
 */
export const OAUTH_SCOPE = [
  'atproto',
  'repo:app.bsky.feed.post?action=create',
  'repo:site.standard.document',
  'repo:site.standard.publication',
  'blob:image/*',
].join(' ');

/** Entryway used to resolve handles during sign-in. */
export const HANDLE_RESOLVER = 'https://bsky.social';
