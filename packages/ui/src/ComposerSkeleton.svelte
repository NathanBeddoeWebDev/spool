<script lang="ts">
  // Presentational only.
</script>

<!-- Placeholder with the composer's shape, shown while the session and draft load. -->
<div class="skeleton" aria-busy="true" aria-label="Loading the composer">
  <div class="layout">
    <div class="editor">
      <div class="lines">
        <span style:--w="82%"></span>
        <span style:--w="64%"></span>
        <span style:--w="71%"></span>
      </div>
      <div class="bar">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        <span class="btn"></span>
      </div>
    </div>
    <div class="side">
      <span class="block"></span>
    </div>
  </div>
</div>

<style>
  .skeleton {
    container-type: inline-size;
  }
  .layout {
    display: grid;
    gap: 24px;
  }
  .side {
    display: none;
  }
  @container (min-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
      gap: 32px;
    }
    .side {
      display: block;
    }
  }
  .editor {
    border-radius: var(--sp-radius-lg);
    background: var(--sp-surface);
    border: 1px solid var(--sp-line);
  }
  .lines {
    display: grid;
    gap: 14px;
    padding: 28px 24px 110px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-top: 1px solid var(--sp-line);
  }
  .lines span,
  .dot,
  .btn,
  .block {
    position: relative;
    overflow: hidden;
    display: block;
    background: var(--sp-sunken);
  }
  .lines span {
    width: var(--w);
    height: 14px;
    border-radius: 6px;
  }
  .dot {
    width: 22px;
    height: 22px;
    border-radius: 7px;
  }
  .btn {
    margin-left: auto;
    width: 120px;
    height: 38px;
    border-radius: 999px;
  }
  .block {
    height: 180px;
    border-radius: var(--sp-radius);
  }
  .lines span::after,
  .dot::after,
  .btn::after,
  .block::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--sp-surface) 70%, transparent),
      transparent
    );
    transform: translateX(-100%);
    animation: shimmer 1.4s var(--sp-ease) infinite;
  }
  @keyframes shimmer {
    to {
      transform: translateX(100%);
    }
  }
</style>
