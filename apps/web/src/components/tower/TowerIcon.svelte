<script lang="ts">
  import type { TowerSpecial } from '@quiz/shared';

  /**
   * Schlichte Liniensymbole für die Zauber, in der Textfarbe. Unbekannte Zauber bekommen einen Funken.
   * `luck` ist kein Zauber, sondern das Kleeblatt des Glücks-Slots.
   */
  let { special, size = 20, class: className = '' }: { special: TowerSpecial | 'luck'; size?: number; class?: string } = $props();
</script>

<svg class={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if special === 'glue'}
    <!-- Ranken: geschwungener Trieb mit Blättern -->
    <path d="M12 21c0-5 -4-6 -4-10s4-5 4-8" />
    <path d="M12 21c0-4 4-5 4-8" />
    <path d="M8 11c-2.5 0-4-1.5-4-3.5 2.5 0 4 1.5 4 3.5zM16 13c2.5 0 4-1.5 4-3.5-2.5 0-4 1.5-4 3.5zM12 3c1.8 0 3 1 3 2.6-1.8 0-3-1-3-2.6z" />
  {:else if special === 'mini'}
    <!-- Mini-Steine: drei winzige Steine, darüber Pfeile nach innen -->
    <path d="M4 15h4v4H4zM10 15h4v4h-4zM16 15h4v4h-4z" />
    <path d="M5 4l3.5 3.5M8.5 4.5v3H5.5M19 4l-3.5 3.5M15.5 4.5v3h3" />
  {:else if special === 'beam'}
    <path d="M3 6h18M3 18h18M12 6v12M8 6v2M16 6v2M8 16v2M16 16v2" />
  {:else if special === 'petrify'}
    <!-- Versteinern: Fels mit Bruchkanten -->
    <path d="M4 19l2-8 5-5 6 2 3 6-2 5z" />
    <path d="M6 11l5 2 6-5M11 13l1 6M11 13l7 1" />
  {:else if special === 'heavy'}
    <!-- Schwerer Stein: Gewicht mit Griff -->
    <path d="M9.2 7.5a2.8 2.8 0 1 1 5.6 0" />
    <path d="M6.6 8.5h10.8l2.6 11.5H4z" />
    <path d="M9.5 15.5h5" />
  {:else if special === 'pick'}
    <!-- Steinwahl: zwei Formen zur Auswahl -->
    <path d="M3 5h4v9h4v4H3z" />
    <path d="M14 11h7v7h-7z" />
    <path d="M16.5 4.5l1.5 3 1.5-3" />
  {:else if special === 'vanish'}
    <!-- Wegzaubern: Stein, der in Funken zerfällt -->
    <path d="M5 13h6v6H5z" stroke-dasharray="2.2 2" />
    <path d="M15 4l1 2.2L18.2 7 16 8l-1 2.2L14 8l-2.2-1L14 6.2zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6z" />
  {:else if special === 'grow'}
    <!-- Vergrößern: großer Block mit Pfeilen nach außen -->
    <path d="M7.5 7.5h9v9h-9z" />
    <path d="M3 3l3 3M3 3h3.5M3 3v3.5M21 3l-3 3M21 3h-3.5M21 3v3.5M3 21l3-3M3 21h3.5M3 21v-3.5M21 21l-3-3M21 21h-3.5M21 21v-3.5" />
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
  {:else if special === 'luck'}
    <!-- Glück: vierblättriges Kleeblatt mit Stiel -->
    {#each [45, 135, 225, 315] as r (r)}
      <path transform="rotate({r} 12 12)" d="M12 11.2C10.2 9.9 7.6 8.6 7.6 6.4a2.2 2.2 0 0 1 4.4 0 2.2 2.2 0 0 1 4.4 0c0 2.2-2.6 3.5-4.4 4.8z" />
    {/each}
    <path d="M12 12.6c.5 3.2.1 6-1.6 8.9" />
  {:else}
    <path d="M12 3l2 6 6 .5-4.7 3.7 1.6 6-4.9-3.4-4.9 3.4 1.6-6L4 9.5l6-.5z" />
  {/if}
</svg>
