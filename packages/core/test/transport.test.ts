import { describe, expect, it } from 'vitest';
import { draftFromFormData, draftToFormData } from '../src/transport.ts';
import { newDraft } from '../src/types.ts';

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

describe('draft transport', () => {
  it('round-trips a draft with images', async () => {
    const draft = newDraft({
      text: 'Hello',
      title: 'T',
      mode: 'article',
      langs: ['en'],
      images: [{ id: 'a', blob: png(), alt: 'a cat', width: 10, height: 20 }],
    });
    const back = draftFromFormData(draftToFormData(draft, { kind: 'article' }));
    expect(back).toMatchObject({ id: draft.id, text: 'Hello', title: 'T', mode: 'article', langs: ['en'] });
    expect(back.images).toHaveLength(1);
    expect(back.images[0]).toMatchObject({ id: 'a', alt: 'a cat', width: 10, height: 20 });
    expect(await back.images[0]!.blob.arrayBuffer()).toEqual(await png().arrayBuffer());
  });

  it('rejects missing and oversized images', () => {
    const form = draftToFormData(newDraft({ text: 'x' }));
    form.set('draft', JSON.stringify({ text: 'x', images: [{ id: 'a' }] }));
    expect(() => draftFromFormData(form)).toThrow('Missing image');
    form.set('image0', new Blob([new Uint8Array(1_000_001)], { type: 'image/jpeg' }));
    expect(() => draftFromFormData(form)).toThrow('over 1 MB');
  });

  it('drops malformed thread progress instead of trusting it', () => {
    const form = draftToFormData(newDraft({ text: 'x' }));
    form.set('draft', JSON.stringify({ text: 'x', threadProgress: { texts: ['a'], rkeys: [], created: [] } }));
    expect(draftFromFormData(form).threadProgress).toBeUndefined();
  });
});
