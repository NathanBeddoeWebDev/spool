<script lang="ts">
  import { onMount } from 'svelte';
  import type { ScheduledPost } from '@spool/core';
  import { indexedDbDraftStore, localStoragePrefsStore } from '@spool/core/browser';
  import { Composer, Icon, Logo, tooltip } from '@spool/ui';
  import { appOrigin, session } from '$lib/session.svelte.ts';
  import Scheduled from './Scheduled.svelte';
  import SignIn from './SignIn.svelte';

  const prefsStore = localStoragePrefsStore();
  const draftStore = indexedDbDraftStore();
  let signInOpen = $state(false);
  let scheduledOpen = $state(false);
  let composer = $state<ReturnType<typeof Composer>>();

  const waiting = $derived(session.scheduled.filter((p) => p.status !== 'published').length);
  const needsAttention = $derived(session.scheduled.some((p) => p.status === 'failed'));

  onMount(() => {
    session.init().then(() => {
      // Coming back from a failed sign-in: show why.
      if (session.error && session.status === 'signed-out') signInOpen = true;
    });
  });

  async function edit(post: ScheduledPost) {
    if (composer && !composer.isEmpty() && !confirm('Replace the draft you’re writing with this scheduled one?')) {
      return;
    }
    const draft = await session.unschedule(post.id, true);
    composer?.replaceDraft(draft);
    scheduledOpen = false;
  }
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
        <button
          class="sp-btn sp-btn-ghost scheduled"
          class:attention={needsAttention}
          onclick={() => (scheduledOpen = true)}
          aria-label={needsAttention ? 'Scheduled posts (one needs attention)' : 'Scheduled posts'}
        >
          <Icon name="clock" size={18} />
          <span class="label">Scheduled</span>
          {#if waiting}<span class="count">{waiting}</span>{/if}
        </button>
        <span class="me">
          {#if session.account.avatar}<img src={session.account.avatar} alt="" />{/if}
          <span>@{session.account.handle}</span>
        </span>
        <button class="sp-icon-btn" onclick={() => session.signOut()} aria-label="Sign out" {@attach tooltip()}>
          <Icon name="logout" size={18} />
        </button>
      {:else if session.status !== 'loading'}
        <button class="sp-btn" onclick={() => (signInOpen = true)}>Sign in</button>
      {/if}
    </div>
  </header>

  <main id="main">
    <!-- Not gated on the session: restoring it takes network round trips, and writing doesn't need it. -->
    <Composer
      bind:this={composer}
      publisher={session.status === 'signed-in' ? session.publisher : null}
      account={session.account}
      {prefsStore}
      {draftStore}
      appOrigin={appOrigin()}
      onRequestSignIn={() => session.status !== 'loading' && (signInOpen = true)}
      onShowScheduled={() => (scheduledOpen = true)}
    />
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
{#if session.status === 'signed-in'}
  <Scheduled bind:open={scheduledOpen} onedit={edit} />
{/if}

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
  .scheduled {
    gap: 6px;
    height: 34px;
    padding: 0 10px;
    font-size: 14px;
  }
  .scheduled .count {
    min-width: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--sp-sunken);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .scheduled.attention .count {
    background: var(--sp-danger);
    color: #fff;
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
    .me span,
    .scheduled .label {
      display: none;
    }
  }
</style>
