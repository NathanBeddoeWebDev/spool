import type { Cookies } from '@sveltejs/kit';
import type { Env } from './env.ts';
import { getClientForAccount } from './oauth.ts';

export const SESSION_COOKIE = 'spool_session';
const SESSION_TTL = 180 * 24 * 60 * 60_000;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Start a browser session for `did` and set its cookie. */
export async function startWebSession(env: Env, cookies: Cookies, did: string, secure: boolean) {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare('INSERT INTO web_session (id, did, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(await sha256(token), did, now, now + SESSION_TTL)
    .run();
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_TTL / 1000,
  });
}

/** The account behind a session cookie, or null. */
export async function readWebSession(env: Env, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const row = await env.DB.prepare('SELECT did FROM web_session WHERE id = ?1 AND expires_at > ?2')
    .bind(await sha256(token), Date.now())
    .first<{ did: string }>();
  return row?.did ?? null;
}

/**
 * Sign this browser out. The account's OAuth grant is revoked too, unless
 * another browser is still signed in or posts are still waiting to go out:
 * those need it.
 */
export async function endWebSession(env: Env, cookies: Cookies) {
  const token = cookies.get(SESSION_COOKIE);
  cookies.delete(SESSION_COOKIE, { path: '/' });
  if (!token) return;
  const id = await sha256(token);
  const row = await env.DB.prepare('DELETE FROM web_session WHERE id = ?1 RETURNING did').bind(id).first<{
    did: string;
  }>();
  if (row) await revokeIfUnused(env, row.did);
}

/** Revoke an account's OAuth grant once nothing here needs it. */
export async function revokeIfUnused(env: Env, did: string) {
  const inUse = await env.DB.prepare(
    `SELECT 1 FROM web_session WHERE did = ?1 AND expires_at > ?2
     UNION ALL SELECT 1 FROM scheduled_post WHERE did = ?1 AND status IN ('scheduled', 'publishing')
     LIMIT 1`,
  )
    .bind(did, Date.now())
    .first();
  if (inUse) return;
  const client = await getClientForAccount(env, did);
  // revoke() also deletes the stored session, even if the server can't be reached.
  await client?.revoke(did).catch(() => {});
}
