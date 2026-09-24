<script lang="ts">
  import type { ScheduledPost } from '@spool/core';
  import { Icon, formatWhen, toLocalInput } from '@spool/ui';
  import { session } from '$lib/session.svelte.ts';

  let {
    open = $bindable(false),
    onedit,
  }: {
    open: boolean;
    /** Take a post off the schedule and back into the composer. */
    onedit: (post: ScheduledPost) => Promise<void>;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  let busy = $state<string | null>(null);
  let problem = $state('');
  let moving = $state<string | null>(null);
  let moveTo = $state('');

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  // Keep statuses fresh while the list is open.
  $effect(() => {
    if (!open) return;
    const refresh = () => session.refreshScheduled().catch((err) => (problem = String(err.message ?? err)));
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  });

  const failed = $derived(session.scheduled.filter((p) => p.status === 'failed'));
  const upcoming = $derived(session.scheduled.filter((p) => p.status === 'scheduled' || p.status === 'publishing'));
  const published = $derived(session.scheduled.filter((p) => p.status === 'published').reverse());

  async function act(post: ScheduledPost, fn: () => Promise<unknown>) {
    busy = post.id;
    problem = '';
    try {
      await fn();
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err);
    } finally {
      busy = null;
    }
  }

  const cancel = (post: ScheduledPost) =>
    confirm('Cancel this post? It will be deleted. Use Edit to keep it as a draft instead.') &&
    act(post, () => session.unschedule(post.id));

  function startMove(post: ScheduledPost) {
    moving = post.id;
    moveTo = toLocalInput(new Date(post.publishAt));
  }

  function move(post: ScheduledPost) {
    const at = new Date(moveTo);
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) {
      problem = 'Pick a time in the future.';
      return;
    }
    act(post, async () => {
      await session.reschedule(post.id, at);
      moving = null;
    });
  }

  function what(post: ScheduledPost): string {
    if (post.kind === 'article') return 'Article';
    const images = post.images ? ` · ${post.images} image${post.images === 1 ? '' : 's'}` : '';
    return (post.kind === 'thread' ? `Thread of ${post.count}` : 'Post') + images;
  }
</script>

{#snippet item(post: ScheduledPost)}
  <li class="item" class:failed={post.status === 'failed'} aria-busy={busy === post.id}>
    <div class="head">
      <Icon name={post.kind === 'article' ? 'article' : post.kind === 'thread' ? 'thread' : 'clock'} size={16} />
      <span class="when">
        {#if post.status === 'publishing'}
          Publishing now…
        {:else if post.status === 'published'}
          Published {formatWhen(post.publishAt)}
        {:else}
          {formatWhen(post.publishAt)}
        {/if}
      </span>
      <span class="what">{what(post)}</span>
    </div>
    <p class="summary">{post.summary}</p>
    {#if post.status === 'failed'}
      <p class="error">Couldn’t publish: {post.error}</p>
    {:else if post.status === 'scheduled' && post.error && post.retryAt}
      <p class="error">The last try failed ({post.error}). Trying again {formatWhen(post.retryAt)}.</p>
    {/if}

    {#if moving === post.id}
      <div class="move">
        <input class="sp-input" type="datetime-local" bind:value={moveTo} min={toLocalInput(new Date())} />
        <button type="button" class="sp-btn sp-btn-primary small" disabled={!!busy} onclick={() => move(post)}>
          Save
        </button>
        <button type="button" class="sp-link" onclick={() => (moving = null)}>Never mind</button>
      </div>
    {:else}
      <div class="actions">
        {#if post.status === 'published' && post.result}
          <a class="sp-btn small" href={post.result.url} target="_blank" rel="noopener">
            Open <Icon name="external" size={14} />
          </a>
          <button
            type="button"
            class="sp-link"
            disabled={!!busy}
            onclick={() => act(post, () => session.unschedule(post.id))}
          >
            Remove from list
          </button>
        {:else if post.status !== 'publishing'}
          {#if post.status === 'failed'}
            <button
              type="button"
              class="sp-btn sp-btn-primary small"
              disabled={!!busy}
              onclick={() => act(post, () => session.reschedule(post.id, new Date()))}
            >
              Try again now
            </button>
          {/if}
          <button type="button" class="sp-btn small" disabled={!!busy} onclick={() => act(post, () => onedit(post))}>
            Edit
          </button>
          <button type="button" class="sp-btn small" disabled={!!busy} onclick={() => startMove(post)}>
            Change time
          </button>
          <button type="button" class="sp-link" disabled={!!busy} onclick={() => cancel(post)}>
            {post.status === 'failed' ? 'Delete' : 'Cancel'}
          </button>
        {/if}
      </div>
    {/if}
  </li>
{/snippet}

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="scheduled-title">
  <div class="body">
    <button type="button" class="sp-icon-btn close" aria-label="Close" onclick={() => (open = false)}>
      <Icon name="x" />
    </button>
    <h2 id="scheduled-title">Scheduled</h2>
    <p class="intro">These go out from Spool’s server at the time you picked, even with this tab closed.</p>

    {#if problem}<p class="problem" role="alert">{problem}</p>{/if}

    {#if failed.length}
      <h3 class="sp-kicker">Needs attention</h3>
      <ul>
        {#each failed as post (post.id)}{@render item(post)}{/each}
      </ul>
    {/if}

    <h3 class="sp-kicker">Coming up</h3>
    {#if upcoming.length}
      <ul>
        {#each upcoming as post (post.id)}{@render item(post)}{/each}
      </ul>
    {:else}
      <p class="empty">Nothing scheduled. Use the clock next to Post to pick a time.</p>
    {/if}

    {#if published.length}
      <h3 class="sp-kicker">Published this week</h3>
      <ul>
        {#each published as post (post.id)}{@render item(post)}{/each}
      </ul>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: min(720px, calc(100dvh - 48px));
    padding: 0;
    border: 1px solid var(--sp-line);
    border-radius: 20px;
    background: var(--sp-surface);
    color: var(--sp-ink);
    box-shadow: var(--sp-shadow-lg);
  }
  dialog::backdrop {
    background: rgb(20 18 15 / 0.35);
    backdrop-filter: blur(3px);
  }
  .body {
    position: relative;
    display: grid;
    gap: 10px;
    padding: 26px 24px 24px;
  }
  .close {
    position: absolute;
    top: 12px;
    right: 12px;
  }
  h2 {
    margin: 0;
    font-family: var(--sp-font-serif);
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  h3 {
    margin: 12px 0 0;
  }
  .intro,
  .empty {
    margin: 0;
    color: var(--sp-ink-2);
    font-size: 14px;
  }
  .empty {
    color: var(--sp-muted);
  }
  .problem {
    margin: 0;
    color: var(--sp-danger);
    font-size: 14px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .item {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border: 1px solid var(--sp-line);
    border-radius: 14px;
    background: var(--sp-raised);
    transition: opacity 0.2s var(--sp-ease);
  }
  .item[aria-busy='true'] {
    opacity: 0.6;
  }
  .item.failed {
    border-color: color-mix(in srgb, var(--sp-danger) 40%, var(--sp-line));
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--sp-ink-2);
  }
  .when {
    font-weight: 600;
    color: var(--sp-ink);
    font-variant-numeric: tabular-nums;
  }
  .what {
    margin-left: auto;
    color: var(--sp-muted);
  }
  .summary {
    margin: 0;
    font-family: var(--sp-font-serif);
    font-size: 16px;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .error {
    margin: 0;
    font-size: 13px;
    color: var(--sp-danger);
  }
  .actions,
  .move {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .move .sp-input {
    width: auto;
    flex: 1;
    min-width: 200px;
  }
  .small {
    height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
</style>
