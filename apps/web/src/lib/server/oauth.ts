import { JoseKey } from '@atproto/jwk-jose';
import {
  Keyset,
  OAuthClient,
  atprotoLoopbackClientMetadata,
  type InternalStateData,
  type OAuthClientMetadataInput,
  type RuntimeImplementation,
  type SessionStore,
  type StateStore,
} from '@atproto/oauth-client';
import { HANDLE_RESOLVER, OAUTH_SCOPE } from '@spool/core';
import type { D1Database } from '@cloudflare/workers-types';
import { clientMetadata } from '../scope.ts';
import type { Env } from './env.ts';

const STATE_TTL = 60 * 60_000;
const LOCK_TTL = 30_000;
const LOCK_WAIT = 15_000;

export function isLoopback(origin: string): boolean {
  const { hostname } = new URL(origin);
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
}

export const redirectUri = (origin: string) => `${origin}/oauth/callback`;

/**
 * Authorization servers fetch these, and must never be handed a stale copy.
 * They cache on their side (typically 10 minutes); we don't add an edge cache.
 */
export const OAUTH_DOCUMENT_HEADERS = { 'cache-control': 'no-cache' };

/** Metadata served at /oauth/client-metadata.json. Its URL is the client_id. */
export function webClientMetadata(origin: string) {
  return clientMetadata({
    clientId: `${origin}/oauth/client-metadata.json`,
    clientName: 'Spool',
    clientUri: origin,
    redirectUris: [redirectUri(origin)],
    jwksUri: `${origin}/jwks.json`,
  });
}

let keysetPromise: Promise<Keyset> | undefined;

/** The confidential client's signing keys, from the OAUTH_PRIVATE_KEY secret. */
export function getKeyset(env: Env): Promise<Keyset> {
  if (!env.OAUTH_PRIVATE_KEY) {
    return Promise.reject(new Error('OAUTH_PRIVATE_KEY is not set. See "Deploy the web app" in the README.'));
  }
  keysetPromise ??= JoseKey.fromImportable(env.OAUTH_PRIVATE_KEY).then((key) => new Keyset([key]));
  return keysetPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A lock shared by every request and cron run, held in D1. Refreshing tokens
 * twice at once would spend the refresh token twice, and the authorization
 * server revokes the whole session when that happens.
 */
export async function withLock<T>(db: D1Database, name: string, fn: () => T | PromiseLike<T>): Promise<T> {
  const owner = crypto.randomUUID();
  const giveUpAt = Date.now() + LOCK_WAIT;
  for (;;) {
    const now = Date.now();
    const res = await db
      .prepare(
        `INSERT INTO mutex (name, owner, expires_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (name) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
         WHERE mutex.expires_at < ?4`,
      )
      .bind(name, owner, now + LOCK_TTL, now)
      .run();
    if (res.meta.changes > 0) break;
    if (now > giveUpAt) throw new Error(`Timed out waiting for ${name}`);
    await sleep(100 + Math.random() * 150);
  }
  try {
    return await fn();
  } finally {
    await db.prepare('DELETE FROM mutex WHERE name = ?1 AND owner = ?2').bind(name, owner).run();
  }
}

function runtime(db: D1Database): RuntimeImplementation {
  return {
    createKey: (algs) => JoseKey.generate(algs),
    getRandomValues: (n) => crypto.getRandomValues(new Uint8Array(n)),
    digest: async (data, { name }) => new Uint8Array(await crypto.subtle.digest(`SHA-${name.slice(3)}`, data)),
    requestLock: (name, fn) => withLock(db, `oauth:${name}`, fn),
  };
}

// Keys are stored as private JWKs and turned back into keys on read.

function stateStore(db: D1Database): StateStore {
  return {
    async get(key) {
      const row = await db
        .prepare('SELECT value FROM oauth_state WHERE key = ?1 AND expires_at > ?2')
        .bind(key, Date.now())
        .first<{ value: string }>();
      if (!row) return undefined;
      const { dpopJwk, ...rest } = JSON.parse(row.value);
      return { ...rest, dpopKey: await JoseKey.fromJWK(dpopJwk) } as InternalStateData;
    },
    async set(key, { dpopKey, ...rest }) {
      const value = JSON.stringify({ ...rest, dpopJwk: dpopKey.privateJwk });
      await db
        .prepare('INSERT OR REPLACE INTO oauth_state (key, value, expires_at) VALUES (?1, ?2, ?3)')
        .bind(key, value, Date.now() + STATE_TTL)
        .run();
    },
    async del(key) {
      await db.prepare('DELETE FROM oauth_state WHERE key = ?1').bind(key).run();
    },
  };
}

function sessionStore(db: D1Database, origin: string): SessionStore {
  return {
    async get(did) {
      const row = await db
        .prepare('SELECT value FROM oauth_session WHERE did = ?1')
        .bind(did)
        .first<{ value: string }>();
      if (!row) return undefined;
      const { dpopJwk, ...rest } = JSON.parse(row.value);
      return { ...rest, dpopKey: await JoseKey.fromJWK(dpopJwk) };
    },
    async set(did, { dpopKey, ...rest }) {
      const value = JSON.stringify({ ...rest, dpopJwk: dpopKey.privateJwk });
      await db
        .prepare(
          `INSERT INTO oauth_session (did, value, client_origin, updated_at) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT (did) DO UPDATE SET value = excluded.value, client_origin = excluded.client_origin,
             updated_at = excluded.updated_at`,
        )
        .bind(did, value, origin, Date.now())
        .run();
    },
    async del(did) {
      await db.prepare('DELETE FROM oauth_session WHERE did = ?1').bind(did).run();
    },
  };
}

const clients = new Map<string, Promise<OAuthClient>>();

/**
 * The OAuth client for requests on `origin`.
 *
 * Deployed, it's a confidential client: it signs its token requests with
 * OAUTH_PRIVATE_KEY, which is what earns sessions long enough to publish
 * scheduled posts days later. On 127.0.0.1 it's a loopback client, which
 * needs no key or hosted metadata but gets short sessions.
 */
export function getOAuthClient(env: Env, origin: string): Promise<OAuthClient> {
  let client = clients.get(origin);
  if (!client) {
    client = createClient(env, origin);
    client.catch(() => clients.delete(origin));
    clients.set(origin, client);
  }
  return client;
}

async function createClient(env: Env, origin: string): Promise<OAuthClient> {
  const loopback = isLoopback(origin);
  const metadata: OAuthClientMetadataInput = loopback
    ? atprotoLoopbackClientMetadata(
        `http://localhost?${new URLSearchParams({ redirect_uri: redirectUri(origin), scope: OAUTH_SCOPE })}`,
      )
    : (webClientMetadata(origin) as OAuthClientMetadataInput);
  return new OAuthClient({
    responseMode: 'query',
    clientMetadata: metadata,
    keyset: loopback ? undefined : await getKeyset(env),
    handleResolver: HANDLE_RESOLVER,
    runtimeImplementation: runtime(env.DB),
    stateStore: stateStore(env.DB),
    sessionStore: sessionStore(env.DB, origin),
  });
}

/** The client that issued `did`'s current session, for use outside a request. */
export async function getClientForAccount(env: Env, did: string): Promise<OAuthClient | null> {
  const row = await env.DB.prepare('SELECT client_origin FROM oauth_session WHERE did = ?1')
    .bind(did)
    .first<{ client_origin: string }>();
  return row ? getOAuthClient(env, row.client_origin) : null;
}
