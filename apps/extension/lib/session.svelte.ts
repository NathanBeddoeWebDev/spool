import type { BrowserOAuthClient, OAuthSession } from '@atproto/oauth-client-browser';
import { HANDLE_RESOLVER, OAUTH_SCOPE, type PublishContext, type Publisher } from '@spool/core';
import type { Account } from '@spool/ui';

export const SPOOL_ORIGIN = (import.meta.env.WXT_SPOOL_ORIGIN ?? '').replace(/\/+$/, '');

// Publishing pulls in @atproto/api, so it isn't loaded up front.
const loadPublish = () => import('@spool/core/publish');

/** Publishes straight from the panel. The extension can't schedule: that needs the web app's server. */
function directPublisher(ctx: PublishContext): Publisher {
  // Fetch it now there's a session, well before the user gets to the button.
  loadPublish().catch(() => {});
  return {
    publish: async (kind, draft, hooks) => (await loadPublish()).publishDraft(ctx, kind, draft, hooks),
  };
}

/**
 * OAuth for the extension. The client metadata lives on the web app
 * (/extension-client-metadata.json) and lists this extension's identity
 * redirect URI. The authorization page runs in a browser.identity window,
 * which hands the redirect URL back to us without a real page load.
 */
class ExtensionSession {
  status = $state<'loading' | 'signed-out' | 'signed-in' | 'unconfigured'>('loading');
  account = $state<Account | null>(null);
  publisher = $state.raw<Publisher | null>(null);
  error = $state('');
  #client: BrowserOAuthClient | null = null;
  #session: OAuthSession | null = null;

  get redirectUri(): string {
    return browser.identity.getRedirectURL();
  }

  async #getClient() {
    if (this.#client) return this.#client;
    // Loaded on demand so the composer doesn't wait for the OAuth and API libraries.
    const { BrowserOAuthClient } = await import('@atproto/oauth-client-browser');
    this.#client ??= await BrowserOAuthClient.load({
      clientId: `${SPOOL_ORIGIN}/extension-client-metadata.json`,
      handleResolver: HANDLE_RESOLVER,
    });
    return this.#client;
  }

  async init() {
    if (!SPOOL_ORIGIN) {
      this.status = 'unconfigured';
      return;
    }
    try {
      const result = await (await this.#getClient()).initRestore();
      if (result?.session) await this.#use(result.session);
      else this.status = 'signed-out';
    } catch (err) {
      console.error(err);
      this.status = 'signed-out';
    }
  }

  async signIn(handle: string) {
    this.error = '';
    const client = await this.#getClient();
    const redirect_uri = this.redirectUri as `https://${string}`;
    const url = await client.authorize(handle.trim().replace(/^@/, ''), { scope: OAUTH_SCOPE, redirect_uri });
    const returned = await browser.identity.launchWebAuthFlow({ url: url.href, interactive: true });
    if (!returned) throw new Error('Sign-in was cancelled');
    const back = new URL(returned);
    const params = new URLSearchParams(back.hash.slice(1) || back.search.slice(1));
    const { session } = await client.callback(params, { redirect_uri });
    // restore() also records this account as the one to resume next time.
    await this.#use(await client.restore(session.sub));
  }

  async #use(session: OAuthSession) {
    this.#session = session;
    const did = session.sub;
    const [{ Agent }, { getPublicAgent }] = await Promise.all([import('@atproto/api'), import('@spool/core/richtext')]);
    let account: Account = { did, handle: did };
    try {
      const { data } = await getPublicAgent().getProfile({ actor: did });
      account = { did, handle: data.handle, displayName: data.displayName, avatar: data.avatar };
    } catch {
      // Not indexed yet; publishing only needs the DID.
    }
    this.account = account;
    this.publisher = directPublisher({
      agent: new Agent(session),
      did,
      handle: account.handle,
      displayName: account.displayName,
      appOrigin: SPOOL_ORIGIN,
    });
    this.status = 'signed-in';
  }

  async signOut() {
    try {
      await this.#session?.signOut();
    } finally {
      this.#session = null;
      this.publisher = null;
      this.account = null;
      this.status = 'signed-out';
    }
  }
}

export const session = new ExtensionSession();
