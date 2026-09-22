import type { RichText as RichTextClass } from '@atproto/api';
import { toDisplayText } from '@spool/core';

export interface PreviewPart {
  text: string;
  kind: 'text' | 'link' | 'mention' | 'tag';
}

// @atproto/api is large, so it stays out of the bundle that has to load before
// the user can type. Previews render as plain text until it arrives.
let RichText = $state.raw<typeof RichTextClass>();
let loading: Promise<unknown> | undefined;

function loadRichText() {
  loading ??= import('@atproto/api').then(
    (m) => (RichText = m.RichText),
    () => (loading = undefined),
  );
}

/** Split post text into styled runs, with links shortened as they'll appear. */
export function previewParts(text: string): PreviewPart[] {
  const display = toDisplayText(text);
  if (!RichText) {
    loadRichText();
    return [{ text: display.text, kind: 'text' }];
  }
  const rt = new RichText({ text: display.text });
  rt.detectFacetsWithoutResolution();
  const parts: PreviewPart[] = [];
  for (const seg of rt.segments()) {
    const kind = seg.isMention() ? 'mention' : seg.isTag() ? 'tag' : seg.isLink() ? 'link' : 'text';
    parts.push({ text: seg.text, kind });
  }
  return parts;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** Object URLs for image blobs, cached per blob so previews don't flicker. */
const urls = new WeakMap<Blob, string>();
export function blobUrl(blob: Blob): string {
  let url = urls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(blob, url);
  }
  return url;
}
