<script lang="ts">
  import { Icon, tooltip } from '@spool/ui';

  let {
    open = $bindable(false),
    onsubmit,
    error = '',
  }: { open: boolean; onsubmit: (handle: string) => Promise<void>; error?: string } = $props();

  let dialog = $state<HTMLDialogElement>();
  let handle = $state('');
  let busy = $state(false);
  let suggestions = $state<Array<{ handle: string; displayName?: string; avatar?: string }>>([]);
  let localError = $state('');
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function lookup() {
    clearTimeout(timer);
    const q = handle.trim().replace(/^@/, '');
    if (q.length < 2) {
      suggestions = [];
      return;
    }
    timer = setTimeout(async () => {
      try {
        const { getPublicAgent } = await import('@spool/core/richtext');
        const { data } = await getPublicAgent().app.bsky.actor.searchActorsTypeahead({ q, limit: 5 });
        suggestions = data.actors.map((a) => ({ handle: a.handle, displayName: a.displayName, avatar: a.avatar }));
      } catch {
        suggestions = [];
      }
    }, 180);
  }

  const HANDLE_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i;

  function valid(value: string) {
    const v = value.trim().replace(/^@/, '');
    return v.startsWith('did:') || HANDLE_RE.test(v);
  }

  async function submit(value = handle) {
    if (!value.trim()) return;
    if (!valid(value)) {
      localError = 'That doesn’t look like a handle. Handles look like name.bsky.social or yourdomain.com.';
      return;
    }
    busy = true;
    localError = '';
    try {
      await onsubmit(value);
    } catch (err) {
      localError = err instanceof Error ? err.message : String(err);
      busy = false;
    }
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="signin-title">
  <form
    method="dialog"
    onsubmit={(e) => {
      e.preventDefault();
      submit();
    }}
  >
    <button
      type="button"
      class="sp-icon-btn close"
      aria-label="Close"
      {@attach tooltip()}
      onclick={() => (open = false)}
    >
      <Icon name="x" />
    </button>
    <h2 id="signin-title">Sign in to post</h2>
    <p>Use your Bluesky handle, or any atproto account. Your draft stays put while you’re away.</p>
    <label for="handle" class="label">Handle</label>
    <input
      id="handle"
      class="sp-input"
      type="text"
      autocomplete="username"
      autocapitalize="off"
      spellcheck="false"
      placeholder="you.bsky.social"
      bind:value={handle}
      oninput={() => {
        localError = '';
        lookup();
      }}
      aria-invalid={!!localError}
      aria-describedby={localError ? 'handle-error' : undefined}
    />
    {#if suggestions.length}
      <ul class="suggestions">
        {#each suggestions as s (s.handle)}
          <li>
            <button type="button" onclick={() => submit(s.handle)}>
              {#if s.avatar}<img src={s.avatar} alt="" />{:else}<span class="dot"></span>{/if}
              <span class="who">
                <strong>{s.displayName || s.handle}</strong>
                <small>@{s.handle}</small>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if localError || error}<p class="error" id="handle-error" role="alert">{localError || error}</p>{/if}
    <button class="sp-btn sp-btn-primary submit" type="submit" disabled={busy || !handle.trim()}>
      {busy ? 'Redirecting…' : 'Continue'}
    </button>
    <p class="fine">
      Spool asks only to create posts, publish articles and upload images. It can’t read your DMs or change your
      profile.
    </p>
  </form>
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - 32px));
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
  form {
    position: relative;
    display: grid;
    gap: 10px;
    padding: 26px 24px 22px;
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
  p {
    margin: 0;
    color: var(--sp-ink-2);
    font-size: 14px;
  }
  .label {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .suggestions {
    list-style: none;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--sp-line);
    border-radius: 12px;
    background: var(--sp-raised);
  }
  .suggestions button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .suggestions button:hover {
    background: var(--sp-sunken);
  }
  .sp-input[aria-invalid='true'] {
    border-color: var(--sp-danger);
  }
  .suggestions img,
  .dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--sp-accent-soft);
    flex: none;
  }
  .who {
    display: grid;
    line-height: 1.25;
    min-width: 0;
  }
  .who small {
    color: var(--sp-muted);
  }
  .submit {
    margin-top: 6px;
    height: 42px;
  }
  .error {
    color: var(--sp-danger);
  }
  .fine {
    font-size: 12px;
    color: var(--sp-muted);
  }
</style>
