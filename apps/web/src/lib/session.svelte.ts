import {
  draftFromFormData,
  draftToFormData,
  type Draft,
  type PublishKind,
  type Publisher,
  type PublishResult,
  type ScheduledPost,
} from '@spool/core';
import type { Account } from '@spool/ui';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { PublishEvent } from './publish-events.ts';

export function appOrigin(): string {
  return (env.PUBLIC_APP_ORIGIN || location.origin).replace(/\/+$/, '');
}

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new Error(body?.message || `Request failed (${res.status})`);
}

/**
 * The signed-in account. OAuth tokens live on the server, which is what lets
 * it publish scheduled posts while this tab is closed; the browser only holds
 * a session cookie.
 */
class SessionState {
  status = $state<'loading' | 'signed-out' | 'signed-in'>('loading');
  account = $state<Account | null>(null);
  error = $state('');
  /** This account's scheduled posts, soonest first, including recently published and failed ones. */
  scheduled = $state<ScheduledPost[]>([]);

  async init() {
    const params = new URLSearchParams(location.search);
    const signInError = params.get('signin_error');
    if (signInError) {
      this.error = signInError;
      params.delete('signin_error');
      history.replaceState(history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}`);
    }
    try {
      const res = await fetch('/api/session');
      const { account } = res.ok ? ((await res.json()) as { account: Account | null }) : { account: null };
      this.account = account;
      this.status = account ? 'signed-in' : 'signed-out';
      if (account) this.refreshScheduled().catch(console.error);
    } catch (err) {
      console.error(err);
      this.status = 'signed-out';
    }
  }

  async signIn(handle: string) {
    this.error = '';
    const res = await fetch('/oauth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: handle.trim().replace(/^@/, '') }),
    });
    if (!res.ok) throw await failure(res);
    const { url } = (await res.json()) as { url: string };
    // Redirects away; the draft is autosaved and restored on return.
    location.assign(url);
  }

  async signOut() {
    try {
      await fetch('/oauth/logout', { method: 'POST' });
    } finally {
      this.#signedOut();
    }
  }

  #signedOut(message = '') {
    this.account = null;
    this.scheduled = [];
    this.status = 'signed-out';
    this.error = message;
  }

  /** fetch that notices when the server no longer recognises this browser. */
  async #fetch(input: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, init);
    if (res.status === 401) {
      const err = await failure(res);
      this.#signedOut(err.message);
      throw err;
    }
    return res;
  }

  readonly publisher: Publisher = {
    publish: async (kind, draft, hooks = {}) => {
      const res = await this.#fetch('/api/publish', { method: 'POST', body: draftToFormData(draft, { kind }) });
      if (!res.ok || !res.body) throw await failure(res);

      let result: PublishResult | undefined;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffered = '';
      for (;;) {
        const { value, done } = await reader.read();
        buffered += value ?? '';
        const lines = done ? [buffered] : buffered.split('\n');
        buffered = done ? '' : lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as PublishEvent;
          if (event.type === 'progress') hooks.onProgress?.(event.progress);
          else if (event.type === 'thread') await hooks.onThreadProgress?.(event.progress);
          else if (event.type === 'error') throw new Error(event.message);
          else result = event.result;
        }
        if (done) break;
      }
      // A stream that ends without a result was cut off.
      if (!result) throw new Error('Network problem: lost the connection while publishing.');
      return result;
    },

    schedule: async (kind: PublishKind, draft: Draft, at: Date) => {
      const res = await this.#fetch('/api/scheduled', {
        method: 'POST',
        body: draftToFormData(draft, { kind, publishAt: at.toISOString() }),
      });
      if (!res.ok) throw await failure(res);
      const post = (await res.json()) as ScheduledPost;
      this.refreshScheduled().catch(console.error);
      return post;
    },
  };

  async refreshScheduled() {
    // `vite dev` has no cron trigger; run the scheduler whenever we look.
    if (dev) await fetch('/api/dev/run-scheduled', { method: 'POST' }).catch(() => {});
    const res = await this.#fetch('/api/scheduled');
    if (!res.ok) throw await failure(res);
    this.scheduled = await res.json();
  }

  async reschedule(id: string, at: Date): Promise<ScheduledPost> {
    const res = await this.#fetch(`/api/scheduled/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ publishAt: at.toISOString() }),
    });
    if (!res.ok) throw await failure(res);
    const post = (await res.json()) as ScheduledPost;
    this.scheduled = this.scheduled.map((p) => (p.id === id ? post : p));
    return post;
  }

  /** Take a post off the schedule; with `restore`, get its draft back. */
  async unschedule(id: string, restore: true): Promise<Draft>;
  async unschedule(id: string, restore?: false): Promise<null>;
  async unschedule(id: string, restore = false): Promise<Draft | null> {
    const res = await this.#fetch(`/api/scheduled/${id}${restore ? '?restore' : ''}`, { method: 'DELETE' });
    if (!res.ok) throw await failure(res);
    this.scheduled = this.scheduled.filter((p) => p.id !== id);
    return restore ? draftFromFormData(await res.formData()) : null;
  }
}

export const session = new SessionState();
