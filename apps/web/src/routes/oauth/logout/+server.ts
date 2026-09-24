import { endWebSession } from '$lib/server/auth.ts';
import { requireEnv } from '$lib/server/env.ts';

export async function POST({ platform, cookies }) {
  await endWebSession(requireEnv(platform), cookies);
  return new Response(null, { status: 204 });
}
