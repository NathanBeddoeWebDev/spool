/**
 * Text measurement helpers.
 *
 * Bluesky limits posts to 300 graphemes (what a person perceives as a
 * character), while facets index UTF-8 bytes. Keep both concepts explicit.
 */

export const POST_GRAPHEME_LIMIT = 300;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
const encoder = new TextEncoder();

export function countGraphemes(text: string): number {
  let n = 0;
  for (const _ of graphemeSegmenter.segment(text)) n++;
  return n;
}

export function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
}

export function sentences(text: string): string[] {
  return Array.from(sentenceSegmenter.segment(text), (s) => s.segment);
}

export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength;
}

/** Cut to at most `max` graphemes, adding an ellipsis when truncated. */
export function truncateGraphemes(text: string, max: number, ellipsis = '…'): string {
  const g = graphemes(text);
  if (g.length <= max) return text;
  const room = Math.max(0, max - countGraphemes(ellipsis));
  return g.slice(0, room).join('').trimEnd() + ellipsis;
}

/**
 * Matches http(s) links. Deliberately conservative: bare domains are left to
 * Bluesky's own facet detection so we never shorten something that isn't a link.
 */
export const URL_RE = /https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}]/g;

/** Display form of a URL, the way Bluesky's composer shortens it. */
export function shortenUrl(url: string, max = 30): string {
  let display = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (display.endsWith('/')) display = display.slice(0, -1);
  if (display.length <= max) return display;
  return display.slice(0, max - 3) + '...';
}

export interface DisplayLink {
  /** Byte offsets into the display text. */
  byteStart: number;
  byteEnd: number;
  uri: string;
}

/**
 * Replace full URLs with their shortened display form, returning the byte
 * ranges so link facets can point at the full URI.
 */
export function toDisplayText(text: string): { text: string; links: DisplayLink[] } {
  const links: DisplayLink[] = [];
  let out = '';
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const uri = match[0];
    const index = match.index ?? 0;
    out += text.slice(last, index);
    const display = shortenUrl(uri);
    const byteStart = utf8Length(out);
    out += display;
    links.push({ byteStart, byteEnd: byteStart + utf8Length(display), uri });
    last = index + uri.length;
  }
  out += text.slice(last);
  return { text: out, links };
}

/** Graphemes a piece of text will occupy once posted (links shortened). */
export function measure(text: string): number {
  return countGraphemes(toDisplayText(text).text);
}
