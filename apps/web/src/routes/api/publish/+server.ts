import { error } from '@sveltejs/kit';
import { draftFromFormData, isPublishKind } from '@spool/core';
import { publishDraft } from '@spool/core/publish';
import { env as publicEnv } from '$env/dynamic/public';
import type { PublishEvent } from '$lib/publish-events.ts';
import { NO_STORE, handleScheduleErrors, requireDid } from '$lib/server/api.ts';
import { requireEnv } from '$lib/server/env.ts';
import { isAccessLost, publishContextFor } from '$lib/server/scheduler.ts';

/**
 * Publish a draft now. Answers with NDJSON: progress as it goes, then the
 * result or an error. Thread progress is streamed too, so the browser can
 * save it and resume a thread that fails partway.
 */
export async function POST({ request, locals, platform, url }) {
  const did = requireDid(locals);
  const env = requireEnv(platform);
  const form = await request.formData();
  const kind = form.get('kind');
  if (!isPublishKind(kind)) error(400, 'Unknown kind of post');
  const draft = await handleScheduleErrors(async () => draftFromFormData(form));

  let ctx;
  try {
    ctx = await publishContextFor(env, did, (publicEnv.PUBLIC_APP_ORIGIN || url.origin).replace(/\/+$/, ''));
  } catch (err) {
    if (isAccessLost(err)) error(401, (err as Error).message);
    throw err;
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: PublishEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; publishing carries on regardless.
        }
      };
      const done = publishDraft(ctx, kind, draft, {
        onProgress: (progress) => send({ type: 'progress', progress }),
        onThreadProgress: (progress) => send({ type: 'thread', progress }),
      })
        .then(
          (result) => send({ type: 'done', result }),
          (err) => {
            console.error(err);
            send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
          },
        )
        .finally(() => {
          try {
            controller.close();
          } catch {
            // Already closed.
          }
        });
      // Finish even if the tab closes mid-thread.
      platform?.ctx.waitUntil(done);
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson', ...NO_STORE } });
}
