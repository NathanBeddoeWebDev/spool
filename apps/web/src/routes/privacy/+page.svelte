<script lang="ts">
  import { Logo } from '@spool/ui';
</script>

<svelte:head>
  <title>Privacy · Spool</title>
  <meta name="description" content="What Spool stores, and where." />
</svelte:head>

<div class="wrap">
  <nav><a href="/" aria-label="Back to the composer"><Logo size={24} /></a></nav>
  <main id="main">
    <h1>Privacy</h1>
    <p class="dek">Spool has no accounts of its own. Here is everything it touches.</p>

    <h2>In your browser</h2>
    <p>
      Your draft, including images, is saved in this browser’s IndexedDB so it survives a reload or a sign-in redirect.
      Your posting preferences are saved in local storage, or your browser’s synced storage in the extension. In the
      extension, sign-in keys are created in your browser and never leave it.
    </p>

    <h2>On your PDS</h2>
    <p>
      When you publish, posts and articles are written directly to your own atproto repository. They’re public, like any
      Bluesky post, and you can delete them from any atproto client.
    </p>

    <h2>On this server</h2>
    <p>
      When you sign in on the web, Spool keeps your sign-in tokens on its server, so it can publish for you, including
      posts you’ve scheduled while your browser is closed. Your browser gets a cookie that only identifies that sign-in.
      Signing out deletes it, and revokes Spool’s access to your account unless posts are still waiting to go out.
    </p>
    <p>
      A scheduled post is stored on the server, images included, until it’s published. Cancel it and it’s deleted. Once
      it’s out, the images are deleted, and the entry in your list is removed a week later.
    </p>
    <p>
      Article pages are fetched from the author’s PDS when someone reads them and cached briefly. Spool’s code keeps no
      reading logs, sets no cookies on readers and runs no analytics. Whoever hosts this copy of Spool may still keep
      ordinary server logs.
    </p>

    <h2>Sign-in permissions</h2>
    <p>
      Spool asks only to create posts, write standard.site records and upload images. It can’t read your DMs, follow
      people, or change your profile.
    </p>

    <p class="back"><a href="/">Back to writing</a></p>
  </main>
</div>

<style>
  .wrap {
    max-width: 640px;
    margin: 0 auto;
    padding: 0 20px 72px;
    min-height: 100dvh;
  }
  nav {
    height: 72px;
    display: flex;
    align-items: center;
  }
  nav a {
    color: inherit;
    text-decoration: none;
  }
  h1 {
    margin: 40px 0 10px;
    font-family: var(--sp-font-serif);
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .dek {
    font-family: var(--sp-font-serif);
    font-style: italic;
    font-size: 21px;
    color: var(--sp-ink-2);
    line-height: 1.4;
    margin: 0 0 28px;
  }
  h2 {
    margin: 32px 0 6px;
    font-size: 16px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--sp-ink-2);
    line-height: 1.65;
    max-width: 65ch;
  }
  .back {
    margin-top: 40px;
  }
  a {
    color: var(--sp-ink);
    text-underline-offset: 4px;
    text-decoration-color: var(--sp-accent);
  }
</style>
