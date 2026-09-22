import { describe, expect, it } from 'vitest';
import { articleParts, bskyPostUrl, defaultShareText, documentRecord, publicationRecord } from '../src/records.ts';
import { buildRichText } from '../src/richtext.ts';
import { markdownToText, renderMarkdown } from '../src/markdown.ts';
import { measure } from '../src/text.ts';

describe('articleParts', () => {
  it('lifts a leading heading into the title', () => {
    const p = articleParts('# My Title\n\nFirst para **bold**.\n\nSecond.', '');
    expect(p.title).toBe('My Title');
    expect(p.markdown).toBe('First para **bold**.\n\nSecond.');
    expect(p.textContent).toBe('First para bold.\n\nSecond.');
    expect(p.description).toBe('First para bold.');
  });

  it('prefers an explicit title and keeps the body intact', () => {
    const p = articleParts('# Heading\n\nBody', 'Explicit');
    expect(p.title).toBe('Explicit');
    expect(p.markdown).toBe('# Heading\n\nBody');
  });

  it('derives a title from the opening words', () => {
    expect(articleParts('Just some words here.', '').title).toBe('Just some words here.');
  });
});

describe('markdown', () => {
  it('strips formatting for textContent', () => {
    const md = '## H\n\n- a [link](https://x.com)\n- `code`\n\n> quote\n\n<b>html</b> text';
    expect(markdownToText(md)).toBe('H\n\na link\ncode\n\nquote\n\nhtml text');
  });

  it('escapes raw HTML and drops unsafe links when rendering', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://ok.com)');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://ok.com"');
  });
});

describe('records', () => {
  it('builds a standard.site document with markpub content', () => {
    const parts = articleParts('# T\n\nBody', '');
    const doc = documentRecord({
      site: 'at://did:plc:x/site.standard.publication/1',
      path: '/abc',
      parts,
      publishedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(doc).toMatchObject({
      $type: 'site.standard.document',
      title: 'T',
      path: '/abc',
      textContent: 'Body',
      content: { $type: 'at.markpub.markdown', text: { $type: 'at.markpub.text', markdown: 'Body' } },
    });
  });

  it('removes trailing slashes from publication urls', () => {
    expect(publicationRecord({ url: 'https://a.com/did:plc:x/', name: 'n' }).url).toBe('https://a.com/did:plc:x');
  });

  it('keeps the share text within one post', () => {
    const text = defaultShareText('A title', 'desc '.repeat(200));
    expect(measure(text)).toBeLessThanOrEqual(300);
    expect(text.startsWith('A title\n\n')).toBe(true);
  });

  it('maps post URIs to bsky.app', () => {
    expect(bskyPostUrl('at://did:plc:abc/app.bsky.feed.post/3k')).toBe('https://bsky.app/profile/did:plc:abc/post/3k');
  });
});

describe('buildRichText', () => {
  it('shortens links with facets pointing at the full URL', async () => {
    const url = 'https://example.com/' + 'p'.repeat(60);
    const rt = await buildRichText(`see ${url} #tag`, { resolve: false });
    expect(rt.text.startsWith('see example.com/ppp')).toBe(true);
    const link = rt.facets!.find((f) => f.features[0]!.$type === 'app.bsky.richtext.facet#link');
    expect((link!.features[0] as { uri: string }).uri).toBe(url);
    expect(rt.facets!.some((f) => f.features[0]!.$type === 'app.bsky.richtext.facet#tag')).toBe(true);
    expect(rt.facets).toHaveLength(2);
  });
});
