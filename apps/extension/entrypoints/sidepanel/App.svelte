<script lang="ts">
  import { onMount } from 'svelte';
  import { indexedDbDraftStore } from '@spool/core/browser';
  import { Composer, ComposerSkeleton, Icon, Logo, tooltip, type PageContext } from '@spool/ui';
  import { currentPage } from '../../lib/page.ts';
  import { syncPrefsStore } from '../../lib/prefs.ts';
  import { SPOOL_ORIGIN, session } from '../../lib/session.svelte.ts';

  const prefsStore = syncPrefsStore();
  const draftStore = indexedDbDraftStore();

  let page = $state<PageContext | null>(null);
  let pageLoaded = $state(false);
  let signingIn = $state(false);
  let handle = $state('');
  let busy = $state(false);
  let signInError = $state('');

  async function refreshPage() {
    try {
      page = await currentPage();
    } catch {
      page = null;
    }
  }

  onMount(() => {
    session.init();
    refreshPage().finally(() => (pageLoaded = true));
    // Pressing the shortcut again, or coming back to the panel, picks up the current page.
    const onFocus = () => refreshPage();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  });

  const HANDLE_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i;

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const v = handle.trim().replace(/^@/, '');
    if (!v) return;
    if (!v.startsWith('did:') && !HANDLE_RE.test(v)) {
      signInError = 'Handles look like name.bsky.social or yourdomain.com.';
      return;
    }
    busy = true;
    signInError = '';
    try {
      await session.signIn(handle);
      signingIn = false;
    } catch (err) {
      signInError = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="panel">
  <header>
    <Logo size={24} />
    <div class="right">
      {#if session.status === 'signed-in' && session.account}
        {#if session.account.avatar}
          <img class="avatar" src={session.account.avatar} alt="" title="@{session.account.handle}" />
        {/if}
        <button class="sp-icon-btn" onclick={() => session.signOut()} aria-label="Sign out" {@attach tooltip()}>
          <Icon name="logout" size={18} />
        </button>
      {:else if session.status === 'signed-out'}
        <button class="sp-btn small" onclick={() => (signingIn = !signingIn)}>Sign in</button>
      {/if}
    </div>
  </header>

  {#if session.status === 'unconfigured'}
    <div class="note">
      <strong>Almost there.</strong>
      Build the extension with <code>WXT_SPOOL_ORIGIN</code> set to your Spool web app so it can sign you in and host your
      articles.
    </div>
  {/if}

  {#if signingIn && session.status === 'signed-out'}
    <form class="signin" onsubmit={submit}>
      <label for="h">Your handle</label>
      <div class="row">
        <input
          id="h"
          class="sp-input"
          bind:value={handle}
          oninput={() => (signInError = '')}
          aria-invalid={!!signInError}
          placeholder="you.bsky.social"
          autocapitalize="off"
          spellcheck="false"
          autocomplete="username"
        />
        <button class="sp-btn sp-btn-primary" disabled={busy || !handle.trim()}>{busy ? '…' : 'Go'}</button>
      </div>
      {#if signInError}<p class="err" role="alert">{signInError}</p>{/if}
      <p class="fine">Spool can only create posts, publish articles and upload images.</p>
    </form>
  {/if}

  <main id="main">
    <!-- Wait for the page (local and quick; the Composer reads it on mount), not the session (network). -->
    {#if !pageLoaded}
      <ComposerSkeleton />
    {:else}
      <Composer
        publisher={session.publisher}
        account={session.account}
        {prefsStore}
        {draftStore}
        appOrigin={SPOOL_ORIGIN}
        pageContext={page}
        onRequestSignIn={() => session.status !== 'loading' && (signingIn = true)}
      />
    {/if}
  </main>
</div>

<style>
  .panel {
    min-height: 100dvh;
    padding: 0 14px 20px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
  }
  header :global(.word) {
    font-size: 19px;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
  }
  .small {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  .note {
    margin-bottom: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--sp-accent-soft);
    font-size: 13px;
  }
  .note code {
    font-size: 12px;
  }
  .signin {
    display: grid;
    gap: 8px;
    margin-bottom: 14px;
    padding: 14px;
    border-radius: 14px;
    background: var(--sp-surface);
    border: 1px solid var(--sp-line);
    animation: drop 0.2s var(--sp-ease);
  }
  .signin label {
    font-size: 13px;
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .row .sp-btn {
    height: 40px;
  }
  .err {
    margin: 0;
    font-size: 13px;
    color: var(--sp-danger);
  }
  .fine {
    margin: 0;
    font-size: 12px;
    color: var(--sp-muted);
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
