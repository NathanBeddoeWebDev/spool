import { error, json } from '@sveltejs/kit';
import { InvalidDraftError } from '@spool/core';
import { ScheduleError } from './scheduler.ts';

export const NO_STORE = { 'cache-control': 'private, no-store' };

export function requireDid(locals: App.Locals): string {
  if (!locals.did) error(401, 'Sign in first');
  return locals.did;
}

export function noStore(data: unknown, init: ResponseInit = {}) {
  return json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

/** Turn expected failures into their status codes; let anything else surface as a 500. */
export async function handleScheduleErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ScheduleError) error(err.status, err.message);
    if (err instanceof InvalidDraftError) error(400, err.message);
    throw err;
  }
}
