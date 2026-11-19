<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type RoomView, type TowerSpecial } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import { GROUP_TONE, hitHint, ms, toneOf } from './towerStyle.ts';

  /**
   * Großes, kurzes Banner, wenn mich ein dunkler Zauber trifft („Ben wirft Glatteis auf dich!“)
   * oder mein Schild ihn abgefangen hat („Dein Schild hat Glatteis abgefangen!“).
   */
  let { view, by, special, blocked = false }: { view: RoomView; by: string; special: TowerSpecial; blocked?: boolean } = $props();
  const tone = $derived(blocked ? GROUP_TONE.light : toneOf(special));
  const name = $derived(TOWER_SPECIALS[special]?.name ?? special);
</script>

<div
  class="toast pointer-events-none relative flex w-full max-w-[22rem] items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-white"
  style="--glow:{tone.glow}; --edge:{tone.to}"
  in:fly={{ y: -28, duration: ms(420), easing: backOut }}
  out:fade={{ duration: ms(260), easing: cubicIn }}
  role="status"
>
  <span class="toast-sheen absolute inset-0" aria-hidden="true"></span>
  <span class="relative">
    {#if blocked}
      <TowerBadge special="shield" size={48} glow />
    {:else}
      <TowerBadge {special} size={48} glow />
    {/if}
  </span>
  <span class="relative min-w-0 flex-1">
    <span class="block text-[0.62rem] font-extrabold uppercase tracking-[0.22em]" style="color:{tone.text}">{blocked ? 'Abgewehrt' : `${tone.label} gegen dich`}</span>
    {#if blocked}
      <span class="mt-0.5 block text-[1.05rem] font-black leading-tight">Dein Schild hat {name} abgefangen!</span>
      <span class="flex items-center gap-1 text-xs font-semibold text-white/65">von <PlayerHead {view} id={by} size={16} />{playerName(view, by)}</span>
    {:else}
      <span class="mt-0.5 flex items-center gap-1.5 text-[1.05rem] font-black leading-tight">
        <PlayerHead {view} id={by} size={22} />
        <span class="min-w-0 break-words">{playerName(view, by)} wirft {name} auf dich!</span>
      </span>
      {#if hitHint(special)}<span class="block text-xs font-semibold text-white/65">{hitHint(special)}</span>{/if}
    {/if}
  </span>
</div>

<style>
  .toast {
    background: linear-gradient(135deg, rgba(14, 20, 38, 0.88), rgba(14, 20, 38, 0.76));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.12),
      inset 3px 0 0 var(--edge),
      0 14px 34px -12px var(--glow),
      0 10px 24px -14px rgba(0, 0, 0, 0.6);
  }
  .toast-sheen {
    background: linear-gradient(105deg, transparent 30%, rgba(255, 255, 255, 0.12) 45%, transparent 60%);
    transform: translateX(-100%);
    animation: sheen 1100ms 200ms ease-out forwards;
  }
  @keyframes sheen {
    to {
      transform: translateX(100%);
    }
  }
</style>
