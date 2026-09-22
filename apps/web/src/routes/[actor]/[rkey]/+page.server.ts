import { error } from '@sveltejs/kit';
import { renderMarkdown } from '@spool/core/markdown';
import {
  blobUrl,
  getProfile,
  getRecord,
  resolveActor,
  resolvePds,
  type DocumentValue,
  type PublicationValue,
} from '$lib/server/atproto.ts';

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export async function load({ params, fetch, setHeaders }) {
  if (!/^[a-zA-Z0-9._~:-]{1,512}$/.test(params.rkey)) error(404, 'Not found');
  const did = await resolveActor(params.actor, fetch);
  const pds = await resolvePds(did, fetch);
  const [record, author] = await Promise.all([
    getRecord<DocumentValue>(pds, did, 'site.standard.document', params.rkey, fetch),
    getProfile(did, fetch),
  ]);
  if (!record) error(404, 'This article doesn’t exist, or the author deleted it.');

  const doc = record.value;
  let publication: PublicationValue | null = null;
  if (doc.site?.startsWith('at://')) {
    const [, , repo, collection, rkey] = doc.site.split('/');
    if (repo === did && collection && rkey) {
      publication = (await getRecord<PublicationValue>(pds, did, collection, rkey, fetch))?.value ?? null;
    }
  }

  const markdown = doc.content?.$type === 'at.markpub.markdown' ? doc.content.text?.markdown : undefined;
  const html = markdown !== undefined ? renderMarkdown(markdown) : paragraphs(doc.textContent ?? '');
  const words = (doc.textContent ?? markdown ?? '').trim().split(/\s+/).filter(Boolean).length;

  const postRef = doc.bskyPostRef?.uri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);

  setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400' });

  return {
    uri: record.uri,
    did,
    author,
    publication,
    title: doc.title,
    description: doc.description ?? '',
    html,
    cover: blobUrl(pds, did, doc.coverImage),
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
    tags: doc.tags ?? [],
    minutes: Math.max(1, Math.round(words / 230)),
    discussUrl: postRef ? `https://bsky.app/profile/${postRef[1]}/post/${postRef[2]}` : null,
  };
}
