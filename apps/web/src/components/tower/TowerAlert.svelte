<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fade, scale } from 'svelte/transition';
  import { TOWER_HOLD_MS, TOWER_SPECIALS, type RoomView, type TowerSpecial } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import TowerRing from './TowerRing.svelte';
  import { HOLD_GREEN, ms } from './towerStyle.ts';

  /**
   * Alarm am Handy, wenn ein Gegner über der Linie hält: „Anna hält! Jetzt dunkle Magie!“.
   * Liegt ein dunkler Zauber im Vorrat, trifft ein Tipp auf den Knopf den Haltenden sofort.
   */
  let {
    view,
    holder,
    hold,
    shielded = false,
    dark = null,
    offerOpen = false,
    onStrike,
  }: {
    view: RoomView;
    holder: string;
    hold: number;
    shielded?: boolean;
    /** Dunkler Zauber im Vorrat, sonst null. */
    dark?: TowerSpecial | null;
    /** Ein Angebot ist offen: Hinweis auf die dunkle Karte. */
    offerOpen?: boolean;
    onStrike: () => void;
  } = $props();

  const left = $derived(Math.max(0, ((1 - hold) * TOWER_HOLD_MS) / 1000));
</script>

<div
  class="alert pointer-events-auto w-full max-w-[22rem] overflow-hidden rounded-2xl text-white"
  onpointerdown={(e) => e.stopPropagation()}
  role="alert"
  in:scale={{ start: 0.85, duration: ms(360), easing: backOut }}
  out:fade={{ duration: ms(220), easing: cubicIn }}
>
  <div class="flex items-center gap-3 px-3.5 pb-2.5 pt-3">
    <TowerRing value={hold} size={50} stroke={4} color={HOLD_GREEN}>
      <PlayerHead {view} id={holder} size={36} />
    </TowerRing>
    <div class="min-w-0 flex-1">
      <p class="text-[0.62rem] font-extrabold uppercase tracking-[0.22em] text-[#7ef0b6]">Noch {left.toFixed(1).replace('.', ',')} s</p>
      <p class="text-[1.15rem] font-black leading-tight">{playerName(view, holder)} hält!</p>
      <p class="text-sm font-extrabold text-[#c9b8ff]">{shielded ? 'Mit Schild, dein Zauber prallt ab.' : 'Jetzt dunkle Magie!'}</p>
    </div>
  </div>
  {#if dark}
    <button class="strike flex w-full items-center justify-center gap-2 py-3 text-base font-black uppercase tracking-wide" onclick={onStrike}>
      <TowerBadge special={dark} size={28} />
      {TOWER_SPECIALS[dark]?.name ?? dark} auf {playerName(view, holder)}!
    </button>
  {:else if offerOpen}
    <p class="bg-white/5 px-3.5 py-2 text-xs font-bold text-white/75">Nimm unten die dunkle Karte!</p>
  {/if}
</div>

<style>
  .alert {
    background: linear-gradient(160deg, rgba(30, 22, 70, 0.92), rgba(12, 10, 34, 0.92));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow:
      inset 0 0 0 1px rgba(62, 224, 143, 0.55),
      0 0 40px -6px rgba(62, 224, 143, 0.55),
      0 14px 30px -14px rgba(0, 0, 0, 0.7);
    animation: alarm 900ms ease-in-out infinite;
  }
  .strike {
    color: white;
    background: linear-gradient(180deg, #7a5cff, #3a2894);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    -webkit-tap-highlight-color: transparent;
  }
  .strike:active {
    filter: brightness(1.15);
  }
  @keyframes alarm {
    50% {
      box-shadow:
        inset 0 0 0 2px rgba(62, 224, 143, 0.9),
        0 0 56px -2px rgba(62, 224, 143, 0.75),
        0 14px 30px -14px rgba(0, 0, 0, 0.7);
    }
  }
</style>
