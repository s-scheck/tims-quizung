<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type TowerOffer, type TowerSide, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import { GROUP_TONE, ms, shortHint, tinyHint } from './towerStyle.ts';

  /**
   * Das Angebot an einer Höhenmarke als schlanke Leiste über den Knöpfen: links helle Magie (golden, für den
   * eigenen Turm), rechts dunkle Magie (violett, gegen andere). Ein Tipp nimmt den Zauber, es wird weiter gebaut.
   * `urge`: Jemand hält gerade über der Linie, der dunkle Chip pulsiert.
   */
  let {
    offer,
    stock,
    urge = false,
    onChoose,
  }: { offer: TowerOffer; stock: TowerSpecial | null; urge?: boolean; onChoose: (side: TowerSide) => void } = $props();

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
  {#if stock}
    <p class="mx-auto mb-1 w-fit rounded-full bg-[rgba(10,16,30,0.6)] px-2 py-0.5 text-center text-[0.62rem] font-bold text-white/85 backdrop-blur-md">
      ersetzt {TOWER_SPECIALS[stock]?.name ?? stock}
    </p>
  {/if}
  <div class="grid grid-cols-2 gap-1.5">
    {#each sides as side (side)}
      {@const s = offer[side]}
      {#key s}
        <button
          class="chip chip-{side} flex h-12 items-center gap-2 rounded-2xl pl-1.5 pr-2 text-left {urge && side === 'dark' ? 'chip-urge' : ''}"
          style="--glow:{GROUP_TONE[side].glow}"
          onclick={() => onChoose(side)}
          aria-label="{GROUP_TONE[side].label}: {TOWER_SPECIALS[s]?.name ?? s}"
          title={shortHint(s)}
        >
          <TowerBadge special={s} size={34} />
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block break-words text-[0.82rem] font-black">{TOWER_SPECIALS[s]?.name ?? s}</span>
            <span class="sub block break-words text-[0.64rem] font-semibold">{tinyHint(s)}</span>
          </span>
        </button>
      {/key}
    {/each}
  </div>
</div>

<style>
  .chip {
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
