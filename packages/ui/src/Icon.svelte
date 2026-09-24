<script lang="ts">
  import type { IconWeight } from 'phosphor-svelte';
  import ArrowSquareOut from 'phosphor-svelte/lib/ArrowSquareOut';
  import Article from 'phosphor-svelte/lib/Article';
  import Check from 'phosphor-svelte/lib/Check';
  import Clock from 'phosphor-svelte/lib/Clock';
  import Image from 'phosphor-svelte/lib/Image';
  import Link from 'phosphor-svelte/lib/Link';
  import ListBullets from 'phosphor-svelte/lib/ListBullets';
  import SignOut from 'phosphor-svelte/lib/SignOut';
  import SlidersHorizontal from 'phosphor-svelte/lib/SlidersHorizontal';
  import Warning from 'phosphor-svelte/lib/Warning';
  import X from 'phosphor-svelte/lib/X';
  import type { IconName } from './lib/types.ts';

  let { name, size = 20, weight = 'regular' }: { name: IconName; size?: number; weight?: IconWeight } = $props();

  // Per-icon imports keep the dev server from crawling Phosphor's full barrel.
  const icons = {
    image: Image,
    article: Article,
    thread: ListBullets,
    settings: SlidersHorizontal,
    x: X,
    check: Check,
    external: ArrowSquareOut,
    link: Link,
    logout: SignOut,
    alert: Warning,
    clock: Clock,
  } satisfies Record<IconName, unknown>;

  const Glyph = $derived(icons[name]);
</script>

<Glyph {size} {weight} aria-hidden="true" />
