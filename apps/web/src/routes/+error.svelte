<script lang="ts">
  import { page } from '$app/state';
  import { Logo } from '@spool/ui';
</script>

<svelte:head><title>{page.status} · Spool</title></svelte:head>

<main class="err" id="main">
  <a href="/"><Logo /></a>
  <h1>{page.status === 404 ? 'Not here' : 'Something broke'}</h1>
  <p>{page.error?.message}</p>
  <a class="sp-btn" href="/">Write something</a>
</main>

<style>
  .err {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 24px;
    text-align: center;
  }
  .err > a:first-child {
    color: inherit;
    text-decoration: none;
    margin-bottom: 20px;
  }
  h1 {
    margin: 0;
    font-family: var(--sp-font-serif);
    font-size: 36px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--sp-ink-2);
  }
</style>
