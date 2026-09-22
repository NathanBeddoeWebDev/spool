<script lang="ts">
  import { onMount } from 'svelte';
  import { indexedDbDraftStore, localStoragePrefsStore } from '@spool/core/browser';
  import { Composer, ComposerSkeleton, Icon, Logo } from '@spool/ui';
  import { appOrigin, session } from '$lib/session.svelte.ts';
  import SignIn from './SignIn.svelte';

  const prefsStore = localStoragePrefsStore();
  const draftStore = indexedDbDraftStore();
  let signInOpen = $state(false);

  onMount(() => {
    session.init();
  });
</script>

<svelte:head>
  <title>Spool: write for Bluesky without the feed</title>
  <meta
    name="description"
    content="A quiet place to write posts, threads and articles for Bluesky and the Atmosphere."
  />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Spool" />
  <meta
    property="og:description"
    content="Write for Bluesky without the feed. Long posts become threads or articles you own."
  />
  <meta property="og:image" content="{appOrigin()}/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="page">
  <header>
    <Logo />
    <div class="account">
      {#if session.status === 'signed-in' && session.account}
        <span class="me">
          {#if session.account.avatar}<img src={session.account.avatar} alt="" />{/if}
          <span>@{session.account.handle}</span>
        </span>
        <button class="sp-icon-btn" onclick={() => session.signOut()} aria-label="Sign out" title="Sign out">
          <Icon name="logout" size={18} />
        </button>
      {:else if session.status !== 'loading'}
        <button class="sp-btn" onclick={() => (signInOpen = true)}>Sign in</button>
      {/if}
    </div>
  </header>

  <main id="main">
    {#if session.status === 'loading'}
      <ComposerSkeleton />
    {:else}
      <Composer
        ctx={session.ctx}
        account={session.account}
        {prefsStore}
        {draftStore}
        appOrigin={appOrigin()}
        onRequestSignIn={() => (signInOpen = true)}
      />
    {/if}
  </main>

  <footer>
    <span
      >Posts go straight to your PDS. Articles are <a href="https://standard.site" target="_blank" rel="noopener"
        >standard.site</a
      > documents you own.</span
    >
    <a href="/privacy">Privacy</a>
  </footer>
</div>

<SignIn bind:open={signInOpen} onsubmit={(h) => session.signIn(h)} error={session.error} />

<style>
  .page {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 20px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
  }
  .account {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .me {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--sp-ink-2);
  }
  .me img {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
  }
  main {
    padding: 12px 0 40px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 24px;
    padding: 20px 0 32px;
    font-size: 13px;
    color: var(--sp-muted);
  }
  footer a {
    color: inherit;
  }
  @media (max-width: 520px) {
    .page {
      padding: 0 14px;
    }
    .me span {
      display: none;
    }
  }
</style>
