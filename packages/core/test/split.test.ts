import { describe, expect, it } from 'vitest';
import { distributeImages, splitThread } from '../src/split.ts';
import { countGraphemes, measure, shortenUrl, toDisplayText } from '../src/text.ts';

const para = (n: number, word = 'word') => Array.from({ length: n }, () => word).join(' ') + '.';

describe('splitThread', () => {
  it('keeps short text as one post', () => {
    expect(splitThread('hello world')).toEqual([{ text: 'hello world', length: 11 }]);
  });

  it('returns nothing for blank input', () => {
    expect(splitThread('  \n\n ')).toEqual([]);
  });

  it('breaks between paragraphs before anything else', () => {
    const a = para(40); // ~200 graphemes
    const b = para(40);
    const segs = splitThread(`${a}\n\n${b}`);
    expect(segs.map((s) => s.text)).toEqual([a, b]);
  });

  it('packs small paragraphs together', () => {
    const segs = splitThread('One.\n\nTwo.\n\nThree.');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.text).toBe('One.\n\nTwo.\n\nThree.');
  });

  it('falls back to sentences inside a long paragraph', () => {
    const sentence = 'This sentence is exactly long enough to matter here. ';
    const text = sentence.repeat(12).trim();
    const segs = splitThread(text);
    expect(segs.length).toBeGreaterThan(1);
    for (const s of segs) {
      expect(s.length).toBeLessThanOrEqual(300);
      expect(s.text.endsWith('.')).toBe(true);
    }
  });

  it('never exceeds the limit and loses no words', () => {
    const text = Array.from({ length: 30 }, (_, i) => para(5 + ((i * 7) % 60), `w${i}`)).join('\n\n');
    const segs = splitThread(text);
    for (const s of segs) expect(s.length).toBeLessThanOrEqual(300);
    const words = (t: string) => t.split(/\s+/).filter(Boolean);
    expect(segs.flatMap((s) => words(s.text))).toEqual(words(text));
  });

  it('never splits inside a URL, mention or hashtag', () => {
    const url = 'https://example.com/some/really/long/path/that/goes/on?query=string&x=1';
    const text = Array.from({ length: 20 }, (_, i) => `Line ${i} with @alice.bsky.social and #atproto and ${url}`).join(
      ' ',
    );
    const segs = splitThread(text);
    for (const s of segs) {
      expect(s.length).toBeLessThanOrEqual(300);
      for (const m of s.text.matchAll(/https?:\/\/\S+/g)) expect(m[0]).toBe(url);
    }
  });

  it('counts links at their shortened display length', () => {
    const url = 'https://example.com/' + 'a'.repeat(400);
    const segs = splitThread(`Read this ${url}`);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.length).toBe(countGraphemes('Read this ') + 30);
  });

  it('hard-splits a single enormous word', () => {
    const segs = splitThread('x'.repeat(700));
    expect(segs.map((s) => s.length)).toEqual([300, 300, 100]);
  });

  it('counts graphemes, not code units', () => {
    const family = '👨‍👩‍👧‍👦';
    const text = Array.from({ length: 290 }, () => family).join('');
    expect(splitThread(text)).toHaveLength(1);
    expect(measure(text)).toBe(290);
  });

  describe('numbering', () => {
    it('does not number a single post', () => {
      expect(splitThread('short', { numbering: true })[0]!.text).toBe('short');
    });

    it('adds i/n suffixes within the limit', () => {
      const text = Array.from({ length: 5 }, () => para(50)).join('\n\n');
      const segs = splitThread(text, { numbering: true });
      segs.forEach((s, i) => {
        expect(s.text.endsWith(`\n\n${i + 1}/${segs.length}`)).toBe(true);
        expect(s.length).toBeLessThanOrEqual(300);
      });
    });

    it('stays within the limit when n reaches two digits', () => {
      const text = Array.from({ length: 12 }, () => para(56)).join('\n\n');
      const segs = splitThread(text, { numbering: true });
      expect(segs.length).toBeGreaterThanOrEqual(10);
      for (const s of segs) expect(s.length).toBeLessThanOrEqual(300);
      expect(segs.at(-1)!.text.endsWith(`${segs.length}/${segs.length}`)).toBe(true);
    });
  });
});

describe('distributeImages', () => {
  it('puts four per post in order', () => {
    expect(distributeImages(3, 6)).toEqual([[0, 1, 2, 3], [4, 5], []]);
  });
  it('adds image-only posts when needed', () => {
    expect(distributeImages(1, 9)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8]]);
  });
  it('handles no images', () => {
    expect(distributeImages(2, 0)).toEqual([[], []]);
  });
});

describe('links', () => {
  it('shortens long URLs for display', () => {
    expect(shortenUrl('https://www.example.com/')).toBe('example.com');
    expect(shortenUrl('https://example.com/' + 'a'.repeat(50))).toHaveLength(30);
  });
  it('tracks byte ranges of shortened links', () => {
    const { text, links } = toDisplayText('héllo https://example.com/path end');
    expect(text).toBe('héllo example.com/path end');
    const bytes = new TextEncoder().encode(text);
    expect(new TextDecoder().decode(bytes.slice(links[0]!.byteStart, links[0]!.byteEnd))).toBe('example.com/path');
  });
});
