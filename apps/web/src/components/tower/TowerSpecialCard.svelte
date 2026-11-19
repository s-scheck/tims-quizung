<script lang="ts">
  import { backOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import { specialTargetsOthers, TOWER_SPECIALS, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import { ms, shortHint, toneOf } from './towerStyle.ts';

  /**
   * Spezial-Platz über dem Spielfeld: als Karte mit Plakette, Name und kurzer Wirkung, sobald etwas im Vorrat liegt
   * (fliegt beim Erhalt ein). Leer ein schmaler Hinweis, wo das nächste Spezial wartet.
   */
  let {
    stock,
    nextMark = null,
    disabled = false,
    onTap,
    compact = false,
  }: { stock: TowerSpecial | null; nextMark?: number | null; disabled?: boolean; onTap: () => void; compact?: boolean } = $props();
</script>

{#if stock}
  {#key stock}
    {@const tone = toneOf(stock)}
    <button
      class="card relative flex w-full items-center gap-2.5 overflow-hidden rounded-2xl py-2 pl-2 pr-3 text-left text-white"
      style="--glow:{tone.glow}; --edge:{tone.to}"
      {disabled}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={onTap}
      aria-label="Spezial {TOWER_SPECIALS[stock]?.name ?? stock} einsetzen"
      in:fly={{ x: 120, y: -40, duration: ms(520), easing: backOut, opacity: 0 }}
    >
      <span class="card-sheen absolute inset-0" aria-hidden="true"></span>
      <span class="relative"><TowerBadge special={stock} size={compact ? 30 : 40} glow /></span>
      <span class="relative min-w-0 flex-1">
        {#if !compact}<span class="block text-[0.58rem] font-extrabold uppercase tracking-[0.2em]" style="color:{tone.text}">{tone.label}</span>{/if}
        <span class="block text-[0.95rem] font-black leading-tight">{TOWER_SPECIALS[stock]?.name ?? stock}{#if compact}<span class="ml-1.5 text-[0.7rem] font-bold text-white/60">im Vorrat</span>{/if}</span>
        {#if !compact}<span class="block text-[0.7rem] font-semibold leading-snug text-white/70">{shortHint(stock)}</span>{/if}
      </span>
      <span class="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-white" aria-hidden="true">
        {#if specialTargetsOthers(stock)}
          <svg viewBox="0 0 24 24" class="h-4 w-4"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.2" /><circle cx="12" cy="12" r="2.2" fill="currentColor" /></svg>
        {:else}
          <svg viewBox="0 0 24 24" class="h-4 w-4"><path d="M5 12.5 10 17l9-10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        {/if}
      </span>
    </button>
  {/key}
{:else}
  <div class="empty flex w-fit items-center gap-2 rounded-full py-1.5 pl-2 pr-3 text-[0.7rem] font-bold text-white/80">
    <svg viewBox="0 0 24 24" class="h-4 w-4 shrink-0 text-white/70" aria-hidden="true"
      ><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg
    >
    {#if nextMark !== null}Nächste Magie bei <span class="font-black text-white">{nextMark} m</span>{:else}Spezialsteine bringen Magie{/if}
  </div>
{/if}

<style>
  .card {
    background: linear-gradient(135deg, rgba(14, 20, 38, 0.84), rgba(14, 20, 38, 0.7));
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.14),
      inset 0 -3px 0 var(--edge),
      0 0 24px -6px var(--glow),
      0 10px 24px -14px rgba(0, 0, 0, 0.7);
    transition: transform 90ms ease;
    -webkit-tap-highlight-color: transparent;
    animation: ready 2.4s ease-in-out infinite;
  }
  .card:active:not(:disabled) {
    transform: scale(0.97);
  }
  .card:disabled {
    opacity: 0.6;
  }
  .card-sheen {
    background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.16) 48%, transparent 60%);
    transform: translateX(-100%);
    animation: sheen 3.2s 0.6s ease-in-out infinite;
  }
  .empty {
    background: rgba(10, 16, 30, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  @keyframes sheen {
    0% {
      transform: translateX(-100%);
    }
    40%,
    100% {
      transform: translateX(100%);
    }
  }
  @keyframes ready {
    50% {
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.2),
        inset 0 -3px 0 var(--edge),
        0 0 34px -4px var(--glow),
        0 10px 24px -14px rgba(0, 0, 0, 0.7);
    }
  }
</style>
