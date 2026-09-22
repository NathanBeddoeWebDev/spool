<script lang="ts">
  import { page } from '$app/state';
  import { Icon, Logo } from '@spool/ui';
  import '../../prose.css';

  let { data } = $props();

  const date = $derived(
    new Date(data.publishedAt).toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' }),
  );
  const authorName = $derived(data.author.displayName || data.author.handle);
  const canonical = $derived(page.url.href.split('?')[0]);
</script>

<svelte:head>
  <title>{data.title} · {authorName}</title>
  <meta name="description" content={data.description} />
  <link rel="canonical" href={canonical} />
  <link rel="site.standard.document" href={data.uri} />
  <meta property="og:type" content="article" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content={data.description} />
  <meta property="og:url" content={canonical} />
  <meta property="article:published_time" content={data.publishedAt} />
  {#if data.cover}
    <meta property="og:image" content={data.cover} />
    <meta name="twitter:card" content="summary_large_image" />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
</svelte:head>

<div class="read">
  <nav>
    <a class="pub" href="/{data.did}">{data.publication?.name ?? authorName}</a>
    <a class="write" href="/" aria-label="Write with Spool"><Logo size={22} wordmark={false} /></a>
  </nav>

  <main id="main">
    <article>
      <header>
        <p class="meta"><time datetime={data.publishedAt}>{date}</time> · {data.minutes} min read</p>
        <h1>{data.title}</h1>
        {#if data.description}<p class="dek">{data.description}</p>{/if}
        <a class="byline" href="https://bsky.app/profile/{data.author.handle}" target="_blank" rel="noopener">
          {#if data.author.avatar}<img src={data.author.avatar} alt="" />{/if}
          <span>
            <strong>{authorName}</strong>
            <small>@{data.author.handle}</small>
          </span>
        </a>
      </header>

      {#if data.cover}
        <img class="cover" src={data.cover} alt="" />
      {/if}

      <div class="prose">
        {@html data.html}
      </div>

      <footer>
        {#if data.discussUrl}
          <a class="sp-btn sp-btn-primary" href={data.discussUrl} target="_blank" rel="noopener">
            Discuss on Bluesky <Icon name="external" size={16} />
          </a>
        {/if}
        <p class="provenance">
          <a href="/{data.did}">More from {authorName}</a> · Stored on {authorName}’s own server as a
          <a href="https://standard.site" target="_blank" rel="noopener">standard.site</a>
          document.
          <code>{data.uri}</code>
        </p>
      </footer>
    </article>
  </main>
</div>

<style>
  .read {
    min-height: 100dvh;
    padding: 0 20px 64px;
  }
  nav {
    max-width: 720px;
    margin: 0 auto;
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pub {
    font-weight: 600;
    font-size: 15px;
    color: var(--sp-ink);
    text-decoration: none;
  }
  .pub:hover {
    color: var(--sp-accent);
  }
  .write {
    display: inline-flex;
    opacity: 0.8;
  }
  .write:hover {
    opacity: 1;
  }
  article {
    max-width: 680px;
    margin: 0 auto;
    padding-top: 40px;
  }
  header {
    margin-bottom: 36px;
  }
  .meta {
    margin: 0 0 16px;
    font-size: 13px;
    letter-spacing: 0.02em;
    color: var(--sp-muted);
  }
  h1 {
    margin: 0;
    font-family: var(--sp-font-serif);
    font-size: clamp(34px, 6vw, 50px);
    line-height: 1.08;
    letter-spacing: -0.02em;
    font-weight: 600;
    text-wrap: balance;
  }
  .dek {
    margin: 16px 0 0;
    font-family: var(--sp-font-serif);
    font-style: italic;
    font-size: 22px;
    line-height: 1.45;
    color: var(--sp-ink-2);
    text-wrap: pretty;
  }
  .byline {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-top: 26px;
    color: inherit;
    text-decoration: none;
  }
  .byline img {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    object-fit: cover;
  }
  .byline span {
    display: grid;
    line-height: 1.25;
    font-size: 14px;
  }
  .byline small {
    color: var(--sp-muted);
  }
  .cover {
    display: block;
    width: min(100vw - 40px, 900px);
    margin: 0 0 40px 50%;
    transform: translateX(-50%);
    border-radius: 16px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    background: var(--sp-sunken);
  }
  footer {
    margin-top: 56px;
    padding-top: 28px;
    border-top: 1px solid var(--sp-line);
    display: grid;
    gap: 18px;
    justify-items: start;
  }
  .provenance {
    margin: 0;
    font-size: 13px;
    color: var(--sp-muted);
  }
  .provenance a {
    color: inherit;
  }
  code {
    display: block;
    margin-top: 6px;
    font-family: var(--sp-font-mono);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
</style>
