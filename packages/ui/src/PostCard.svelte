<script lang="ts">
  import type { DraftImage } from '@spool/core';
  import { POST_GRAPHEME_LIMIT } from '@spool/core';
  import type { Account } from './lib/types.ts';
  import { blobUrl, hostOf, previewParts } from './lib/preview.svelte.ts';

  interface Card {
    url: string;
    title: string;
    description: string;
    image?: Blob;
  }

  let {
    account,
    text,
    images = [],
    card,
    length,
    connectAbove = false,
    connectBelow = false,
    index,
    enter = false,
  }: {
    account: Account | null;
    text: string;
    images?: DraftImage[];
    card?: Card;
    length?: number;
    connectAbove?: boolean;
    connectBelow?: boolean;
    index?: number;
    /** Animate in when first shown (thread posts appearing as you type). */
    enter?: boolean;
  } = $props();

  const parts = $derived(previewParts(text));
  const name = $derived(account?.displayName || account?.handle || 'You');
  const handle = $derived(account ? `@${account.handle}` : '@you.bsky.social');
  const initial = $derived(name.trim().charAt(0).toUpperCase() || '·');
</script>

<article class="post" class:above={connectAbove} class:below={connectBelow} class:enter>
  <div class="gutter">
    {#if account?.avatar}
      <img class="avatar" src={account.avatar} alt="" />
    {:else}
      <span class="avatar placeholder" aria-hidden="true">{initial}</span>
    {/if}
  </div>
  <div class="body">
    <header>
      <span class="name">{name}</span>
      <span class="handle">{handle}</span>
      {#if length !== undefined}
        <span class="count" class:near={length > POST_GRAPHEME_LIMIT - 20}>{length}</span>
      {/if}
      {#if index !== undefined}
        <span class="sr-only">Post {index + 1}</span>
      {/if}
    </header>
    {#if text}
      <p class="text">
        {#each parts as part}{#if part.kind === 'text'}{part.text}{:else}<span class="facet">{part.text}</span
            >{/if}{/each}
      </p>
    {/if}
    {#if images.length}
      <div class="grid n{Math.min(images.length, 4)}">
        {#each images.slice(0, 4) as img (img.id)}
          <img src={blobUrl(img.blob)} alt={img.alt} />
        {/each}
      </div>
    {:else if card}
      <div class="card">
        {#if card.image}
          <img class="card-img" src={blobUrl(card.image)} alt="" />
        {/if}
        <div class="card-body">
          <span class="card-host">{hostOf(card.url)}</span>
          <strong class="card-title">{card.title}</strong>
          {#if card.description}<span class="card-desc">{card.description}</span>{/if}
        </div>
      </div>
    {/if}
  </div>
</article>

<style>
  .post {
    position: relative;
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 12px;
    padding: 14px 16px;
  }
  .gutter {
    position: relative;
  }
  .enter {
    animation: enter 0.35s var(--sp-ease) both;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  .post.above .gutter::before,
  .post.below .gutter::after {
    content: '';
    position: absolute;
    left: 19px;
    width: 2px;
    background: var(--sp-line-strong);
    border-radius: 2px;
  }
  .post.above .gutter::before {
    top: -14px;
    height: 12px;
  }
  .post.below .gutter::after {
    top: 44px;
    bottom: -16px;
  }
  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .placeholder {
    display: grid;
    place-items: center;
    background: var(--sp-accent-soft);
    color: var(--sp-accent);
    font-weight: 650;
  }
  .body {
    min-width: 0;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 14px;
    min-width: 0;
  }
  .name {
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .handle {
    color: var(--sp-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .count {
    margin-left: auto;
    font-size: 12px;
    color: var(--sp-muted);
    font-variant-numeric: tabular-nums;
  }
  .count.near {
    color: var(--sp-warn);
  }
  .text {
    margin: 2px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 15px;
    line-height: 1.45;
  }
  .facet {
    color: var(--sp-link);
  }
  .grid {
    margin-top: 10px;
    display: grid;
    gap: 3px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--sp-line);
  }
  .grid img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    background: var(--sp-sunken);
  }
  .grid.n1 img {
    max-height: 320px;
  }
  .grid.n2,
  .grid.n4 {
    grid-template-columns: 1fr 1fr;
    aspect-ratio: 2 / 1;
  }
  .grid.n4 {
    grid-template-rows: 1fr 1fr;
    aspect-ratio: 3 / 2;
  }
  .grid.n3 {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    aspect-ratio: 3 / 2;
  }
  .grid.n3 img:first-child {
    grid-row: span 2;
  }
  .card {
    margin-top: 10px;
    border: 1px solid var(--sp-line);
    border-radius: 12px;
    overflow: hidden;
    background: var(--sp-raised);
  }
  .card-img {
    display: block;
    width: 100%;
    aspect-ratio: 1.91 / 1;
    object-fit: cover;
    background: var(--sp-sunken);
  }
  .card-body {
    display: grid;
    gap: 2px;
    padding: 10px 12px 12px;
    font-size: 13px;
  }
  .card-host {
    color: var(--sp-muted);
    font-size: 12px;
  }
  .card-title {
    font-size: 14px;
    line-height: 1.3;
  }
  .card-desc {
    color: var(--sp-ink-2);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
