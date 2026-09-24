import { error } from '@sveltejs/kit';
import { draftFromFormData, isPublishKind } from '@spool/core';
import { handleScheduleErrors, noStore, requireDid } from '$lib/server/api.ts';
import { requireEnv } from '$lib/server/env.ts';
import { createScheduled, listScheduled } from '$lib/server/scheduler.ts';

export async function GET({ locals, platform }) {
  const did = requireDid(locals);
  return noStore(await listScheduled(requireEnv(platform), did));
}

/** Schedule a draft: multipart with the draft, `kind` and `publishAt` (ISO time). */
export async function POST({ request, locals, platform }) {
  const did = requireDid(locals);
  const env = requireEnv(platform);
  const form = await request.formData();
  const kind = form.get('kind');
  if (!isPublishKind(kind)) error(400, 'Unknown kind of post');
  const publishAt = Date.parse(String(form.get('publishAt') ?? ''));
  return handleScheduleErrors(async () =>
    noStore(await createScheduled(env, did, kind, draftFromFormData(form), publishAt), { status: 201 }),
  );
}
