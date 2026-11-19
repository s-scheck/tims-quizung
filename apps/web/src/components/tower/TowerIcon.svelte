<script lang="ts">
  import type { TowerSpecial } from '@quiz/shared';

  /** Schlichte Liniensymbole für die Zauber, in der Textfarbe. Unbekannte Zauber bekommen einen Funken. */
  let { special, size = 20, class: className = '' }: { special: TowerSpecial; size?: number; class?: string } = $props();
</script>

<svg class={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if special === 'glue'}
    <!-- Ranken: geschwungener Trieb mit Blättern -->
    <path d="M12 21c0-5 -4-6 -4-10s4-5 4-8" />
    <path d="M12 21c0-4 4-5 4-8" />
    <path d="M8 11c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM16 13c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5zM12 3c1.8 0 3 1 3 2.6-1.8 0-3-1-3-2.6z" />
  {:else if special === 'shrink'}
    <path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5" />
  {:else if special === 'beam'}
    <path d="M3 6h18M3 18h18M12 6v12M8 6v2M16 6v2M8 16v2M16 16v2" />
  {:else if special === 'petrify'}
    <!-- Versteinern: Fels mit Bruchkanten -->
    <path d="M4 19l2-8 5-5 6 2 3 6-2 5z" />
    <path d="M6 11l5 2 6-5M11 13l1 6M11 13l7 1" />
  {:else if special === 'shield'}
    <path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  {:else if special === 'vanish'}
    <!-- Wegzaubern: Stein, der in Funken zerfällt -->
    <path d="M5 13h6v6H5z" stroke-dasharray="2.2 2" />
    <path d="M15 4l1 2.2L18.2 7 16 8l-1 2.2L14 8l-2.2-1L14 6.2zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6z" />
  {:else if special === 'boulder'}
    <!-- Riesenstein: großer Block mit Pfeilen nach außen -->
    <path d="M7 7h10v10H7z" />
    <path d="M3 3l3 3M21 3l-3 3M3 21l3-3M21 21l-3-3" />
  {:else if special === 'ice'}
    <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
    <path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5" />
  {:else if special === 'gust'}
    <path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h7" />
  {:else if special === 'fog'}
    <path d="M4 9h16M2 13h20M5 17h14M8 5h8" />
  {:else if special === 'turbo'}
    <path d="M13 2L5 14h6l-1 8 8-12h-6z" />
  {:else if special === 'round'}
    <!-- Rundstein: Kugel mit Rollspur -->
    <circle cx="13" cy="11" r="6" />
    <path d="M10 8.5a3.5 3.5 0 0 1 3-1.5M2 20h20M3 15h3" />
  {:else}
    <path d="M12 3l2 6 6 .5-4.7 3.7 1.6 6-4.9-3.4-4.9 3.4 1.6-6L4 9.5l6-.5z" />
  {/if}
</svg>
