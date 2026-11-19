<script lang="ts">
  import { backOut, cubicIn } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_HOLD_MS, TOWER_SPECIALS, type RoomView, type TowerSpecial } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import TowerRing from './TowerRing.svelte';
  import { HOLD_GREEN, ms } from './towerStyle.ts';

  /**
   * Schmale Alarm-Leiste am Handy, wenn ein Gegner über der Linie hält (dazu leuchtet der Feldrand grün).
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
    /** Ein Angebot ist offen: Hinweis auf den dunklen Chip. */
    offerOpen?: boolean;
    onStrike: () => void;
  } = $props();

  const left = $derived(Math.max(0, ((1 - hold) * TOWER_HOLD_MS) / 1000));
  const name = $derived(playerName(view, holder));
</script>

<div
  class="alert pointer-events-auto flex w-full max-w-[24rem] items-center gap-2 rounded-2xl py-1 pl-1 pr-1 text-white"
  onpointerdown={(e) => e.stopPropagation()}
  role="alert"
  in:fly={{ y: 12, duration: ms(300), easing: backOut }}
  out:fade={{ duration: ms(200), easing: cubicIn }}
>
  <TowerRing value={hold} size={34} stroke={3} color={HOLD_GREEN}>
    <PlayerHead {view} id={holder} size={24} />
  </TowerRing>
  <p class="min-w-0 flex-1 text-[0.78rem] font-extrabold leading-tight">
    <span class="break-words">{name} hält</span>
    <span class="font-mono font-bold tabular-nums text-[#7ef0b6]">{left.toFixed(1).replace('.', ',')} s</span>
    {#if shielded}<span class="block text-[0.64rem] font-semibold text-white/65">mit Schild</span>
    {:else if !dark && offerOpen}<span class="block text-[0.64rem] font-semibold text-[#c9b8ff]">Nimm die dunkle Magie!</span>{/if}
  </p>
  {#if dark}
    <button class="strike flex shrink-0 items-center gap-1.5 rounded-xl py-1.5 pl-1.5 pr-2.5 text-[0.75rem] font-black" onclick={onStrike}>
      <TowerBadge special={dark} size={22} />
      <span class="break-words text-left leading-tight">{TOWER_SPECIALS[dark]?.name ?? dark} auf {name}!</span>
    </button>
  {/if}
</div>

<style>
  .alert {
    background: rgba(8, 26, 20, 0.78);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow:
      inset 0 0 0 1px rgba(62, 224, 143, 0.55),
      0 0 22px -6px rgba(62, 224, 143, 0.6);
  }
  .strike {
    max-width: 11rem;
    color: white;
    background: linear-gradient(180deg, #7a5cff, #3a2894);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.25),
      0 0 14px -2px rgba(124, 88, 245, 0.8);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    -webkit-tap-highlight-color: transparent;
  }
  .strike:active {
    filter: brightness(1.15);
    transform: scale(0.97);
  }
</style>
