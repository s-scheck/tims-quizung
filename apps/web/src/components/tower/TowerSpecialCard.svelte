<script lang="ts">
  import { backOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { specialTargetsOthers, TOWER_SPECIALS, TOWER_STOCK_MAX, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import TowerRing from './TowerRing.svelte';
  import { longPress } from './towerLongPress.ts';
  import { groupOf, ms } from './towerStyle.ts';

  /**
   * Runde Zauber-Taste in der Mitte der Steuerleiste: der Vorrat aus Höhenmarken. Sie zeigt immer den Zauber, der
   * als Nächstes drankommt (`stock[0]`), darunter drei Punkte für die Plätze im Vorrat, gefüllt in der Farbe der
   * Zauber (gold hell, violett dunkel) und von links nach rechts in der Reihenfolge, in der sie drankommen.
   * Ein Tipp setzt den vordersten ein (dunkle Magie fragt nach dem Ziel), langer Druck zeigt den ganzen Vorrat.
   * Leer: unauffällig, der Ring zeigt den Weg zur nächsten Höhenmarke und darunter steht klein ihre Höhe.
   */
  let {
    stock,
    nextMark = null,
    progress = 0,
    disabled = false,
    onTap,
    onInfo,
  }: {
    stock: readonly TowerSpecial[];
    nextMark?: number | null;
    progress?: number;
    disabled?: boolean;
    onTap: () => void;
    onInfo?: () => void;
  } = $props();

  const head = $derived(stock[0] ?? null);
  const dark = $derived(head ? groupOf(head) === 'dark' : false);
  const slots = $derived(Array.from({ length: TOWER_STOCK_MAX }, (_, i) => stock[i] ?? null));
  const info = $derived(onInfo ? { onLong: onInfo } : null);
</script>

{#if head}
  <div class="relative">
    {#key head}
      <button
        class="magic magic-{dark ? 'dark' : 'light'} relative grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full"
        {disabled}
        use:longPress={info}
        onpointerdown={(e) => e.stopPropagation()}
        onclick={onTap}
        aria-label="Zauber {TOWER_SPECIALS[head]?.name ?? head} einsetzen"
        title="{TOWER_SPECIALS[head]?.name ?? head}{specialTargetsOthers(head) ? ': Ziel wählen' : ''} · {TOWER_SPECIALS[head]?.hint ?? ''}"
        in:scale={{ start: 0.4, duration: ms(420), easing: backOut }}
      >
        <TowerBadge special={head} size={40} glow />
      </button>
    {/key}
    <!-- Vorrat: drei Plätze, der linke ist der in der Taste -->
    <span class="dots pointer-events-none absolute -bottom-[5px] left-1/2 flex -translate-x-1/2 items-center gap-[3px] rounded-full px-[4px] py-[2.5px]" aria-label="{stock.length} von {TOWER_STOCK_MAX} im Vorrat">
      {#each slots as s, i (i)}
        <span class="dot {s ? (groupOf(s) === 'dark' ? 'dot-dark' : 'dot-light') : 'dot-empty'} {i === 0 ? 'dot-now' : ''}"></span>
      {/each}
    </span>
  </div>
{:else}
  <div
    class="empty grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full"
    use:longPress={info}
    role="img"
    aria-label={nextMark !== null ? `Vorrat leer, nächste Magie bei ${nextMark} m` : 'Vorrat leer'}
    title={nextMark !== null ? `Nächste Magie bei ${nextMark} m` : 'Höhenmarken bringen Magie'}
  >
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
    -webkit-touch-callout: none;
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
  .dots {
    background: rgba(8, 12, 26, 0.85);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 999px;
    transition: background-color 200ms ease;
  }
  .dot-now {
    width: 6px;
    height: 6px;
  }
  .dot-light {
    background: #ffd36b;
    box-shadow: 0 0 4px rgba(255, 211, 107, 0.8);
  }
  .dot-dark {
    background: #b9a2ff;
    box-shadow: 0 0 4px rgba(185, 162, 255, 0.8);
  }
  .dot-empty {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.35);
  }
  .empty {
    background: rgba(255, 255, 255, 0.06);
    -webkit-touch-callout: none;
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
