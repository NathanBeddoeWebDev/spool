import { isExpectedSessionError } from '@atproto/oauth-client';
import {
  MAX_IMAGES_PER_POST,
  POST_GRAPHEME_LIMIT,
  articleParts,
  measure,
  splitThread,
  withoutBlobs,
  type Draft,
  type DraftWithoutBlobs,
  type PublishContext,
  type PublishKind,
  type PublishResult,
  type ScheduleStatus,
  type ScheduledPost,
} from '@spool/core';
import { publishDraft, reserveKeys } from '@spool/core/publish';
import { getPublicAgent } from '@spool/core/richtext';
import { revokeIfUnused } from './auth.ts';
import type { Env } from './env.ts';
import { getClientForAccount } from './oauth.ts';

const MAX_PENDING = 100;
const MAX_AHEAD = 366 * 24 * 60 * 60_000;
/** How long a run owns a post before another may take over. */
const LEASE = 10 * 60_000;
const BATCH = 10;
/** Waits between attempts after a failure; after the last, the post is marked failed. */
const BACKOFF = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
const KEEP_PUBLISHED = 7 * 24 * 60 * 60_000;

export class ScheduleError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** The writer has to sign in again before anything can be published for them. */
class AccessLost extends Error {
  constructor() {
    super('Spool lost access to your account. Sign in again, then retry.');
  }
}

interface Row {
  id: string;
  did: string;
  kind: PublishKind;
  draft: string;
  summary: string;
  post_count: number;
  image_count: number;
  publish_at: number;
  status: ScheduleStatus;
  next_attempt_at: number;
  lease_until: number | null;
  attempts: number;
  error: string | null;
  result: string | null;
}

const imageKey = (id: string, i: number) => `scheduled/${id}/${i}`;

function toScheduledPost(row: Row): ScheduledPost {
  return {
    id: row.id,
    kind: row.kind,
    publishAt: new Date(row.publish_at).toISOString(),
    retryAt:
      row.status === 'scheduled' && row.next_attempt_at > row.publish_at
        ? new Date(row.next_attempt_at).toISOString()
        : undefined,
    status: row.status,
    summary: row.summary,
    count: row.post_count,
    images: row.image_count,
    error: row.error ?? undefined,
    result: row.result ? (JSON.parse(row.result) as PublishResult) : undefined,
  };
}

/** Check a draft can be published as `kind`, and describe it for the list. */
function describe(kind: PublishKind, draft: Draft): { summary: string; count: number } {
  const text = draft.text.trim();
  if (kind === 'article') {
    const { title } = articleParts(draft.text, draft.title);
    if (!title) throw new ScheduleError('An article needs a title');
    return { summary: title, count: 1 };
  }
  if (!text && !draft.images.length) throw new ScheduleError('Nothing to post');
  const summary = text.split('\n')[0]!.slice(0, 160) || `${draft.images.length} images`;
  if (kind === 'post') {
    if (measure(text) > POST_GRAPHEME_LIMIT) throw new ScheduleError('Too long for a single post');
    if (draft.images.length > MAX_IMAGES_PER_POST) throw new ScheduleError('A post can have four images');
    return { summary, count: 1 };
  }
  const posts = splitThread(draft.text, { numbering: draft.numbering }).length;
  return { summary, count: Math.max(posts, Math.ceil(draft.images.length / MAX_IMAGES_PER_POST)) };
}

export async function createScheduled(
  env: Env,
  did: string,
  kind: PublishKind,
  draft: Draft,
  publishAt: number,
): Promise<ScheduledPost> {
  const now = Date.now();
  if (!Number.isFinite(publishAt)) throw new ScheduleError('Pick a time');
  if (publishAt > now + MAX_AHEAD) throw new ScheduleError('Pick a time within the next year');
  if (draft.threadProgress?.created.some(Boolean)) {
    throw new ScheduleError('Part of this thread is already posted. Finish it first.');
  }
  // Keys and the thread's split are fixed when it goes out, not now.
  draft = { ...draft, threadProgress: undefined, rkeys: undefined };
  const { summary, count } = describe(kind, draft);

  const pending = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scheduled_post WHERE did = ?1 AND status IN ('scheduled', 'publishing')`,
  )
    .bind(did)
    .first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING) throw new ScheduleError(`You can have ${MAX_PENDING} posts waiting at once`);

  const id = crypto.randomUUID();
  // Images first: a row without its images would fail when it came due.
  await Promise.all(
    draft.images.map((img, i) =>
      img.blob
        .arrayBuffer()
        .then((bytes) => env.IMAGES.put(imageKey(id, i), bytes, { httpMetadata: { contentType: img.blob.type } })),
    ),
  );
  const due = Math.max(publishAt, now);
  const row = await env.DB.prepare(
    `INSERT INTO scheduled_post (id, did, kind, draft, summary, post_count, image_count, publish_at, status,
       next_attempt_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'scheduled', ?8, ?9, ?9) RETURNING *`,
  )
    .bind(id, did, kind, JSON.stringify(withoutBlobs(draft)), summary, count, draft.images.length, due, now)
    .first<Row>();
  return toScheduledPost(row!);
}

export async function listScheduled(env: Env, did: string): Promise<ScheduledPost[]> {
  const { results } = await env.DB.prepare('SELECT * FROM scheduled_post WHERE did = ?1 ORDER BY publish_at')
    .bind(did)
    .all<Row>();
  return results.map(toScheduledPost);
}

async function loadDraft(env: Env, row: Row): Promise<Draft> {
  const stored = JSON.parse(row.draft) as DraftWithoutBlobs;
  const images = await Promise.all(
    stored.images.map(async (meta, i) => {
      const obj = await env.IMAGES.get(imageKey(row.id, i));
      if (!obj) throw new Error(`Image ${i + 1} is missing`);
      const blob = new Blob([await obj.arrayBuffer()], { type: obj.httpMetadata?.contentType ?? 'image/jpeg' });
      return { ...meta, blob };
    }),
  );
  return { ...stored, images };
}

async function deleteImages(env: Env, row: Pick<Row, 'id' | 'image_count'>) {
  if (!row.image_count) return;
  await env.IMAGES.delete(Array.from({ length: row.image_count }, (_, i) => imageKey(row.id, i)));
}

async function getOwned(env: Env, did: string, id: string): Promise<Row> {
  const row = await env.DB.prepare('SELECT * FROM scheduled_post WHERE id = ?1 AND did = ?2')
    .bind(id, did)
    .first<Row>();
  if (!row) throw new ScheduleError('Not found', 404);
  return row;
}

function assertIdle(row: Row) {
  if (row.status === 'publishing' && (row.lease_until ?? 0) > Date.now()) {
    throw new ScheduleError('It’s being published right now', 409);
  }
}

/**
 * Take a post off the schedule. With `restore`, its draft (images included)
 * is returned so it can go back into the composer; that isn't offered once
 * any of it has been posted.
 */
export async function removeScheduled(env: Env, did: string, id: string, restore = false): Promise<Draft | null> {
  const row = await getOwned(env, did, id);
  assertIdle(row);
  let draft: Draft | null = null;
  if (restore) {
    if (row.status === 'published') throw new ScheduleError('It’s already been published', 409);
    draft = await loadDraft(env, row);
    if (draft.threadProgress?.created.some(Boolean)) {
      throw new ScheduleError('Part of this thread is already posted. Retry it instead.', 409);
    }
    // Once it's edited, the old reservation no longer describes it.
    draft = { ...draft, threadProgress: undefined, rkeys: undefined };
  }
  // Only delete if nothing claimed it since we looked.
  const deleted = await env.DB.prepare(
    `DELETE FROM scheduled_post WHERE id = ?1 AND did = ?2 AND (lease_until IS NULL OR lease_until < ?3)`,
  )
    .bind(id, did, Date.now())
    .run();
  if (!deleted.meta.changes) throw new ScheduleError('It’s being published right now', 409);
  await deleteImages(env, row);
  return draft;
}

/** Move a post to a new time. Also how a failed post is retried. */
export async function reschedule(env: Env, did: string, id: string, publishAt: number): Promise<ScheduledPost> {
  const now = Date.now();
  if (!Number.isFinite(publishAt)) throw new ScheduleError('Pick a time');
  if (publishAt > now + MAX_AHEAD) throw new ScheduleError('Pick a time within the next year');
  const row = await getOwned(env, did, id);
  assertIdle(row);
  if (row.status === 'published') throw new ScheduleError('It’s already been published', 409);
  const due = Math.max(publishAt, now);
  const updated = await env.DB.prepare(
    `UPDATE scheduled_post SET publish_at = ?1, next_attempt_at = ?1, status = 'scheduled', attempts = 0,
       error = NULL, lease_until = NULL, updated_at = ?2
     WHERE id = ?3 AND did = ?4 AND status != 'published' AND (lease_until IS NULL OR lease_until < ?2)
     RETURNING *`,
  )
    .bind(due, now, id, did)
    .first<Row>();
  if (!updated) throw new ScheduleError('It’s being published right now', 409);
  return toScheduledPost(updated);
}

/** Everything a publish needs, signed in as `did` through the stored OAuth session. */
export async function publishContextFor(env: Env, did: string, appOrigin: string): Promise<PublishContext> {
  const client = await getClientForAccount(env, did);
  if (!client) throw new AccessLost();
  let session;
  try {
    session = await client.restore(did);
  } catch (err) {
    if (isExpectedSessionError(err)) throw new AccessLost();
    throw err;
  }
  const { Agent } = await import('@atproto/api');
  let handle: string | undefined;
  let displayName: string | undefined;
  try {
    ({ handle, displayName } = (await getPublicAgent().getProfile({ actor: did })).data);
  } catch {
    // Not indexed yet; publishing only needs the DID.
  }
  return { agent: new Agent(session), did, handle, displayName, appOrigin };
}

export function isAccessLost(err: unknown): boolean {
  return err instanceof AccessLost;
}

async function claim(env: Env, id: string, now: number): Promise<Row | null> {
  return env.DB.prepare(
    `UPDATE scheduled_post SET status = 'publishing', lease_until = ?1, attempts = attempts + 1, updated_at = ?2
     WHERE id = ?3 AND status IN ('scheduled', 'publishing') AND next_attempt_at <= ?2
       AND (lease_until IS NULL OR lease_until < ?2)
     RETURNING *`,
  )
    .bind(now + LEASE, now, id)
    .first<Row>();
}

async function publishOne(env: Env, id: string, appOrigin: string | undefined) {
  const row = await claim(env, id, Date.now());
  if (!row) return; // Another run got it first.

  const save = async (draft: Draft) => {
    await env.DB.prepare('UPDATE scheduled_post SET draft = ?1, lease_until = ?2, updated_at = ?3 WHERE id = ?4')
      .bind(JSON.stringify(withoutBlobs(draft)), Date.now() + LEASE, Date.now(), row.id)
      .run();
  };

  try {
    const origin = appOrigin || (await articleOrigin(env, row.did));
    const ctx = await publishContextFor(env, row.did, origin);
    let draft = await loadDraft(env, row);
    const reserved = reserveKeys(row.kind, draft);
    if (reserved !== draft) await save((draft = reserved));

    const result = await publishDraft(ctx, row.kind, draft, {
      onThreadProgress: async (threadProgress) => save((draft = { ...draft, threadProgress })),
    });
    await env.DB.prepare(
      `UPDATE scheduled_post SET status = 'published', result = ?1, error = NULL, lease_until = NULL, updated_at = ?2
       WHERE id = ?3`,
    )
      .bind(JSON.stringify(result), Date.now(), row.id)
      .run();
    await deleteImages(env, row);
  } catch (err) {
    console.error(`Scheduled post ${row.id} failed (attempt ${row.attempts})`, err);
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = err instanceof AccessLost || row.attempts > BACKOFF.length;
    const now = Date.now();
    await env.DB.prepare(
      `UPDATE scheduled_post SET status = ?1, error = ?2, next_attempt_at = ?3, lease_until = NULL, updated_at = ?4
       WHERE id = ?5`,
    )
      .bind(giveUp ? 'failed' : 'scheduled', message, now + (BACKOFF[row.attempts - 1] ?? 0), now, row.id)
      .run();
  }
}

/** Where article links point when there's no configured origin: the origin the account signed in on. */
async function articleOrigin(env: Env, did: string): Promise<string> {
  if (env.PUBLIC_APP_ORIGIN) return env.PUBLIC_APP_ORIGIN;
  const row = await env.DB.prepare('SELECT client_origin FROM oauth_session WHERE did = ?1')
    .bind(did)
    .first<{ client_origin: string }>();
  if (!row) throw new AccessLost();
  return row.client_origin;
}

/**
 * Publish everything that's due. Runs every minute from the cron trigger.
 * Runs can overlap safely: each post is claimed with a lease first.
 */
export async function publishDue(env: Env, opts: { appOrigin?: string } = {}) {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT id FROM scheduled_post
     WHERE status IN ('scheduled', 'publishing') AND next_attempt_at <= ?1 AND (lease_until IS NULL OR lease_until < ?1)
     ORDER BY next_attempt_at LIMIT ?2`,
  )
    .bind(now, BATCH)
    .all<{ id: string }>();
  for (const { id } of results) await publishOne(env, id, opts.appOrigin);
}

/** Housekeeping: expired sign-ins, old published entries, grants nothing needs. */
export async function cleanUp(env: Env) {
  const now = Date.now();
  const expired = await env.DB.prepare('DELETE FROM web_session WHERE expires_at < ?1 RETURNING did')
    .bind(now)
    .all<{ did: string }>();
  const published = await env.DB.prepare(
    `DELETE FROM scheduled_post WHERE status = 'published' AND updated_at < ?1 RETURNING did`,
  )
    .bind(now - KEEP_PUBLISHED)
    .all<{ did: string }>();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_state WHERE expires_at < ?1').bind(now),
    env.DB.prepare('DELETE FROM mutex WHERE expires_at < ?1').bind(now),
  ]);
  const dids = new Set([...expired.results, ...published.results].map((r) => r.did));
  for (const did of dids) await revokeIfUnused(env, did);
}
