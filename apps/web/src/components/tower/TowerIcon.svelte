<script lang="ts">
  import type { TowerSpecial } from '@quiz/shared';

  /** Schlichte Liniensymbole für die Spezials, in der Textfarbe. */
  let { special, size = 20, class: className = '' }: { special: TowerSpecial; size?: number; class?: string } = $props();
</script>

<svg class={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if special === 'glue'}
    <path d="M12 3c3 4.2 5.5 7.4 5.5 10.6A5.5 5.5 0 0 1 6.5 13.6C6.5 10.4 9 7.2 12 3z" />
    <path d="M9.5 14.2a2.6 2.6 0 0 0 2.4 2.4" />
  {:else if special === 'shrink'}
    <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
  {:else if special === 'beam'}
    <path d="M3 6h18M3 18h18M12 6v12M8 6v2M16 6v2M8 16v2M16 16v2" />
  {:else if special === 'boulder'}
    <path d="M5 16l2-8 6-4 6 4 1 7-5 5H9z" />
    <path d="M9 11l3 2 4-2M12 13v4" />
  {:else if special === 'ice'}
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
    <path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5" />
  {:else if special === 'gust'}
    <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7" />
  {:else if special === 'fog'}
    <path d="M4 9h16M2 13h20M5 17h14M8 5h8" />
  {:else if special === 'turbo'}
    <path d="M13 2L5 14h6l-1 8 8-12h-6z" />
  {/if}
</svg>
