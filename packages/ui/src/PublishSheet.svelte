<script lang="ts">
  import Icon from './Icon.svelte';
  import type { SheetState } from './lib/types.ts';

  let {
    state,
    onretry,
    ondismiss,
    onnew,
  }: {
    state: SheetState;
    onretry: () => void;
    ondismiss: () => void;
    onnew: () => void;
  } = $props();

  const pct = $derived(
    state.kind === 'publishing' ? Math.round((state.progress.done / Math.max(state.progress.total, 1)) * 100) : 100,
  );
  const doneTitle = $derived.by(() => {
    if (state.kind !== 'done') return '';
    const r = state.result;
    return r.kind === 'post'
      ? 'Posted'
      : r.kind === 'thread'
        ? `Thread posted · ${r.count} posts`
        : 'Article published';
  });
</script>

<div class="sheet" role="status" aria-live="polite">
  <div class="panel">
    {#if state.kind === 'publishing'}
      <div class="spinner" aria-hidden="true"></div>
      <p class="title">{state.progress.step}</p>
      <div class="bar"><span style:transform="scaleX({pct / 100})"></span></div>
    {:else if state.kind === 'done'}
      <div class="badge ok"><Icon name="check" size={26} stroke={2.4} /></div>
      <p class="title">{doneTitle}</p>
      <div class="actions">
        {#if state.result.kind === 'article'}
          <a class="sp-btn sp-btn-primary" href={state.result.url} target="_blank" rel="noopener">
            Read article <Icon name="external" size={16} />
          </a>
          <a class="sp-btn" href={state.result.postUrl} target="_blank" rel="noopener">
            Open on Bluesky <Icon name="external" size={16} />
          </a>
        {:else}
          <a class="sp-btn sp-btn-primary" href={state.result.url} target="_blank" rel="noopener">
            Open on Bluesky <Icon name="external" size={16} />
          </a>
        {/if}
        <button type="button" class="sp-link" onclick={onnew}>Write another</button>
      </div>
    {:else}
      <div class="badge err"><Icon name="alert" size={24} stroke={2} /></div>
      <p class="title">
        {#if state.partial}
          {state.partial.done} of {state.partial.total} posts went out
        {:else}
          Couldn't publish
        {/if}
      </p>
      <p class="detail">{state.message}</p>
      <div class="actions">
        <button type="button" class="sp-btn sp-btn-primary" onclick={onretry}>
          {state.partial ? 'Finish the thread' : 'Try again'}
        </button>
        <button type="button" class="sp-link" onclick={ondismiss}>Back to draft</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .sheet {
    position: absolute;
    inset: 0;
    z-index: var(--sp-z-sheet);
    display: grid;
    place-items: center;
    padding: 24px;
    border-radius: inherit;
    background: color-mix(in srgb, var(--sp-surface) 78%, transparent);
    backdrop-filter: blur(8px);
    animation: fade 0.2s var(--sp-ease);
  }
  .panel {
    display: grid;
    justify-items: center;
    gap: 12px;
    text-align: center;
    max-width: 360px;
    animation: rise 0.3s var(--sp-ease);
  }
  .title {
    margin: 0;
    font-family: var(--sp-font-serif);
    font-size: 24px;
    font-weight: 550;
    letter-spacing: -0.01em;
  }
  .detail {
    margin: 0;
    color: var(--sp-ink-2);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .bar {
    width: 220px;
    height: 4px;
    border-radius: 4px;
    background: var(--sp-line);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--sp-accent);
    transform-origin: left;
    transition: transform 0.3s var(--sp-ease);
  }
  .spinner {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid var(--sp-line);
    border-top-color: var(--sp-accent);
    animation: spin 0.8s linear infinite;
  }
  .badge {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: grid;
    place-items: center;
  }
  .badge.ok {
    background: var(--sp-accent);
    color: var(--sp-accent-ink);
    animation: pop 0.35s var(--sp-ease);
  }
  .badge.err {
    background: color-mix(in srgb, var(--sp-danger) 14%, transparent);
    color: var(--sp-danger);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 6px;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @keyframes pop {
    0% {
      transform: scale(0.6);
    }
    70% {
      transform: scale(1.08);
    }
  }
</style>
