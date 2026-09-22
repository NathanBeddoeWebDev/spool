import { POST_GRAPHEME_LIMIT, countGraphemes, graphemes, measure, sentences } from './text.ts';

export interface SplitOptions {
  /** Grapheme limit per post. Defaults to Bluesky's 300. */
  limit?: number;
  /** Append "1/n" markers to every post. */
  numbering?: boolean;
}

export interface Segment {
  text: string;
  /** Graphemes as posted (links shortened, numbering included). */
  length: number;
}

/**
 * Break points from most to least natural. Each level only runs on a unit
 * that didn't fit at the level above, so a thread breaks between paragraphs
 * whenever it can, then between lines, sentences, and words. Splitting only
 * ever happens on whitespace, so links, mentions and hashtags stay intact.
 */
const LEVELS: Array<{ split: (text: string) => string[]; joiner: string }> = [
  { split: (t) => t.split(/\n{2,}/), joiner: '\n\n' },
  { split: (t) => t.split('\n'), joiner: '\n' },
  { split: sentenceUnits, joiner: ' ' },
  { split: (t) => t.split(/\s+/), joiner: ' ' },
];

/**
 * Sentence segmentation, but only at breaks followed by whitespace.
 * Intl.Segmenter happily breaks after the "?" in "example.com/a?b=1".
 */
function sentenceUnits(text: string): string[] {
  const out: string[] = [];
  let pending = '';
  for (const s of sentences(text)) {
    pending += s;
    if (/\s$/.test(s)) {
      out.push(pending);
      pending = '';
    }
  }
  if (pending) out.push(pending);
  return out;
}

function clean(parts: string[]): string[] {
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Last resort for a single "word" longer than a whole post. */
function hardSplit(text: string, budget: number): string[] {
  const g = graphemes(text);
  const out: string[] = [];
  for (let i = 0; i < g.length; i += budget) out.push(g.slice(i, i + budget).join(''));
  return out;
}

function splitAtLevel(text: string, level: number, budget: number): string[] {
  if (measure(text) <= budget) return [text];
  const rule = LEVELS[level];
  if (!rule) return hardSplit(text, budget);

  const parts = clean(rule.split(text));
  if (parts.length <= 1) return splitAtLevel(parts[0] ?? text, level + 1, budget);

  const joinerLength = countGraphemes(rule.joiner);
  const out: string[] = [];
  let current = '';
  let currentLength = 0;

  const flush = () => {
    if (current) out.push(current);
    current = '';
    currentLength = 0;
  };

  for (const part of parts) {
    const partLength = measure(part);

    if (partLength > budget) {
      flush();
      const pieces = splitAtLevel(part, level + 1, budget);
      out.push(...pieces.slice(0, -1));
      current = pieces.at(-1) ?? '';
      currentLength = measure(current);
      continue;
    }

    // Links, mentions and joiners are whitespace-delimited, so lengths add up.
    const combined = current ? currentLength + joinerLength + partLength : partLength;
    if (combined <= budget) {
      current = current ? current + rule.joiner + part : part;
      currentLength = combined;
    } else {
      flush();
      current = part;
      currentLength = partLength;
    }
  }
  flush();
  return out;
}

function numberSuffix(i: number, n: number): string {
  return `\n\n${i}/${n}`;
}

/** Collapse runs of blank lines and trailing spaces; keep paragraph structure. */
export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split text into posts that each fit the grapheme limit.
 *
 * With numbering on, the "i/n" suffix length depends on n, which depends on
 * the split. Suffix length only changes when n gains a digit, so we retry with
 * a wider suffix until the digit count is stable.
 */
export function splitThread(input: string, options: SplitOptions = {}): Segment[] {
  const limit = options.limit ?? POST_GRAPHEME_LIMIT;
  const text = normalize(input);
  if (!text) return [];

  if (!options.numbering) {
    return splitAtLevel(text, 0, limit).map((t) => ({ text: t, length: measure(t) }));
  }

  if (measure(text) <= limit) return [{ text, length: measure(text) }];

  let digits = 1;
  for (;;) {
    const widest = 10 ** digits - 1;
    const budget = limit - countGraphemes(numberSuffix(widest, widest));
    const pieces = splitAtLevel(text, 0, budget);
    if (String(pieces.length).length <= digits) {
      return pieces.map((t, i) => {
        const full = t + numberSuffix(i + 1, pieces.length);
        return { text: full, length: measure(full) };
      });
    }
    digits++;
  }
}

/** Bluesky allows four images per post. */
export const MAX_IMAGES_PER_POST = 4;

/**
 * Assign images to thread posts in order, four per post. When there are more
 * image groups than posts, extra image-only posts are appended so nothing is
 * dropped. Returns, for each post, the indices of its images.
 */
export function distributeImages(segmentCount: number, imageCount: number): number[][] {
  const groups: number[][] = [];
  for (let i = 0; i < imageCount; i += MAX_IMAGES_PER_POST) {
    groups.push(Array.from({ length: Math.min(MAX_IMAGES_PER_POST, imageCount - i) }, (_, k) => i + k));
  }
  const posts = Math.max(segmentCount, groups.length);
  return Array.from({ length: posts }, (_, i) => groups[i] ?? []);
}
