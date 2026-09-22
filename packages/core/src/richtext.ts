import { AtpAgent, RichText, type AppBskyRichtextFacet } from '@atproto/api';
import { toDisplayText } from './text.ts';

export const PUBLIC_APPVIEW = 'https://public.api.bsky.app';

let publicAgent: AtpAgent | undefined;

/**
 * Unauthenticated agent for public lookups (handle resolution, profiles).
 * Keeping these off the user's session means the OAuth grant only needs
 * write scopes.
 */
export function getPublicAgent(): AtpAgent {
  publicAgent ??= new AtpAgent({ service: PUBLIC_APPVIEW });
  return publicAgent;
}

export interface BuiltText {
  text: string;
  facets: AppBskyRichtextFacet.Main[] | undefined;
}

function overlaps(a: { byteStart: number; byteEnd: number }, b: { byteStart: number; byteEnd: number }) {
  return a.byteStart < b.byteEnd && b.byteStart < a.byteEnd;
}

/**
 * Turn a segment of plain text into post text + facets.
 *
 * Full URLs are shortened for display and given explicit link facets.
 * Mentions, hashtags and bare domains come from Bluesky's own detector.
 * Pass `resolve: false` to skip network handle resolution (tests, previews).
 */
export async function buildRichText(input: string, opts: { resolve?: boolean } = {}): Promise<BuiltText> {
  const display = toDisplayText(input);
  const rt = new RichText({ text: display.text });
  if (opts.resolve === false) rt.detectFacetsWithoutResolution();
  else await rt.detectFacets(getPublicAgent());

  const detected = (rt.facets ?? []).filter((facet) => {
    // Handles that didn't resolve come back with an empty DID; post them as plain text.
    const unresolved = facet.features.some(
      (f) => f.$type === 'app.bsky.richtext.facet#mention' && !(f as { did?: string }).did,
    );
    if (unresolved && opts.resolve !== false) return false;
    const isLink = facet.features.some((f) => f.$type === 'app.bsky.richtext.facet#link');
    // Our shortened links would be mis-detected as links to the truncated text.
    return !(isLink && display.links.some((l) => overlaps(l, facet.index)));
  });

  const links: AppBskyRichtextFacet.Main[] = display.links.map((l) => ({
    $type: 'app.bsky.richtext.facet',
    index: { byteStart: l.byteStart, byteEnd: l.byteEnd },
    features: [{ $type: 'app.bsky.richtext.facet#link', uri: l.uri }],
  }));

  const facets = [...detected, ...links].sort((a, b) => a.index.byteStart - b.index.byteStart);
  return { text: rt.text, facets: facets.length ? facets : undefined };
}
