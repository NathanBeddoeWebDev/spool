import type { AppBskyRichtextFacet, BlobRef } from '@atproto/api';
import { excerpt, extractTitle, markdownToText } from './markdown.ts';
import { POST_GRAPHEME_LIMIT, measure, truncateGraphemes } from './text.ts';
import type { StrongRef } from './types.ts';

export const POST_COLLECTION = 'app.bsky.feed.post';
export const DOCUMENT_COLLECTION = 'site.standard.document';
export const PUBLICATION_COLLECTION = 'site.standard.publication';

export interface ImageRef {
  blob: BlobRef;
  alt: string;
  width: number;
  height: number;
}

export interface ExternalCard {
  uri: string;
  title: string;
  description: string;
  thumb?: BlobRef;
}

export type PostEmbed =
  | {
      $type: 'app.bsky.embed.images';
      images: Array<{ image: BlobRef; alt: string; aspectRatio: { width: number; height: number } }>;
    }
  | { $type: 'app.bsky.embed.external'; external: ExternalCard };

export interface PostRecord {
  $type: typeof POST_COLLECTION;
  text: string;
  facets?: AppBskyRichtextFacet.Main[];
  createdAt: string;
  langs?: string[];
  reply?: { root: StrongRef; parent: StrongRef };
  embed?: PostEmbed;
  [k: string]: unknown;
}

export function imagesEmbed(images: ImageRef[]): PostEmbed | undefined {
  if (!images.length) return undefined;
  return {
    $type: 'app.bsky.embed.images',
    images: images.map((i) => ({
      image: i.blob,
      alt: i.alt,
      aspectRatio: { width: i.width, height: i.height },
    })),
  };
}

export function externalEmbed(card: ExternalCard): PostEmbed {
  return { $type: 'app.bsky.embed.external', external: card };
}

export function postRecord(input: {
  text: string;
  facets?: AppBskyRichtextFacet.Main[];
  langs?: string[];
  reply?: { root: StrongRef; parent: StrongRef };
  embed?: PostEmbed;
  createdAt?: string;
}): PostRecord {
  const record: PostRecord = {
    $type: POST_COLLECTION,
    text: input.text,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  if (input.facets?.length) record.facets = input.facets;
  if (input.langs?.length) record.langs = input.langs;
  if (input.reply) record.reply = input.reply;
  if (input.embed) record.embed = input.embed;
  return record;
}

/** Content object for markdown bodies: https://markpub.at */
export function markpubContent(markdown: string) {
  return {
    $type: 'at.markpub.markdown',
    flavor: 'gfm',
    renderingRules: 'marked',
    text: { $type: 'at.markpub.text', markdown },
  };
}

export interface ArticleParts {
  title: string;
  markdown: string;
  textContent: string;
  description: string;
}

/**
 * Work out title, body and description from what the writer typed.
 * An explicit title wins; otherwise a leading "# Heading" becomes the title;
 * otherwise the opening words do.
 */
export function articleParts(text: string, explicitTitle: string): ArticleParts {
  let title = explicitTitle.trim();
  let markdown = text.trim();
  if (!title) {
    const extracted = extractTitle(markdown);
    if (extracted.title) {
      title = extracted.title;
      markdown = extracted.body;
    }
  }
  const textContent = markdownToText(markdown);
  if (!title) title = excerpt(textContent, 80) || 'Untitled';
  return { title, markdown, textContent, description: excerpt(textContent, 300) };
}

export function documentRecord(input: {
  site: string;
  path: string;
  parts: ArticleParts;
  coverImage?: BlobRef;
  publishedAt?: string;
}) {
  const record: Record<string, unknown> = {
    $type: DOCUMENT_COLLECTION,
    site: input.site,
    path: input.path,
    title: input.parts.title,
    description: input.parts.description,
    textContent: input.parts.textContent,
    content: markpubContent(input.parts.markdown),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
  };
  if (input.coverImage) record.coverImage = input.coverImage;
  return record;
}

export function publicationRecord(input: { url: string; name: string; description?: string }) {
  return {
    $type: PUBLICATION_COLLECTION,
    url: input.url.replace(/\/+$/, ''),
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    preferences: { showInDiscover: true },
  };
}

/**
 * Default text for the post announcing an article: the title, then as much
 * of the description as fits. The link lives in the card, not the text.
 */
export function defaultShareText(title: string, description: string): string {
  const head = title.trim();
  if (!description.trim()) return truncateGraphemes(head, POST_GRAPHEME_LIMIT);
  const room = POST_GRAPHEME_LIMIT - measure(head) - 2;
  if (room < 40) return truncateGraphemes(head, POST_GRAPHEME_LIMIT);
  return `${head}\n\n${truncateGraphemes(description.trim(), room)}`;
}

export function bskyPostUrl(uri: string): string {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  if (!m) throw new Error(`Not a post URI: ${uri}`);
  return `https://bsky.app/profile/${m[1]}/post/${m[2]}`;
}

export function atUri(did: string, collection: string, rkey: string): string {
  return `at://${did}/${collection}/${rkey}`;
}
