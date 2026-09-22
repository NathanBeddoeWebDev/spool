<script lang="ts">
  import '@fontsource-variable/geist';
  import '@fontsource-variable/geist-mono';
  import '@fontsource-variable/newsreader/opsz.css';
  import '@fontsource-variable/newsreader/opsz-italic.css';
  import '@spool/ui/theme.css';

  let { children } = $props();
</script>

<a class="sp-skip" href="#main">Skip to content</a>

{@render children()}
