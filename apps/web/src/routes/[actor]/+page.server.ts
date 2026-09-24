import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import {
  getProfile,
  listRecords,
  resolveActor,
  resolvePds,
  type DocumentValue,
  type PublicationValue,
} from '$lib/server/atproto.ts';

/** A writer's publication on this site: every article they published with Spool. */
export async function load({ params, fetch, url, setHeaders }) {
  const did = await resolveActor(params.actor);
  const pds = await resolvePds(did);
  const origin = (env.PUBLIC_APP_ORIGIN || url.origin).replace(/\/+$/, '');
  const pubUrl = `${origin}/${did}`;

  const [publications, documents, author] = await Promise.all([
    listRecords<PublicationValue>(pds, did, 'site.standard.publication', fetch),
    listRecords<DocumentValue>(pds, did, 'site.standard.document', fetch),
    getProfile(did, fetch),
  ]);
  const publication = publications.find((p) => p.value.url === pubUrl);
  if (!publication) error(404, 'Nothing published here yet.');

  const articles = documents
    .filter((d) => d.value.site === publication.uri)
    .map((d) => ({
      rkey: d.uri.split('/').pop()!,
      title: d.value.title,
      description: d.value.description ?? '',
      publishedAt: d.value.publishedAt,
    }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  setHeaders({ 'cache-control': 'public, max-age=60, s-maxage=300' });
  return { did, author, publication: { uri: publication.uri, ...publication.value }, articles };
}
