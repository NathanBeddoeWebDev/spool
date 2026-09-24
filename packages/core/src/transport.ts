import { newDraft, type Draft, type DraftImage, type PublishKind, type ThreadProgress } from './types.ts';

/** Largest draft the server accepts. Articles are the long ones. */
export const MAX_DRAFT_CHARS = 200_000;
export const MAX_DRAFT_IMAGES = 40;
/** Images are re-encoded under 1 MB before they're added (see prepareImage). */
export const MAX_IMAGE_BYTES = 1_000_000;

/** The draft couldn't be read, or breaks a limit. Safe to show the writer. */
export class InvalidDraftError extends Error {}

const KINDS: readonly PublishKind[] = ['post', 'thread', 'article'];

export function isPublishKind(value: unknown): value is PublishKind {
  return KINDS.includes(value as PublishKind);
}

export type DraftWithoutBlobs = Omit<Draft, 'images'> & { images: Array<Omit<DraftImage, 'blob'>> };

/** A draft that serialises as JSON: images keep their metadata, and their bytes go elsewhere. */
export function withoutBlobs(draft: Draft): DraftWithoutBlobs {
  return { ...draft, images: draft.images.map(({ id, alt, width, height }) => ({ id, alt, width, height })) };
}

/**
 * A draft as multipart form data: the draft as JSON (images reduced to their
 * metadata) plus one file part per image, in order.
 */
export function draftToFormData(draft: Draft, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('draft', JSON.stringify(withoutBlobs(draft)));
  draft.images.forEach((img, i) => form.set(`image${i}`, img.blob, img.id));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const strings = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === 'string')
        .slice(0, maxItems)
        .map((x) => x.slice(0, maxLen))
    : [];

function threadProgress(v: unknown): ThreadProgress | undefined {
  const p = v as ThreadProgress | undefined;
  if (!p || !Array.isArray(p.texts) || !Array.isArray(p.rkeys) || !Array.isArray(p.created)) return undefined;
  const n = p.texts.length;
  if (n === 0 || n > 200 || p.rkeys.length !== n || p.created.length !== n) return undefined;
  return {
    texts: strings(p.texts, n, 3000),
    imageGroups: Array.isArray(p.imageGroups)
      ? p.imageGroups.map((g) => (Array.isArray(g) ? g.filter((k) => Number.isInteger(k)) : []))
      : [],
    rkeys: strings(p.rkeys, n, 20),
    created: p.created.map((c) =>
      c && typeof c.uri === 'string' && typeof c.cid === 'string' ? { uri: c.uri, cid: c.cid } : null,
    ),
  };
}

/**
 * Read a draft back from form data. The other side may not be our own code,
 * so every field is checked rather than trusted.
 */
export function draftFromFormData(form: FormData): Draft {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(String(form.get('draft') ?? ''));
  } catch {
    throw new InvalidDraftError('Malformed draft');
  }
  if (!raw || typeof raw !== 'object') throw new InvalidDraftError('Malformed draft');

  const text = str(raw.text, MAX_DRAFT_CHARS + 1);
  if (text.length > MAX_DRAFT_CHARS) throw new InvalidDraftError('Draft is too long');

  const metas = Array.isArray(raw.images) ? (raw.images as Array<Record<string, unknown>>) : [];
  if (metas.length > MAX_DRAFT_IMAGES) throw new InvalidDraftError(`At most ${MAX_DRAFT_IMAGES} images`);
  const images: DraftImage[] = metas.map((meta, i) => {
    const blob = form.get(`image${i}`);
    if (!(blob instanceof Blob)) throw new InvalidDraftError('Missing image');
    if (blob.size > MAX_IMAGE_BYTES) throw new InvalidDraftError('Image is over 1 MB');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(blob.type)) throw new InvalidDraftError('Unsupported image type');
    return {
      id: str(meta?.id, 64) || crypto.randomUUID(),
      blob,
      alt: str(meta?.alt, 2000),
      width: Math.max(1, Number(meta?.width) || 1),
      height: Math.max(1, Number(meta?.height) || 1),
    };
  });

  return newDraft({
    id: str(raw.id, 64) || crypto.randomUUID(),
    text,
    title: str(raw.title, 500),
    shareText: str(raw.shareText, 3000),
    images,
    mode: raw.mode === 'thread' || raw.mode === 'article' ? raw.mode : null,
    numbering: raw.numbering === true,
    langs: strings(raw.langs, 3, 20),
    threadProgress: threadProgress(raw.threadProgress),
    rkeys: raw.rkeys ? strings(raw.rkeys, 2, 20) : undefined,
  });
}
