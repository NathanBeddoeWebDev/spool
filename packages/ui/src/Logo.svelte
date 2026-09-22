<script lang="ts">
  let { size = 28, wordmark = true }: { size?: number; wordmark?: boolean } = $props();
</script>

<span class="logo">
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="16" fill="var(--sp-accent)" />
    <path
      d="M21.5 10.5c-.8-1.6-2.9-2.6-5.5-2.6-3.3 0-5.6 1.6-5.6 3.8 0 4.9 11.4 3 11.4 8.5 0 2.3-2.5 3.9-5.8 3.9-2.8 0-5-1.1-5.8-2.8"
      fill="none"
      stroke="var(--sp-accent-ink)"
      stroke-width="2.4"
      stroke-linecap="round"
    />
  </svg>
  {#if wordmark}<span class="word">Spool</span>{/if}
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 9px;
  }
  .word {
    font-family: var(--sp-font-serif);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
</style>
