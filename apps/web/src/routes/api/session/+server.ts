import { getProfile } from '$lib/server/atproto.ts';
import { noStore } from '$lib/server/api.ts';

/** Who's signed in in this browser, if anyone. */
export async function GET({ locals, fetch }) {
  if (!locals.did) return noStore({ account: null });
  const { did, handle, displayName, avatar } = await getProfile(locals.did, fetch);
  return noStore({ account: { did, handle, displayName, avatar } });
}
