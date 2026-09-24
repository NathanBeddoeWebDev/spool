<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    DEFAULT_PREFS,
    MAX_IMAGES_PER_POST,
    POST_GRAPHEME_LIMIT,
    articleParts,
    defaultShareText,
    distributeImages,
    extractTitle,
    measure,
    newDraft,
    splitThread,
    type Draft,
    type DraftStore,
    type OverflowMode,
    type Prefs,
    type PrefsStore,
    type PublishKind,
    type Publisher,
  } from '@spool/core';
  import { prepareImage } from '@spool/core/browser';
  import CountRing from './CountRing.svelte';
  import Icon from './Icon.svelte';
  import ImageTray from './ImageTray.svelte';
  import PostCard from './PostCard.svelte';
  import PublishSheet from './PublishSheet.svelte';
  import { wordCount } from './lib/preview.svelte.ts';
  import type { Account, PageContext, SheetState } from './lib/types.ts';
  import { formatWhen, toLocalInput } from './lib/when.ts';

  interface Props {
    /** Null when signed out: writing works, publishing asks to sign in. */
    publisher: Publisher | null;
    account: Account | null;
    prefsStore: PrefsStore;
    draftStore: DraftStore;
    /** Origin that serves articles; used for the link card preview. */
    appOrigin: string;
    onRequestSignIn: () => void;
    /** Extension only: the page the user was on. */
    pageContext?: PageContext | null;
    /** Opens the list of scheduled posts, where the app has one. */
    onShowScheduled?: () => void;
  }

  let {
    publisher,
    account,
    prefsStore,
    draftStore,
    appOrigin,
    onRequestSignIn,
    pageContext = null,
    onShowScheduled,
  }: Props = $props();

  const MAX_THREAD_IMAGES = 40;

  let draft = $state<Draft>(newDraft());
  let prefs = $state<Prefs>({ ...DEFAULT_PREFS });
  let ready = $state(false);
  let tab = $state<'write' | 'preview'>('write');
  let remember = $state(false);
  let sheet = $state<SheetState | null>(null);
  let settingsOpen = $state(false);
  let dragging = $state(false);
  let notice = $state('');
  let textarea = $state<HTMLTextAreaElement>();
  let fileInput = $state<HTMLInputElement>();
  let settingsEl = $state<HTMLElement>();
  let scheduleOpen = $state(false);
  let scheduleEl = $state<HTMLElement>();
  let scheduleAt = $state('');
  let scheduleError = $state('');
  /** What the error sheet's retry button should repeat. */
  let lastAttempt: { action: 'publish' } | { action: 'schedule'; at: Date } = { action: 'publish' };

  function defaultLangs(): string[] {
    const lang = typeof navigator !== 'undefined' ? navigator.language?.split('-')[0] : undefined;
    return lang ? [lang] : [];
  }

  function freshDraft(): Draft {
    return newDraft({ numbering: prefs.numbering, langs: defaultLangs() });
  }

  onMount(() => {
    (async () => {
      prefs = await prefsStore.get();
      draft = (await draftStore.load()) ?? freshDraft();
      if (pageContext && !draft.text.trim()) await insertPage(pageContext);
      ready = true;
      await tick();
      textarea?.focus();
    })();
  });

  // Autosave: every change to the draft is persisted shortly after typing stops.
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const snapshot = $state.snapshot(draft) as Draft;
    if (!ready) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => draftStore.save({ ...snapshot, updatedAt: new Date().toISOString() }), 300);
  });

  // Grow the textarea with its content.
  $effect(() => {
    void draft.text;
    void mode;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  });

  const trimmed = $derived(draft.text.trim());
  const length = $derived(measure(trimmed));
  const overflow = $derived(length > POST_GRAPHEME_LIMIT || draft.images.length > MAX_IMAGES_PER_POST);
  /** What we'd use for an overflowing draft if the writer doesn't pick. */
  const preferred = $derived<OverflowMode>(
    draft.mode ?? (prefs.overflowMode === 'ask' ? prefs.lastChoice : prefs.overflowMode),
  );
  const mode = $derived<'post' | OverflowMode>(draft.mode === 'article' ? 'article' : overflow ? preferred : 'post');
  const asking = $derived(overflow && prefs.overflowMode === 'ask' && draft.mode === null);

  const threadSegments = $derived(overflow ? splitThread(draft.text, { numbering: draft.numbering }) : []);
  const segments = $derived(mode === 'thread' ? threadSegments : []);
  const imageGroups = $derived(mode === 'thread' ? distributeImages(segments.length, draft.images.length) : []);
  const threadCount = $derived(Math.max(threadSegments.length, Math.ceil(draft.images.length / MAX_IMAGES_PER_POST)));
  const article = $derived(mode === 'article' ? articleParts(draft.text, draft.title) : null);
  const shareDefault = $derived(article ? defaultShareText(article.title, article.description) : '');
  const words = $derived(wordCount(draft.text));
  const usableImages = $derived(mode === 'post' ? 4 : mode === 'article' ? 1 : MAX_THREAD_IMAGES);

  const partial = $derived.by(() => {
    const p = draft.threadProgress;
    if (!p) return null;
    const done = p.created.filter(Boolean).length;
    return done > 0 ? { done, total: p.texts.length } : null;
  });

  const canPublish = $derived(
    ready &&
      sheet?.kind !== 'publishing' &&
      (trimmed.length > 0 || (mode !== 'article' && draft.images.length > 0)) &&
      (mode !== 'article' || !!article?.title),
  );

  const publishLabel = $derived.by(() => {
    if (!publisher) return 'Sign in to post';
    if (partial) return 'Finish thread';
    if (mode === 'thread') return `Post thread · ${threadCount}`;
    if (mode === 'article') return 'Publish article';
    return 'Post';
  });

  const imageNote = $derived.by(() => {
    if (!draft.images.length) return '';
    if (mode === 'article') {
      return draft.images.length > 1
        ? 'Articles use the first image as the cover. The rest are ignored.'
        : 'This image becomes the article cover and link card.';
    }
    if (mode === 'thread' && draft.images.length > 4) return 'Images are spread across the thread, four per post.';
    return '';
  });

  async function choose(m: OverflowMode) {
    draft.mode = m;
    if (m === 'article' && !draft.title.trim()) {
      // "# Heading" on the first line becomes the title field instead of body text.
      const lifted = extractTitle(draft.text);
      if (lifted.title) {
        draft.title = lifted.title;
        draft.text = lifted.body;
      }
    }
    prefs = await prefsStore.set(remember ? { lastChoice: m, overflowMode: m } : { lastChoice: m });
  }

  async function setArticle(on: boolean) {
    if (on) await choose('article');
    else draft.mode = overflow ? 'thread' : null;
    await tick();
    textarea?.focus();
  }

  async function setOverflowPref(value: Prefs['overflowMode']) {
    prefs = await prefsStore.set({ overflowMode: value, ...(value !== 'ask' ? { lastChoice: value } : {}) });
    if (value !== 'ask') draft.mode = draft.mode === 'article' || overflow ? value : draft.mode;
  }

  async function setNumbering(on: boolean) {
    draft.numbering = on;
    prefs = await prefsStore.set({ numbering: on });
  }

  async function addFiles(files: Iterable<File>) {
    notice = '';
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (draft.images.length >= MAX_THREAD_IMAGES) {
        notice = `That's the limit of ${MAX_THREAD_IMAGES} images.`;
        break;
      }
      try {
        draft.images.push(await prepareImage(file));
      } catch {
        notice = `Couldn't use ${file.name || 'that image'}.`;
      }
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    if (e.dataTransfer?.files.length) addFiles(Array.from(e.dataTransfer.files));
  }

  async function insertPage(p: PageContext) {
    const quote = p.selection.trim() ? `“${p.selection.trim().replace(/\s+/g, ' ')}”\n\n` : '';
    const block = `${quote}${p.url}`;
    draft.text = draft.text.trim() ? `${draft.text.trimEnd()}\n\n${block}` : `\n\n${block}`;
    await tick();
    textarea?.focus();
    textarea?.setSelectionRange(0, 0);
  }

  function describeError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (/scope|insufficient|forbidden/i.test(msg))
      return `Your sign-in doesn't allow this yet. Sign out and back in. (${msg})`;
    if (/network|fetch/i.test(msg)) return 'Network problem. Your draft is saved; try again when you’re back online.';
    return msg || 'Something went wrong.';
  }

  /** Snapshot of the draft to send, and what to send it as. */
  async function prepare(): Promise<{ kind: PublishKind; snapshot: Draft }> {
    if (asking) await choose(preferred);
    const kind = partial ? 'thread' : mode;
    const snapshot = $state.snapshot(draft) as Draft;
    if (!snapshot.langs.length) snapshot.langs = defaultLangs();
    return { kind, snapshot };
  }

  /** The draft is out of our hands: start a fresh one. */
  async function finish(next: SheetState) {
    // Stop any pending autosave from resurrecting the sent draft.
    clearTimeout(saveTimer);
    await draftStore.clear();
    draft = freshDraft();
    sheet = next;
  }

  async function publish() {
    if (!publisher) {
      await draftStore.save($state.snapshot(draft) as Draft);
      onRequestSignIn();
      return;
    }
    if (sheet?.kind === 'publishing') return;
    if (!canPublish && !partial) return;
    lastAttempt = { action: 'publish' };
    const { kind, snapshot } = await prepare();
    sheet = { kind: 'publishing', progress: { step: 'Starting', done: 0, total: 1 } };

    const hooks = {
      onProgress: (progress: { step: string; done: number; total: number }) => {
        sheet = { kind: 'publishing', progress };
      },
      onThreadProgress: async (tp: NonNullable<Draft['threadProgress']>) => {
        draft.threadProgress = tp;
        await draftStore.save($state.snapshot(draft) as Draft);
      },
    };

    try {
      await finish({ kind: 'done', result: await publisher.publish(kind, snapshot, hooks) });
    } catch (err) {
      sheet = { kind: 'error', message: describeError(err), partial: partial ?? undefined };
    }
  }

  const canSchedule = $derived(!!publisher?.schedule && !partial);

  /** Quick picks: an hour from now, and 9am on the next two mornings worth offering. */
  const quickTimes = $derived.by(() => {
    if (!scheduleOpen) return [];
    const now = new Date();
    const inAnHour = new Date(now.getTime() + 60 * 60_000);
    inAnHour.setMinutes(Math.ceil(inAnHour.getMinutes() / 5) * 5, 0, 0);
    const morning = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      d.setHours(9, 0, 0, 0);
      return d;
    };
    const tomorrow = morning(1);
    // Monday, unless that's tomorrow anyway.
    const monday = morning((8 - now.getDay()) % 7 || 7);
    return [
      { label: 'In an hour', at: inAnHour },
      { label: 'Tomorrow morning', at: tomorrow },
      ...(monday.getTime() !== tomorrow.getTime() ? [{ label: 'Monday morning', at: monday }] : []),
    ];
  });

  const scheduleDate = $derived(scheduleAt ? new Date(scheduleAt) : null);
  const timeZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';

  function toggleSchedule() {
    scheduleOpen = !scheduleOpen;
    scheduleError = '';
    // Start on the first quick pick, so it shows as chosen.
    if (scheduleOpen) scheduleAt = toLocalInput(quickTimes[0]!.at);
  }

  async function schedule(at: Date | null = scheduleDate) {
    if (!publisher?.schedule || sheet?.kind === 'publishing') return;
    if (!at || Number.isNaN(at.getTime())) {
      scheduleError = 'Pick a date and time.';
      return;
    }
    if (at.getTime() < Date.now() + 60_000) {
      scheduleError = 'Pick a time in the future.';
      return;
    }
    if (!canPublish) return;
    scheduleOpen = false;
    lastAttempt = { action: 'schedule', at };
    const { kind, snapshot } = await prepare();
    sheet = { kind: 'publishing', progress: { step: 'Scheduling', done: 0, total: 1 } };
    try {
      await finish({ kind: 'scheduled', post: await publisher.schedule(kind, snapshot, at) });
      scheduleAt = '';
    } catch (err) {
      sheet = { kind: 'error', message: describeError(err) };
    }
  }

  function retry() {
    if (lastAttempt.action === 'schedule') schedule(lastAttempt.at);
    else publish();
  }

  /** Put a draft in the editor, replacing what's there (e.g. one taken off the schedule). */
  export function replaceDraft(next: Draft) {
    draft = next;
    sheet = null;
    tab = 'write';
    tick().then(() => textarea?.focus());
  }

  export function isEmpty(): boolean {
    return !draft.text.trim() && !draft.title.trim() && !draft.images.length;
  }

  function startOver() {
    sheet = null;
    tab = 'write';
    tick().then(() => textarea?.focus());
  }

  function discardProgress() {
    draft.threadProgress = undefined;
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      publish();
    }
    if (e.key === 'Escape') settingsOpen = scheduleOpen = false;
  }

  function onWindowClick(e: MouseEvent) {
    if (settingsOpen && settingsEl && !settingsEl.contains(e.target as Node)) settingsOpen = false;
    if (scheduleOpen && scheduleEl && !scheduleEl.contains(e.target as Node)) scheduleOpen = false;
  }

  function onInput() {
    // A plan with nothing posted yet is stale as soon as the text changes.
    if (draft.threadProgress && !partial) draft.threadProgress = undefined;
  }

  const articleUrlPreview = $derived(`${appOrigin.replace(/\/+$/, '')}/${account?.did ?? 'you'}/…`);
</script>

<svelte:window onclick={onWindowClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="composer" class:ready onkeydown={onKeydown}>
  <div class="tabs" role="tablist" aria-label="Composer view">
    <button role="tab" aria-selected={tab === 'write'} onclick={() => (tab = 'write')}>Write</button>
    <button role="tab" aria-selected={tab === 'preview'} onclick={() => (tab = 'preview')}>
      Preview
      {#if mode === 'thread'}<span class="count">{threadCount}</span>{/if}
    </button>
  </div>

  <div class="layout">
    <section class="pane write" class:hidden={tab !== 'write'} aria-label="Editor">
      <div
        class="editor"
        class:article={mode === 'article'}
        class:dragging
        ondragover={(e) => {
          e.preventDefault();
          dragging = true;
        }}
        ondragleave={() => (dragging = false)}
        ondrop={onDrop}
      >
        {#if partial}
          <div class="banner">
            <Icon name="thread" size={18} />
            <span
              >{partial.done} of {partial.total} posts are live. Finish the thread as planned, or discard the rest.</span
            >
            <button type="button" class="sp-btn sp-btn-ghost small" onclick={discardProgress}>Discard</button>
          </div>
        {/if}

        {#if mode === 'article'}
          <input
            class="title"
            type="text"
            placeholder={article?.title && !draft.title ? article.title : 'Title'}
            bind:value={draft.title}
            aria-label="Article title"
            maxlength="500"
          />
        {/if}

        <textarea
          bind:this={textarea}
          bind:value={draft.text}
          oninput={onInput}
          onpaste={onPaste}
          readonly={!!partial}
          rows="4"
          aria-label={mode === 'article' ? 'Article body (Markdown)' : 'Post text'}
          placeholder={mode === 'article'
            ? 'Start writing. Markdown works.'
            : 'Say something. Keep going if it’s long.'}></textarea>

        <ImageTray bind:images={draft.images} usable={usableImages} note={imageNote} />

        {#if notice}<p class="notice">{notice}</p>{/if}

        {#if asking}
          <div class="suggest" role="group" aria-label="This is too long for one post">
            <p><strong>Too long for one post.</strong> Post it as:</p>
            <div class="choices">
              <button type="button" class="choice" class:on={preferred === 'thread'} onclick={() => choose('thread')}>
                <Icon name="thread" size={20} />
                <span><strong>Thread</strong><small>{threadCount} posts on Bluesky</small></span>
              </button>
              <button type="button" class="choice" class:on={preferred === 'article'} onclick={() => choose('article')}>
                <Icon name="article" size={20} />
                <span><strong>Article</strong><small>{words} words + a link post</small></span>
              </button>
            </div>
            <label class="remember">
              <input type="checkbox" bind:checked={remember} />
              Remember my choice
            </label>
          </div>
        {/if}

        <footer class="bar">
          <div class="tools">
            <button
              type="button"
              class="sp-icon-btn"
              onclick={() => fileInput?.click()}
              aria-label="Add images"
              title="Add images (or paste / drop them)"
            >
              <Icon name="image" />
            </button>
            <input
              bind:this={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onchange={(e) => {
                const input = e.currentTarget as HTMLInputElement;
                addFiles(Array.from(input.files ?? []));
                input.value = '';
              }}
            />
            <button
              type="button"
              class="sp-icon-btn"
              aria-pressed={mode === 'article'}
              onclick={() => setArticle(mode !== 'article')}
              aria-label="Write as an article"
              title={mode === 'article' ? 'Back to a post' : 'Write as an article'}
            >
              <Icon name="article" />
            </button>
            {#if pageContext}
              <button
                type="button"
                class="sp-icon-btn"
                onclick={() => pageContext && insertPage(pageContext)}
                aria-label="Add this page"
                title="Add this page’s link"
              >
                <Icon name="link" />
              </button>
            {/if}
            <div class="settings" bind:this={settingsEl}>
              <button
                type="button"
                class="sp-icon-btn"
                aria-expanded={settingsOpen}
                aria-haspopup="true"
                aria-label="Posting preferences"
                onclick={() => (settingsOpen = !settingsOpen)}
              >
                <Icon name="settings" />
              </button>
              {#if settingsOpen}
                <div class="menu" role="menu">
                  <p class="sp-kicker menu-label">When a draft is too long</p>
                  {#each [['ask', 'Ask each time'], ['thread', 'Always make a thread'], ['article', 'Always make an article']] as [value, label]}
                    <label class="menu-item">
                      <input
                        type="radio"
                        name="overflow"
                        checked={prefs.overflowMode === value}
                        onchange={() => setOverflowPref(value as Prefs['overflowMode'])}
                      />
                      {label}
                    </label>
                  {/each}
                  <hr />
                  <label class="menu-item">
                    <input
                      type="checkbox"
                      checked={draft.numbering}
                      onchange={(e) => setNumbering(e.currentTarget.checked)}
                    />
                    Number thread posts (1/n)
                  </label>
                </div>
              {/if}
            </div>
          </div>

          <div class="meta">
            {#if overflow && !asking && mode !== 'post'}
              <div class="seg" role="radiogroup" aria-label="Post as">
                <button type="button" role="radio" aria-checked={mode === 'thread'} onclick={() => choose('thread')}>
                  Thread
                </button>
                <button type="button" role="radio" aria-checked={mode === 'article'} onclick={() => choose('article')}>
                  Article
                </button>
              </div>
            {/if}
            {#if mode === 'post'}
              <CountRing value={length} max={POST_GRAPHEME_LIMIT} />
            {:else if mode === 'thread'}
              <span class="stat">{threadCount} posts</span>
            {:else}
              <span class="stat">{words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min</span>
            {/if}
            {#if canSchedule}
              <div class="schedule" bind:this={scheduleEl}>
                <button
                  type="button"
                  class="sp-icon-btn"
                  aria-expanded={scheduleOpen}
                  aria-haspopup="dialog"
                  aria-label="Post later"
                  title="Post later"
                  disabled={!canPublish}
                  onclick={toggleSchedule}
                >
                  <Icon name="clock" />
                </button>
                {#if scheduleOpen}
                  <div class="menu schedule-menu" role="dialog" aria-label="Post later">
                    <p class="sp-kicker menu-label">Post it later</p>
                    <div class="quick">
                      {#each quickTimes as q (q.label)}
                        <button
                          type="button"
                          class="quick-pick"
                          aria-pressed={scheduleAt === toLocalInput(q.at)}
                          onclick={() => {
                            scheduleAt = toLocalInput(q.at);
                            scheduleError = '';
                          }}
                        >
                          <strong>{q.label}</strong>
                          <small>{formatWhen(q.at)}</small>
                        </button>
                      {/each}
                    </div>
                    <label class="when">
                      <span>Or pick a time</span>
                      <input
                        class="sp-input"
                        type="datetime-local"
                        bind:value={scheduleAt}
                        min={toLocalInput(new Date())}
                        oninput={() => (scheduleError = '')}
                        aria-invalid={!!scheduleError}
                      />
                    </label>
                    {#if scheduleError}
                      <p class="schedule-error" role="alert">{scheduleError}</p>
                    {:else if timeZone}
                      <p class="zone">Times are in your time zone, {timeZone.replace(/_/g, ' ')}.</p>
                    {/if}
                    <button
                      type="button"
                      class="sp-btn sp-btn-primary schedule-go"
                      disabled={!scheduleDate}
                      onclick={() => schedule()}
                    >
                      {scheduleDate && !Number.isNaN(scheduleDate.getTime())
                        ? `Schedule for ${formatWhen(scheduleDate)}`
                        : 'Schedule'}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
            <button
              type="button"
              class="sp-btn sp-btn-primary"
              disabled={!!publisher && !canPublish && !partial}
              onclick={publish}
              title="⌘/Ctrl + Enter"
            >
              {publishLabel}
            </button>
          </div>
        </footer>

        {#if sheet}
          <PublishSheet
            state={sheet}
            onretry={retry}
            ondismiss={() => (sheet = null)}
            onnew={startOver}
            onshowscheduled={onShowScheduled}
          />
        {/if}
      </div>
    </section>

    <aside class="pane preview" class:hidden={tab !== 'preview'} aria-label="Preview">
      {#if mode === 'article' && article}
        <p class="sp-kicker">The article</p>
        <div class="doc">
          <h2>{article.title}</h2>
          {#if article.description}<p>{article.description}</p>{/if}
          <span class="doc-meta">{words.toLocaleString()} words · {Math.max(1, Math.round(words / 230))} min read</span>
        </div>
        <p class="sp-kicker">How it’s announced on Bluesky</p>
        <label class="share">
          <span class="share-head">
            <span>Post text <small>(leave blank to use the title and opening)</small></span>
            <CountRing value={measure(draft.shareText.trim() || shareDefault)} max={POST_GRAPHEME_LIMIT} />
          </span>
          <textarea bind:value={draft.shareText} rows="5" placeholder={shareDefault}></textarea>
        </label>
        <div class="stack">
          <PostCard
            {account}
            text={draft.shareText.trim() || shareDefault}
            card={{
              url: articleUrlPreview,
              title: article.title,
              description: article.description,
              image: draft.images[0]?.blob,
            }}
          />
        </div>
      {:else if mode === 'thread'}
        <p class="sp-kicker">Your thread, {imageGroups.length} posts</p>
        <div class="stack">
          {#each imageGroups as group, i (i)}
            <PostCard
              {account}
              text={segments[i]?.text ?? ''}
              length={segments[i]?.length}
              images={group.map((k) => draft.images[k]).filter((x) => !!x)}
              connectAbove={i > 0}
              connectBelow={i < imageGroups.length - 1}
              index={i}
              enter
            />
          {/each}
        </div>
      {:else if trimmed || draft.images.length}
        <p class="sp-kicker">Your post</p>
        <div class="stack">
          <PostCard {account} text={trimmed} images={draft.images.slice(0, 4)} />
        </div>
      {:else}
        <div class="empty">
          <p>Your post shows up here as you write.</p>
          <p>Past 300 characters, Spool offers to turn it into a thread or an article.</p>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .composer {
    container-type: inline-size;
    width: 100%;
    opacity: 0;
    transition: opacity 0.25s var(--sp-ease);
  }
  .composer.ready {
    opacity: 1;
  }

  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    margin: 0 0 12px;
    border-radius: 999px;
    background: var(--sp-sunken);
    width: fit-content;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: transparent;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 550;
    color: var(--sp-ink-2);
    cursor: pointer;
    transition:
      background 0.2s var(--sp-ease),
      color 0.2s var(--sp-ease);
  }
  .tabs button[aria-selected='true'] {
    background: var(--sp-raised);
    color: var(--sp-ink);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }
  .count {
    color: var(--sp-accent);
    font-variant-numeric: tabular-nums;
  }

  .layout {
    display: grid;
    gap: 24px;
  }
  .hidden {
    display: none;
  }

  @container (min-width: 860px) {
    .tabs {
      display: none;
    }
    .layout {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
      align-items: start;
      gap: 32px;
    }
    .hidden {
      display: block;
    }
    .preview {
      position: sticky;
      top: 24px;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
      scrollbar-width: thin;
    }
  }

  .editor {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--sp-surface);
    border: 1px solid var(--sp-line);
    border-radius: var(--sp-radius-lg);
    box-shadow: var(--sp-shadow);
    transition:
      border-color 0.2s var(--sp-ease),
      box-shadow 0.2s var(--sp-ease);
  }
  .editor:focus-within {
    border-color: var(--sp-line-strong);
    box-shadow: var(--sp-shadow-lg);
  }
  .editor.dragging {
    border-color: var(--sp-accent);
    border-style: dashed;
  }

  .title {
    border: 0;
    background: transparent;
    padding: 26px 24px 0;
    font-family: var(--sp-font-serif);
    font-size: clamp(26px, 5cqi, 36px);
    font-weight: 600;
    letter-spacing: -0.015em;
    line-height: 1.15;
  }
  .title:focus {
    outline: none;
    box-shadow: none;
  }
  .title::placeholder {
    color: var(--sp-muted);
    opacity: 0.6;
  }

  textarea {
    display: block;
    width: 100%;
    min-height: 180px;
    resize: none;
    overflow: hidden;
    border: 0;
    background: transparent;
    padding: 22px 24px 18px;
    font-size: 18px;
    line-height: 1.55;
    color: var(--sp-ink);
  }
  textarea:focus {
    outline: none;
    box-shadow: none;
  }
  textarea::placeholder {
    color: var(--sp-muted);
  }
  .article textarea {
    min-height: 320px;
    padding-top: 14px;
    font-family: var(--sp-font-serif);
    font-size: 20px;
    line-height: 1.65;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 14px 14px 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--sp-accent-soft);
    color: var(--sp-ink);
    font-size: 13px;
  }
  .banner span {
    flex: 1;
  }
  .small {
    height: 30px;
    padding: 0 10px;
    font-size: 13px;
  }

  .notice {
    margin: 0 24px 12px;
    font-size: 13px;
    color: var(--sp-danger);
  }

  .suggest {
    margin: 4px 14px 12px;
    padding: 14px;
    border-radius: 14px;
    background: var(--sp-sunken);
    animation: slide 0.3s var(--sp-ease);
  }
  .suggest p {
    margin: 0 0 10px;
    font-size: 14px;
    color: var(--sp-ink-2);
  }
  .suggest strong {
    color: var(--sp-ink);
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    text-align: left;
    border-radius: 12px;
    border: 1.5px solid var(--sp-line-strong);
    background: var(--sp-raised);
    cursor: pointer;
    color: var(--sp-ink-2);
    transition:
      border-color 0.2s var(--sp-ease),
      background 0.2s var(--sp-ease),
      transform 0.2s var(--sp-ease);
  }
  .choice:hover {
    border-color: var(--sp-muted);
    transform: translateY(-1px);
  }
  .choice:active {
    transform: scale(0.98);
  }
  .choice.on {
    border-color: var(--sp-accent);
    background: color-mix(in srgb, var(--sp-accent-soft) 60%, var(--sp-raised));
    color: var(--sp-accent);
  }
  .choice span {
    display: grid;
    color: var(--sp-ink);
  }
  .choice small {
    color: var(--sp-muted);
    font-size: 12px;
  }
  .remember {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 13px;
    color: var(--sp-ink-2);
    cursor: pointer;
  }
  input[type='checkbox'],
  input[type='radio'] {
    accent-color: var(--sp-accent);
    width: 15px;
    height: 15px;
    margin: 0;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px 10px 14px;
    border-top: 1px solid var(--sp-line);
    flex-wrap: wrap;
  }
  .tools,
  .meta {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .meta {
    gap: 12px;
    margin-left: auto;
  }
  .stat {
    font-size: 13px;
    color: var(--sp-muted);
    font-variant-numeric: tabular-nums;
  }

  .seg {
    display: inline-flex;
    padding: 3px;
    border-radius: 999px;
    background: var(--sp-sunken);
  }
  .seg button {
    border: 0;
    background: transparent;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 550;
    color: var(--sp-ink-2);
    cursor: pointer;
    transition:
      background 0.2s var(--sp-ease),
      color 0.2s var(--sp-ease);
  }
  .seg button[aria-checked='true'] {
    background: var(--sp-raised);
    color: var(--sp-ink);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }

  .settings {
    position: relative;
  }
  .menu {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    z-index: var(--sp-z-menu);
    min-width: 250px;
    padding: 8px;
    border-radius: 14px;
    background: var(--sp-raised);
    border: 1px solid var(--sp-line);
    box-shadow: var(--sp-shadow-lg);
    animation: slide 0.18s var(--sp-ease);
  }
  .menu-label {
    margin: 4px 8px 4px;
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .menu-item:hover {
    background: var(--sp-sunken);
  }
  .schedule {
    position: relative;
  }
  .schedule-menu {
    /* Below the toolbar: above it, a short draft leaves no room. */
    top: calc(100% + 8px);
    bottom: auto;
    left: auto;
    right: 0;
    width: min(300px, calc(100vw - 40px));
    display: grid;
    gap: 8px;
  }
  .quick {
    display: grid;
    gap: 2px;
  }
  .quick-pick {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 8px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--sp-ink);
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }
  .quick-pick:hover {
    background: var(--sp-sunken);
  }
  .quick-pick[aria-pressed='true'] {
    background: var(--sp-accent-soft);
  }
  .quick-pick strong {
    font-weight: 550;
  }
  .quick-pick small {
    color: var(--sp-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .when {
    display: grid;
    gap: 6px;
    padding: 4px 8px 0;
    font-size: 13px;
    font-weight: 550;
    color: var(--sp-ink-2);
  }
  .when .sp-input[aria-invalid='true'] {
    border-color: var(--sp-danger);
  }
  .zone,
  .schedule-error {
    margin: 0 8px;
    font-size: 12px;
    color: var(--sp-muted);
  }
  .schedule-error {
    color: var(--sp-danger);
  }
  .schedule-go {
    margin: 4px 8px 6px;
  }
  .menu hr {
    border: 0;
    border-top: 1px solid var(--sp-line);
    margin: 6px 0;
  }

  .stack {
    background: var(--sp-surface);
    border-radius: var(--sp-radius);
    overflow: hidden;
  }
  .stack :global(.post + .post) {
    padding-top: 0;
  }
  .doc {
    margin-bottom: 22px;
    padding: 20px 22px;
    border-radius: var(--sp-radius);
    background: var(--sp-surface);
  }
  .doc h2 {
    margin: 0 0 8px;
    font-family: var(--sp-font-serif);
    font-size: 24px;
    line-height: 1.2;
    letter-spacing: -0.01em;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .doc p {
    margin: 0 0 12px;
    color: var(--sp-ink-2);
    font-family: var(--sp-font-serif);
    font-size: 16px;
  }
  .doc-meta {
    font-size: 12px;
    color: var(--sp-muted);
  }
  .share {
    position: relative;
    display: block;
    margin-bottom: 10px;
  }
  .share textarea {
    min-height: 0;
    padding: 12px 14px;
    font-size: 14px;
    line-height: 1.45;
    border-radius: 12px;
    border: 1px solid var(--sp-line);
    background: var(--sp-surface);
    resize: vertical;
    overflow: auto;
  }
  .share textarea:focus {
    border-color: var(--sp-accent);
    box-shadow: var(--sp-ring);
  }
  .share-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 4px 6px;
    font-size: 13px;
    font-weight: 550;
    color: var(--sp-ink-2);
  }
  .share-head small {
    font-weight: 400;
    color: var(--sp-muted);
  }
  @container (max-width: 560px) {
    .meta .seg,
    .meta .stat {
      display: none;
    }
    /* No room beside the button: span the editor instead. */
    .bar {
      position: relative;
    }
    .schedule {
      position: static;
    }
    .schedule-menu {
      left: 8px;
      right: 8px;
      width: auto;
    }
  }
  .empty {
    padding: 28px 24px;
    border-radius: var(--sp-radius);
    border: 1.5px dashed var(--sp-line-strong);
    color: var(--sp-muted);
    font-size: 14px;
  }
  .empty p {
    margin: 0;
  }
  .empty p + p {
    margin-top: 8px;
  }
  @keyframes slide {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
