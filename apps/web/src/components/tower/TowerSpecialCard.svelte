<script lang="ts">
  import { backOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { specialTargetsOthers, TOWER_SPECIALS, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import TowerRing from './TowerRing.svelte';
  import { groupOf, ms } from './towerStyle.ts';

  /**
   * Runde Zauber-Taste in der Mitte der Steuerleiste. Mit Vorrat: die Plakette des Zaubers mit leuchtendem Ring,
   * ein Tipp setzt ihn ein (dunkle Magie fragt nach dem Ziel). Leer: unauffällig, der Ring zeigt den Weg zur
   * nächsten Magie-Marke und darunter steht klein ihre Höhe.
   */
  let {
    stock,
    nextMark = null,
    progress = 0,
    disabled = false,
    onTap,
  }: { stock: TowerSpecial | null; nextMark?: number | null; progress?: number; disabled?: boolean; onTap: () => void } = $props();

  const dark = $derived(stock ? groupOf(stock) === 'dark' : false);
</script>

{#if stock}
  {#key stock}
    <button
      class="magic magic-{dark ? 'dark' : 'light'} relative grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full"
      {disabled}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={onTap}
      aria-label="Zauber {TOWER_SPECIALS[stock]?.name ?? stock} einsetzen"
      title="{TOWER_SPECIALS[stock]?.name ?? stock}{specialTargetsOthers(stock) ? ': Ziel wählen' : ''}"
      in:scale={{ start: 0.4, duration: ms(420), easing: backOut }}
    >
      <TowerBadge special={stock} size={40} glow />
    </button>
  {/key}
{:else}
  <div class="empty grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full" title={nextMark !== null ? `Nächste Magie bei ${nextMark} m` : 'Spezialsteine bringen Magie'}>
    <TowerRing value={nextMark !== null ? progress : 0} size={52} stroke={2} color="rgba(255, 214, 110, 0.85)" track="rgba(255,255,255,0.12)">
      <span class="flex flex-col items-center leading-none text-white/70">
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" aria-hidden="true"
          ><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg
        >
        {#if nextMark !== null}<span class="mt-0.5 text-[0.6rem] font-extrabold tabular-nums">{nextMark} m</span>{/if}
      </span>
    </TowerRing>
  </div>
{/if}

<style>
  .magic {
    -webkit-tap-highlight-color: transparent;
    transition: transform 90ms ease;
    animation: ready 1.8s ease-in-out infinite;
  }
  .magic-light {
    background: radial-gradient(closest-side, rgba(255, 214, 110, 0.35), rgba(255, 214, 110, 0.08));
    box-shadow:
      0 0 0 2px rgba(255, 214, 110, 0.9),
      0 0 18px -2px rgba(250, 196, 70, 0.7);
  }
  .magic-dark {
    background: radial-gradient(closest-side, rgba(150, 120, 255, 0.4), rgba(124, 88, 245, 0.1));
    box-shadow:
      0 0 0 2px rgba(185, 162, 255, 0.95),
      0 0 18px -2px rgba(124, 88, 245, 0.8);
  }
  .magic:active:not(:disabled) {
    transform: scale(0.92);
  }
  .magic:disabled {
    opacity: 0.55;
    animation: none;
  }
  .empty {
    background: rgba(255, 255, 255, 0.06);
  }
  @keyframes ready {
    50% {
      transform: scale(1.06);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .magic {
      animation: none;
    }
  }
</style>
