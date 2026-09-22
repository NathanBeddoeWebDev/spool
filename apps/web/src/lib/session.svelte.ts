import { Agent } from '@atproto/api';
import { BrowserOAuthClient, buildLoopbackClientId, type OAuthSession } from '@atproto/oauth-client-browser';
import { HANDLE_RESOLVER, OAUTH_SCOPE, getPublicAgent, type PublishContext } from '@spool/core';
import type { Account } from '@spool/ui';
import { env } from '$env/dynamic/public';

function isLoopback(hostname: string) {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

export function appOrigin(): string {
  return (env.PUBLIC_APP_ORIGIN || location.origin).replace(/\/+$/, '');
}

class SessionState {
  status = $state<'loading' | 'signed-out' | 'signed-in' | 'error'>('loading');
  account = $state<Account | null>(null);
  ctx = $state.raw<PublishContext | null>(null);
  error = $state('');
  #client: BrowserOAuthClient | null = null;
  #session: OAuthSession | null = null;

  async #getClient(): Promise<BrowserOAuthClient> {
    if (this.#client) return this.#client;
    // Local dev uses a loopback client (no hosted metadata needed); deployed
    // builds serve their metadata from /client-metadata.json.
    const clientId = isLoopback(location.hostname)
      ? `${buildLoopbackClientId(location)}&scope=${encodeURIComponent(OAUTH_SCOPE)}`
      : `${location.origin}/client-metadata.json`;
    this.#client = await BrowserOAuthClient.load({ clientId, handleResolver: HANDLE_RESOLVER });
    return this.#client;
  }

  async init() {
    try {
      const client = await this.#getClient();
      const result = await client.init();
      if (result?.session) await this.#use(result.session);
      else this.status = 'signed-out';
    } catch (err) {
      console.error(err);
      this.error = err instanceof Error ? err.message : String(err);
      this.status = 'signed-out';
    }
  }

  async #use(session: OAuthSession) {
    this.#session = session;
    const did = session.sub;
    let account: Account = { did, handle: did };
    try {
      const { data } = await getPublicAgent().getProfile({ actor: did });
      account = { did, handle: data.handle, displayName: data.displayName, avatar: data.avatar };
    } catch {
      // New accounts may not be indexed yet; the DID is enough to publish.
    }
    this.account = account;
    this.ctx = {
      agent: new Agent(session),
      did,
      handle: account.handle,
      displayName: account.displayName,
      appOrigin: appOrigin(),
    };
    this.status = 'signed-in';
  }

  async signIn(handle: string) {
    this.error = '';
    const client = await this.#getClient();
    // Redirects away; the draft is autosaved and restored on return.
    await client.signIn(handle.trim().replace(/^@/, ''), { scope: OAUTH_SCOPE });
  }

  async signOut() {
    try {
      await this.#session?.signOut();
    } finally {
      this.#session = null;
      this.ctx = null;
      this.account = null;
      this.status = 'signed-out';
    }
  }
}

export const session = new SessionState();
