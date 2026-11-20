<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type TowerOffer, type TowerSide, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import { longPress } from './towerLongPress.ts';
  import { GROUP_TONE, ms, tinyHint } from './towerStyle.ts';

  /**
   * Das Angebot an einer Höhenmarke als schlanke Leiste über den Knöpfen: links helle Magie (golden, für den
   * eigenen Turm), rechts dunkle Magie (violett, gegen andere). Ein Tipp legt den Zauber hinten in den Vorrat, es
   * wird weiter gebaut. Ist der Vorrat voll, verdrängt die Wahl den vordersten (`replaces`), das steht dezent im Chip.
   * `urge`: Jemand hält gerade über der Linie, der dunkle Chip pulsiert. Langer Druck auf einen Chip: `onInfo`.
   */
  let {
    offer,
    replaces = null,
    urge = false,
    onChoose,
    onInfo,
  }: {
    offer: TowerOffer;
    replaces?: TowerSpecial | null;
    urge?: boolean;
    onChoose: (side: TowerSide) => void;
    onInfo?: (special: TowerSpecial) => void;
  } = $props();

  const sides: TowerSide[] = ['light', 'dark'];
</script>

<div
  class="w-full"
  onpointerdown={(e) => e.stopPropagation()}
  role="group"
  aria-label="Zauber wählen"
  in:fly={{ y: 40, duration: ms(380), easing: backOut }}
  out:fade={{ duration: ms(180), easing: cubicIn }}
>
  <div class="grid grid-cols-2 gap-1.5">
    {#each sides as side (side)}
      {@const s = offer[side]}
      {#key s}
        <button
          class="chip chip-{side} flex min-h-12 items-center gap-2 rounded-2xl py-1 pl-1.5 pr-2 text-left {urge && side === 'dark' ? 'chip-urge' : ''}"
          style="--glow:{GROUP_TONE[side].glow}"
          use:longPress={onInfo ? { onLong: () => onInfo(s) } : null}
          onclick={() => onChoose(side)}
          aria-label="{GROUP_TONE[side].label}: {TOWER_SPECIALS[s]?.name ?? s}"
          title="{TOWER_SPECIALS[s]?.hint ?? ''}{replaces ? ` (ersetzt ${TOWER_SPECIALS[replaces]?.name ?? replaces})` : ''}"
        >
          <TowerBadge special={s} size={34} />
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block break-words text-[0.82rem] font-black">{TOWER_SPECIALS[s]?.name ?? s}</span>
            <span class="sub block break-words text-[0.64rem] font-semibold">{tinyHint(s)}</span>
            {#if replaces}
              <span class="rep mt-px flex items-center gap-1 text-[0.58rem] font-bold">
                <svg viewBox="0 0 24 24" class="h-2.5 w-2.5 shrink-0" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span class="min-w-0 truncate">ersetzt {TOWER_SPECIALS[replaces]?.name ?? replaces}</span>
              </span>
            {/if}
          </span>
        </button>
      {/key}
    {/each}
  </div>
</div>

<style>
  .chip {
    -webkit-touch-callout: none;
    transition: transform 90ms ease;
    -webkit-tap-highlight-color: transparent;
    animation: chip-in 360ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
  }
  .chip:active {
    transform: scale(0.97);
  }
  .chip-light {
    color: #3f2900;
    background: linear-gradient(165deg, #fff3cc 0%, #f5d47a 60%, #e5ae3e 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.55),
      0 6px 16px -8px var(--glow);
  }
  .chip-light .sub {
    color: rgba(63, 41, 0, 0.72);
  }
  .chip-light .rep {
    color: rgba(63, 41, 0, 0.55);
  }
  .chip-dark {
    color: #f1ecff;
    background: linear-gradient(165deg, #33287a 0%, #1d1650 60%, #110d33 100%);
    box-shadow:
      inset 0 0 0 1px rgba(170, 150, 255, 0.4),
      0 6px 16px -8px var(--glow);
    animation-delay: 60ms;
  }
  .chip-dark .sub {
    color: rgba(225, 216, 255, 0.75);
  }
  .chip-dark .rep {
    color: rgba(225, 216, 255, 0.55);
  }
  .chip-urge {
    animation:
      chip-in 360ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both,
      urge 900ms ease-in-out infinite;
  }
  @keyframes chip-in {
    from {
      transform: translateY(10px) scale(0.95);
      opacity: 0;
    }
  }
  @keyframes urge {
    50% {
      box-shadow:
        inset 0 0 0 2px #b9a2ff,
        0 0 24px 2px rgba(124, 88, 245, 0.75);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip,
    .chip-urge {
      animation: none !important;
    }
  }
</style>
