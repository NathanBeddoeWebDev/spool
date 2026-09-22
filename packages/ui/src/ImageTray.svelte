<script lang="ts">
  import type { DraftImage } from '@spool/core';
  import Icon from './Icon.svelte';
  import { blobUrl } from './lib/preview.ts';

  let { images = $bindable(), usable, note = '' }: { images: DraftImage[]; usable: number; note?: string } = $props();

  let editing = $state<string | null>(null);

  function remove(id: string) {
    images = images.filter((i) => i.id !== id);
    if (editing === id) editing = null;
  }
</script>

{#if images.length}
  <div class="tray">
    <ul>
      {#each images as img, i (img.id)}
        <li class:unused={i >= usable}>
          <img src={blobUrl(img.blob)} alt={img.alt || `Image ${i + 1}`} />
          <button
            type="button"
            class="alt"
            class:has={!!img.alt}
            onclick={() => (editing = editing === img.id ? null : img.id)}
            aria-label="Edit alt text for image {i + 1}">ALT</button
          >
          <button type="button" class="remove" onclick={() => remove(img.id)} aria-label="Remove image {i + 1}">
            <Icon name="x" size={14} stroke={2.4} />
          </button>
        </li>
      {/each}
    </ul>
    {#each images as img (img.id)}
      {#if editing === img.id}
        <label class="alt-editor">
          <span>Describe this image for people who can't see it</span>
          <!-- svelte-ignore a11y_autofocus -->
          <textarea bind:value={img.alt} rows="2" maxlength="2000" autofocus placeholder="Alt text"></textarea>
        </label>
      {/if}
    {/each}
    {#if note}<p class="note">{note}</p>{/if}
  </div>
{/if}

<style>
  .tray {
    padding: 0 20px 12px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  li {
    position: relative;
    flex: none;
    width: 84px;
    height: 84px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--sp-sunken);
    border: 1px solid var(--sp-line);
    transition: opacity 0.2s;
  }
  li.unused {
    opacity: 0.35;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  button {
    position: absolute;
    border: 0;
    cursor: pointer;
    color: #fff;
    background: rgb(0 0 0 / 0.62);
    backdrop-filter: blur(6px);
  }
  .remove {
    top: 5px;
    right: 5px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
  }
  .alt {
    left: 5px;
    bottom: 5px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 6px;
  }
  .alt.has {
    background: var(--sp-accent);
  }
  .alt-editor {
    display: grid;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: var(--sp-muted);
  }
  .alt-editor textarea {
    resize: vertical;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--sp-line-strong);
    background: var(--sp-raised);
    font-size: 14px;
    color: var(--sp-ink);
  }
  .alt-editor textarea:focus {
    outline: none;
    border-color: var(--sp-accent);
    box-shadow: var(--sp-ring);
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--sp-muted);
  }
</style>
