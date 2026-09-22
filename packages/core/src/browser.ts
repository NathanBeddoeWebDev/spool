/**
 * Browser-only helpers: image preparation and local persistence.
 * Kept out of the main entry so the core can run in Node (tests, SSR).
 */
import { createStore, del, get, set } from 'idb-keyval';
import { DEFAULT_PREFS, type Draft, type DraftImage, type Prefs, type PrefsStore, type DraftStore } from './types.ts';

/** Bluesky rejects image blobs over 1,000,000 bytes. Leave headroom. */
const MAX_BYTES = 950_000;
const MAX_EDGE = 2000;

async function encode(bitmap: ImageBitmap, width: number, height: number, type: string, quality: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type, quality });
}

/**
 * Resize and re-encode an image so it fits Bluesky's limits. Re-encoding
 * always happens, which also strips EXIF metadata such as GPS location.
 */
export async function prepareImage(file: Blob, alt = ''): Promise<DraftImage> {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    let type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let quality = 0.9;

    for (let attempt = 0; attempt < 12; attempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const blob = await encode(bitmap, width, height, type, quality);
      if (blob.size <= MAX_BYTES) {
        return { id: crypto.randomUUID(), blob, alt, width, height };
      }
      if (type === 'image/png') type = 'image/jpeg';
      else if (quality > 0.6) quality -= 0.1;
      else scale *= 0.8;
    }
    throw new Error('Could not shrink image under 1 MB');
  } finally {
    bitmap.close();
  }
}

const draftDb = typeof indexedDB !== 'undefined' ? createStore('spool', 'drafts') : undefined;

/** Autosaved current draft in IndexedDB (images are stored as Blobs). */
export function indexedDbDraftStore(key = 'current'): DraftStore {
  return {
    async load() {
      if (!draftDb) return null;
      return (await get<Draft>(key, draftDb)) ?? null;
    },
    async save(draft) {
      if (!draftDb) return;
      await set(key, $snapshot(draft), draftDb);
    },
    async clear() {
      if (!draftDb) return;
      await del(key, draftDb);
    },
  };
}

/** Strip framework proxies so structured clone into IndexedDB works. */
function $snapshot(draft: Draft): Draft {
  return {
    ...draft,
    images: draft.images.map((i) => ({ ...i })),
    langs: [...draft.langs],
    threadProgress: draft.threadProgress ? JSON.parse(JSON.stringify(draft.threadProgress)) : undefined,
  };
}

export function localStoragePrefsStore(key = 'spool:prefs'): PrefsStore {
  const read = (): Prefs => {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(key) ?? '{}') };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  };
  return {
    async get() {
      return read();
    },
    async set(patch) {
      const next = { ...read(), ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Private mode etc.: preferences just won't stick.
      }
      return next;
    },
  };
}
