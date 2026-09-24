import { createDidResolver } from '@atproto-labs/did-resolver';
import { createHandleResolver } from '@atproto-labs/handle-resolver';
import { extractPdsUrl, isAtprotoDid } from '@atproto/did';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Overridable for self-hosted infrastructure and local testing.
const PUBLIC_APPVIEW = env.ATPROTO_APPVIEW_URL || 'https://public.api.bsky.app';
const PLC = env.ATPROTO_PLC_URL || 'https://plc.directory';

type Fetch = typeof fetch;

// Both cache in memory: handles for 10 minutes, DID documents for an hour.
const handleResolver = createHandleResolver({ handleResolver: PUBLIC_APPVIEW });
const didResolver = createDidResolver({ plcDirectoryUrl: PLC });

export async function resolveActor(actor: string): Promise<string> {
  const decoded = decodeURIComponent(actor);
  if (decoded.startsWith('did:')) return decoded;
  const did = await handleResolver.resolve(decoded).catch(() => null);
  if (!did) error(404, 'Unknown author');
  return did;
}

export async function resolvePds(did: string): Promise<string> {
  if (!isAtprotoDid(did)) error(400, 'Unsupported DID method');
  let doc;
  try {
    doc = await didResolver.resolve(did);
  } catch {
    error(404, 'Could not resolve author');
  }
  try {
    return extractPdsUrl(doc).href.replace(/\/+$/, '');
  } catch {
    error(404, 'Author has no PDS');
  }
}

export async function getRecord<T>(pds: string, did: string, collection: string, rkey: string, f: Fetch) {
  const q = new URLSearchParams({ repo: did, collection, rkey });
  const res = await f(`${pds}/xrpc/com.atproto.repo.getRecord?${q}`);
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) error(502, 'Author’s PDS is unavailable');
  return (await res.json()) as { uri: string; cid: string; value: T };
}

export async function listRecords<T>(pds: string, did: string, collection: string, f: Fetch, limit = 100) {
  const q = new URLSearchParams({ repo: did, collection, limit: String(limit) });
  const res = await f(`${pds}/xrpc/com.atproto.repo.listRecords?${q}`);
  if (!res.ok) return [];
  return ((await res.json()) as { records: Array<{ uri: string; cid: string; value: T }> }).records;
}

export interface Profile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  description?: string;
}

export async function getProfile(did: string, f: Fetch): Promise<Profile> {
  try {
    const res = await f(`${PUBLIC_APPVIEW}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`);
    if (res.ok) return (await res.json()) as Profile;
  } catch {
    // fall through
  }
  return { did, handle: did };
}

export function blobUrl(pds: string, did: string, blob: unknown): string | undefined {
  const cid = (blob as { ref?: { $link?: string } } | undefined)?.ref?.$link;
  if (!cid) return undefined;
  return `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;
}

export interface DocumentValue {
  site: string;
  path?: string;
  title: string;
  description?: string;
  textContent?: string;
  content?: { $type?: string; text?: { markdown?: string } };
  coverImage?: unknown;
  publishedAt: string;
  updatedAt?: string;
  tags?: string[];
  bskyPostRef?: { uri: string; cid: string };
}

export interface PublicationValue {
  url: string;
  name: string;
  description?: string;
}
