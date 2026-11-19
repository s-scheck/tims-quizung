<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type TowerOffer, type TowerSide, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import { GROUP_TONE, ms, shortHint } from './towerStyle.ts';

  /**
   * Das Angebot an einer Höhenmarke: links helle Magie (für den eigenen Turm), rechts dunkle Magie (gegen andere).
   * Ein Tipp nimmt den Zauber. Liegt kompakt unten über dem Spielfeld, daneben und darüber wird weiter gebaut.
   * `urge`: Jemand hält gerade über der Linie, die dunkle Karte wird hervorgehoben.
   */
  let {
    offer,
    stock,
    urge = false,
    onChoose,
  }: { offer: TowerOffer; stock: TowerSpecial | null; urge?: boolean; onChoose: (side: TowerSide) => void } = $props();

  const sides: TowerSide[] = ['light', 'dark'];
  const purpose: Record<TowerSide, string> = { light: 'für deinen Turm', dark: 'gegen einen Gegner' };
</script>

<div
  class="offer w-full"
  onpointerdown={(e) => e.stopPropagation()}
  role="group"
  aria-label="Zauber wählen"
  in:fly={{ y: 80, duration: ms(460), easing: backOut }}
  out:fade={{ duration: ms(200), easing: cubicIn }}
>
  <div class="mb-1.5 flex items-center justify-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-white">
    <span class="head-pill rounded-full px-2.5 py-0.5">Wähle deine Magie</span>
    {#if stock}<span class="head-pill rounded-full px-2.5 py-0.5 normal-case tracking-normal text-white/80">ersetzt {TOWER_SPECIALS[stock]?.name ?? stock}</span>{/if}
  </div>
  <div class="grid grid-cols-2 gap-2">
    {#each sides as side (side)}
      {@const s = offer[side]}
      {@const tone = GROUP_TONE[side]}
      {#key s}
        <button
          class="card card-{side} relative flex flex-col items-start overflow-hidden rounded-2xl p-2.5 text-left {urge && side === 'dark' ? 'card-urge' : ''}"
          style="--glow:{tone.glow}"
          onclick={() => onChoose(side)}
          aria-label="{tone.label}: {TOWER_SPECIALS[s]?.name ?? s}"
        >
          <span class="shine absolute inset-0" aria-hidden="true"></span>
          <span class="relative flex w-full items-center gap-2">
            <TowerBadge special={s} size={36} glow />
            <span class="min-w-0 flex-1">
              <span class="kicker block text-[0.55rem] font-extrabold uppercase leading-tight tracking-[0.16em]">{tone.label}</span>
              <span class="block text-[1rem] font-black leading-tight">{TOWER_SPECIALS[s]?.name ?? s}</span>
            </span>
          </span>
          <span class="relative mt-1.5 text-[0.7rem] font-semibold leading-snug opacity-80">{shortHint(s)}</span>
          <span class="relative mt-1 text-[0.6rem] font-extrabold uppercase tracking-wider opacity-60">{purpose[side]}</span>
        </button>
      {/key}
    {/each}
  </div>
</div>

<style>
  .head-pill {
    background: rgba(10, 16, 30, 0.62);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .card {
    min-height: 6.6rem;
    transition: transform 90ms ease;
    -webkit-tap-highlight-color: transparent;
    animation: card-in 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both;
  }
  .card:active {
    transform: scale(0.97);
  }
  .card-light {
    color: #3f2900;
    background:
      radial-gradient(120% 90% at 20% 0%, rgba(255, 255, 255, 0.85), transparent 55%),
      linear-gradient(165deg, #fff4d1 0%, #f7d77e 55%, #e1a634 100%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.6),
      inset 0 -3px 0 rgba(160, 100, 10, 0.45),
      0 10px 26px -10px var(--glow);
  }
  .card-light .kicker {
    color: #8a5a00;
  }
  .card-dark {
    color: #f1ecff;
    background:
      radial-gradient(120% 90% at 80% 0%, rgba(150, 120, 255, 0.45), transparent 55%),
      linear-gradient(165deg, #2b2166 0%, #1a1446 55%, #0d0b2a 100%);
    box-shadow:
      inset 0 0 0 1px rgba(170, 150, 255, 0.35),
      inset 0 -3px 0 rgba(90, 60, 200, 0.6),
      0 10px 26px -10px var(--glow);
    animation-delay: 70ms;
  }
  .card-dark .kicker {
    color: #c3b2ff;
  }
  .card-urge {
    animation:
      card-in 420ms cubic-bezier(0.2, 0.9, 0.3, 1.15) both,
      urge 900ms ease-in-out infinite;
  }
  .shine {
    background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.22) 48%, transparent 60%);
    transform: translateX(-100%);
    animation: shine 2.8s 0.5s ease-in-out infinite;
  }
  .card-dark .shine {
    background: linear-gradient(105deg, transparent 35%, rgba(190, 170, 255, 0.18) 48%, transparent 60%);
  }
  @keyframes card-in {
    from {
      transform: translateY(18px) scale(0.92);
      opacity: 0;
    }
  }
  @keyframes shine {
    0% {
      transform: translateX(-100%);
    }
    45%,
    100% {
      transform: translateX(100%);
    }
  }
  @keyframes urge {
    50% {
      box-shadow:
        inset 0 0 0 2px #b9a2ff,
        inset 0 -3px 0 rgba(90, 60, 200, 0.6),
        0 0 34px 2px rgba(124, 88, 245, 0.75);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card,
    .card-urge {
      animation: none !important;
    }
  }
</style>
