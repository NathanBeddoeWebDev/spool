<script lang="ts">
  let { value, max }: { value: number; max: number } = $props();
  const r = 9;
  const c = 2 * Math.PI * r;
  const ratio = $derived(Math.min(value / max, 1));
  const remaining = $derived(max - value);
  const tone = $derived(value > max ? 'over' : remaining <= 20 ? 'near' : 'ok');
</script>

<span class="ring {tone}" title="{value} / {max} characters" aria-label="{value} of {max} characters">
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" {r} class="track" />
    <circle cx="12" cy="12" {r} class="fill" stroke-dasharray={c} stroke-dashoffset={c * (1 - ratio)} />
  </svg>
  {#if remaining <= 20}
    <span class="num">{remaining}</span>
  {/if}
</span>

<style>
  .ring {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--sp-muted);
  }
  svg {
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 2.5;
  }
  .track {
    stroke: var(--sp-line);
  }
  .fill {
    stroke: var(--sp-accent);
    stroke-linecap: round;
    transition:
      stroke-dashoffset 0.2s var(--sp-ease),
      stroke 0.2s;
  }
  .near .fill {
    stroke: var(--sp-warn);
  }
  .near .num {
    color: var(--sp-warn);
  }
  .over .fill {
    stroke: var(--sp-danger);
  }
</style>
