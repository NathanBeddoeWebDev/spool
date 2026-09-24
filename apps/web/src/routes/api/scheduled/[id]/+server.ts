import { draftToFormData } from '@spool/core';
import { NO_STORE, handleScheduleErrors, noStore, requireDid } from '$lib/server/api.ts';
import { requireEnv } from '$lib/server/env.ts';
import { removeScheduled, reschedule } from '$lib/server/scheduler.ts';

/** Move to a new time (`{ publishAt }`, ISO). Also retries a failed post. */
export async function PATCH({ params, request, locals, platform }) {
  const did = requireDid(locals);
  const env = requireEnv(platform);
  const { publishAt } = (await request.json().catch(() => ({}))) as { publishAt?: unknown };
  return handleScheduleErrors(async () =>
    noStore(await reschedule(env, did, params.id, Date.parse(String(publishAt)))),
  );
}

/** Take it off the schedule. With ?restore, answers with its draft as multipart, for the composer. */
export async function DELETE({ params, url, locals, platform }) {
  const did = requireDid(locals);
  const env = requireEnv(platform);
  const restore = url.searchParams.has('restore');
  const draft = await handleScheduleErrors(() => removeScheduled(env, did, params.id, restore));
  if (!draft) return new Response(null, { status: 204 });
  return new Response(draftToFormData(draft), { headers: NO_STORE });
}
