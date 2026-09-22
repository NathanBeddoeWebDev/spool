<script lang="ts">
  import { Logo } from '@spool/ui';

  let { data } = $props();
  const name = $derived(data.publication.name || data.author.displayName || data.author.handle);
  const fmt = (d: string) => new Date(d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head>
  <title>{name}</title>
  <link rel="site.standard.publication" href={data.publication.uri} />
  <meta name="description" content={data.publication.description ?? `Writing by @${data.author.handle}`} />
</svelte:head>

<div class="wrap">
  <nav><a href="/" aria-label="Write with Spool"><Logo size={22} wordmark={false} /></a></nav>
  <main id="main">
    <header>
      {#if data.author.avatar}<img src={data.author.avatar} alt="" />{/if}
      <h1>{name}</h1>
      <p>@{data.author.handle}</p>
    </header>
    {#if data.articles.length}
      <ol>
        {#each data.articles as a (a.rkey)}
          <li>
            <a href="/{data.did}/{a.rkey}">
              <time datetime={a.publishedAt}>{fmt(a.publishedAt)}</time>
              <strong>{a.title}</strong>
              {#if a.description}<span>{a.description}</span>{/if}
            </a>
          </li>
        {/each}
      </ol>
    {:else}
      <p class="none">No articles yet.</p>
    {/if}
  </main>
</div>

<style>
  .wrap {
    max-width: 680px;
    margin: 0 auto;
    padding: 0 20px 64px;
  }
  nav {
    height: 68px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }
  header {
    padding: 32px 0 28px;
    border-bottom: 1px solid var(--sp-line);
  }
  header img {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
  }
  h1 {
    margin: 14px 0 4px;
    font-family: var(--sp-font-serif);
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  header p {
    margin: 0;
    color: var(--sp-muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li a {
    display: grid;
    gap: 4px;
    padding: 24px 0;
    border-bottom: 1px solid var(--sp-line);
    color: inherit;
    text-decoration: none;
  }
  li a:hover strong {
    color: var(--sp-accent);
  }
  time {
    font-size: 13px;
    color: var(--sp-muted);
  }
  strong {
    font-family: var(--sp-font-serif);
    font-size: 24px;
    font-weight: 600;
    line-height: 1.25;
    transition: color 0.15s;
  }
  li span {
    font-family: var(--sp-font-serif);
    font-size: 17px;
    color: var(--sp-ink-2);
  }
  .none {
    color: var(--sp-muted);
    padding: 24px 0;
  }
</style>
