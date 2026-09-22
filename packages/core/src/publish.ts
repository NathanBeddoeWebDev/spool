import type { Agent, BlobRef } from '@atproto/api';
import { TID } from '@atproto/common-web';
import {
  DOCUMENT_COLLECTION,
  POST_COLLECTION,
  PUBLICATION_COLLECTION,
  articleParts,
  atUri,
  bskyPostUrl,
  defaultShareText,
  documentRecord,
  externalEmbed,
  imagesEmbed,
  postRecord,
  publicationRecord,
  type ExternalCard,
  type ImageRef,
  type PostEmbed,
} from './records.ts';
import { buildRichText } from './richtext.ts';
import { distributeImages, splitThread } from './split.ts';
import { URL_RE, measure, POST_GRAPHEME_LIMIT } from './text.ts';
import type { Draft, DraftImage, PublishProgress, PublishResult, StrongRef, ThreadProgress } from './types.ts';

export interface PublishContext {
  /** Authenticated agent (OAuth session). */
  agent: Agent;
  did: string;
  handle?: string;
  displayName?: string;
  /** Origin that renders articles, e.g. https://spool.example */
  appOrigin: string;
}

export interface PublishHooks {
  onProgress?: (p: PublishProgress) => void;
  /** Called after every post in a thread so callers can persist resume state. */
  onThreadProgress?: (p: ThreadProgress) => void | Promise<void>;
}

async function upload(agent: Agent, blob: Blob): Promise<BlobRef> {
  const res = await agent.uploadBlob(blob, { encoding: blob.type || 'image/jpeg' });
  return res.data.blob;
}

async function uploadImages(agent: Agent, images: DraftImage[]): Promise<ImageRef[]> {
  const refs: ImageRef[] = [];
  for (const img of images) {
    refs.push({ blob: await upload(agent, img.blob), alt: img.alt, width: img.width, height: img.height });
  }
  return refs;
}

/**
 * Link card metadata for a URL, via Bluesky's own card service. Best effort:
 * a failed lookup just means the post goes out without a card.
 */
export async function fetchLinkCard(agent: Agent, url: string, timeoutMs = 4000): Promise<ExternalCard | undefined> {
  try {
    const res = await fetch(`https://cardyb.bsky.app/v1/extract?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { error?: string; title?: string; description?: string; image?: string };
    if (data.error || !data.title) return undefined;
    let thumb: BlobRef | undefined;
    if (data.image) {
      try {
        const img = await fetch(data.image, { signal: AbortSignal.timeout(timeoutMs) });
        const blob = await img.blob();
        if (img.ok && blob.size > 0 && blob.size < 1_000_000) thumb = await upload(agent, blob);
      } catch {
        // No thumbnail is fine.
      }
    }
    return { uri: url, title: data.title, description: data.description ?? '', thumb };
  } catch {
    return undefined;
  }
}

async function getExisting(agent: Agent, did: string, collection: string, rkey: string): Promise<StrongRef | null> {
  try {
    const res = await agent.com.atproto.repo.getRecord({ repo: did, collection, rkey });
    return res.data.cid ? { uri: res.data.uri, cid: res.data.cid } : null;
  } catch {
    return null;
  }
}

async function createPost(
  ctx: PublishContext,
  rkey: string,
  text: string,
  extra: { reply?: { root: StrongRef; parent: StrongRef }; embed?: PostEmbed; langs?: string[] },
): Promise<StrongRef> {
  const rich = await buildRichText(text);
  const record = postRecord({ text: rich.text, facets: rich.facets, ...extra });
  try {
    const res = await ctx.agent.com.atproto.repo.createRecord({
      repo: ctx.did,
      collection: POST_COLLECTION,
      rkey,
      record,
    });
    return { uri: res.data.uri, cid: res.data.cid };
  } catch (err) {
    // The write may have landed before the connection dropped.
    const existing = await getExisting(ctx.agent, ctx.did, POST_COLLECTION, rkey);
    if (existing) return existing;
    throw err;
  }
}

export async function publishPost(ctx: PublishContext, draft: Draft, hooks: PublishHooks = {}): Promise<PublishResult> {
  if (measure(draft.text) > POST_GRAPHEME_LIMIT) throw new Error('Too long for a single post');
  hooks.onProgress?.({ step: 'Posting', done: 0, total: 1 });

  let embed: PostEmbed | undefined;
  if (draft.images.length) {
    embed = imagesEmbed(await uploadImages(ctx.agent, draft.images.slice(0, 4)));
  } else {
    const firstUrl = draft.text.match(URL_RE)?.[0];
    const card = firstUrl ? await fetchLinkCard(ctx.agent, firstUrl) : undefined;
    if (card) embed = externalEmbed(card);
  }

  const ref = await createPost(ctx, TID.nextStr(), draft.text.trim(), { embed, langs: draft.langs });
  hooks.onProgress?.({ step: 'Posted', done: 1, total: 1 });
  return { kind: 'post', uri: ref.uri, url: bskyPostUrl(ref.uri) };
}

export function planThread(draft: Draft): ThreadProgress {
  const texts = splitThread(draft.text, { numbering: draft.numbering }).map((s) => s.text);
  const imageGroups = distributeImages(texts.length, draft.images.length);
  const padded = imageGroups.map((_, i) => texts[i] ?? '');
  return {
    texts: padded,
    imageGroups,
    rkeys: padded.map(() => TID.nextStr()),
    created: padded.map(() => null),
  };
}

/**
 * Post a thread one record at a time. Each post needs its parent's CID, and
 * record keys are fixed up front, so a failure halfway can be resumed by
 * passing `draft.threadProgress` back in: finished posts are skipped and
 * the rest are written to the same keys.
 */
export async function publishThread(
  ctx: PublishContext,
  draft: Draft,
  hooks: PublishHooks = {},
): Promise<PublishResult> {
  const progress: ThreadProgress = draft.threadProgress ? structuredClone(draft.threadProgress) : planThread(draft);
  const total = progress.texts.length;
  if (total === 0) throw new Error('Nothing to post');

  for (let i = 0; i < total; i++) {
    if (progress.created[i]) continue;
    hooks.onProgress?.({ step: `Posting ${i + 1} of ${total}`, done: i, total });

    const root = progress.created[0];
    const parent = progress.created[i - 1];
    const reply = i > 0 && root && parent ? { root, parent } : undefined;

    const group = (progress.imageGroups[i] ?? []).map((k) => draft.images[k]).filter((x): x is DraftImage => !!x);
    const embed = group.length ? imagesEmbed(await uploadImages(ctx.agent, group)) : undefined;

    progress.created[i] = await createPost(ctx, progress.rkeys[i]!, progress.texts[i]!, {
      reply,
      embed,
      langs: draft.langs,
    });
    await hooks.onThreadProgress?.(structuredClone(progress));
  }

  hooks.onProgress?.({ step: 'Thread posted', done: total, total });
  const rootRef = progress.created[0]!;
  return { kind: 'thread', uri: rootRef.uri, url: bskyPostUrl(rootRef.uri), count: total };
}

export interface Publication {
  uri: string;
  url: string;
}

/** Find this app's publication record in the user's repo, or create it. */
export async function ensurePublication(ctx: PublishContext): Promise<Publication> {
  const url = `${ctx.appOrigin.replace(/\/+$/, '')}/${ctx.did}`;
  let cursor: string | undefined;
  do {
    const res = await ctx.agent.com.atproto.repo.listRecords({
      repo: ctx.did,
      collection: PUBLICATION_COLLECTION,
      limit: 100,
      cursor,
    });
    const found = res.data.records.find((r) => (r.value as { url?: string }).url === url);
    if (found) return { uri: found.uri, url };
    cursor = res.data.cursor;
  } while (cursor);

  const rkey = TID.nextStr();
  await ctx.agent.com.atproto.repo.createRecord({
    repo: ctx.did,
    collection: PUBLICATION_COLLECTION,
    rkey,
    record: publicationRecord({
      url,
      name: ctx.displayName || ctx.handle || 'Writing',
      description: ctx.handle ? `Writing by @${ctx.handle}` : undefined,
    }),
  });
  return { uri: atUri(ctx.did, PUBLICATION_COLLECTION, rkey), url };
}

/**
 * Publish a standard.site document plus a Bluesky post linking to it.
 * Both records go in one applyWrites call, so either both exist or neither
 * does. The post's strong ref is then written back onto the document
 * (bskyPostRef) so readers can find the discussion.
 */
export async function publishArticle(
  ctx: PublishContext,
  draft: Draft,
  hooks: PublishHooks = {},
): Promise<PublishResult> {
  const total = 4;
  hooks.onProgress?.({ step: 'Preparing article', done: 0, total });
  const parts = articleParts(draft.text, draft.title);
  const publication = await ensurePublication(ctx);

  hooks.onProgress?.({ step: 'Uploading cover', done: 1, total });
  const cover = draft.images[0] ? await upload(ctx.agent, draft.images[0].blob) : undefined;

  const docRkey = TID.nextStr();
  const postRkey = TID.nextStr();
  const path = `/${docRkey}`;
  const url = publication.url + path;
  const publishedAt = new Date().toISOString();

  const doc = documentRecord({ site: publication.uri, path, parts, coverImage: cover, publishedAt });

  const shareSource = draft.shareText.trim() || defaultShareText(parts.title, parts.description);
  const rich = await buildRichText(shareSource);
  const post = postRecord({
    text: rich.text,
    facets: rich.facets,
    langs: draft.langs,
    createdAt: publishedAt,
    embed: externalEmbed({ uri: url, title: parts.title, description: parts.description, thumb: cover }),
  });

  hooks.onProgress?.({ step: 'Publishing', done: 2, total });
  const res = await ctx.agent.com.atproto.repo.applyWrites({
    repo: ctx.did,
    writes: [
      { $type: 'com.atproto.repo.applyWrites#create', collection: DOCUMENT_COLLECTION, rkey: docRkey, value: doc },
      { $type: 'com.atproto.repo.applyWrites#create', collection: POST_COLLECTION, rkey: postRkey, value: post },
    ],
  });

  const results = (res.data.results ?? []) as Array<{ uri?: string; cid?: string }>;
  const docResult = results[0];
  const postResult = results[1];
  const documentUri = atUri(ctx.did, DOCUMENT_COLLECTION, docRkey);
  const postUri = atUri(ctx.did, POST_COLLECTION, postRkey);

  hooks.onProgress?.({ step: 'Linking discussion', done: 3, total });
  if (postResult?.cid) {
    try {
      await ctx.agent.com.atproto.repo.putRecord({
        repo: ctx.did,
        collection: DOCUMENT_COLLECTION,
        rkey: docRkey,
        record: { ...doc, bskyPostRef: { uri: postUri, cid: postResult.cid } },
        swapRecord: docResult?.cid,
      });
    } catch {
      // The article and post are live; the back-reference is a nicety.
    }
  }

  hooks.onProgress?.({ step: 'Published', done: total, total });
  return { kind: 'article', url, postUrl: bskyPostUrl(postUri), documentUri, postUri };
}
