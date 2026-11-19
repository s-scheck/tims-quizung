<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type RoomView, type TowerSpecial } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import { GOLD, HOLD_GREEN, meters, ms, toneOf } from './towerStyle.ts';

  /**
   * Zielwahl für dunkle Magie als kleines Popover über der Zauber-Taste: eine Reihe Köpfe mit Höhe.
   * Ein Tipp auf einen Kopf setzt den Zauber sofort ein, ein Tipp daneben bricht ab. Das Spiel läuft weiter.
   */
  let {
    view,
    special,
    targets,
    bottom = 80,
    onPick,
    onCancel,
  }: {
    view: RoomView;
    special: TowerSpecial;
    /** Der Höchste zuerst. */
    targets: { id: string; height: number; color: string; holding?: boolean; shielded?: boolean }[];
    /** Abstand des Popovers vom unteren Rand der Spielfläche in CSS-Pixeln. */
    bottom?: number;
    onPick: (id: string) => void;
    onCancel: () => void;
  } = $props();

  const tone = $derived(toneOf(special));
  const leaderId = $derived(targets[0]?.id ?? null);
</script>

<div class="absolute inset-0 z-40" onpointerdown={(e) => e.stopPropagation()} role="presentation">
  <button class="absolute inset-0 bg-[rgba(6,10,22,0.18)]" aria-label="Abbrechen" onclick={onCancel} transition:fade={{ duration: ms(160) }}></button>
  <div
    class="pop absolute left-1/2 w-[min(22rem,calc(100%-1rem))] -translate-x-1/2 rounded-2xl p-2 text-white"
    style="bottom:{bottom}px; --glow:{tone.glow}"
    transition:fly={{ y: 24, duration: ms(240), easing: cubicOut }}
    role="dialog"
    aria-label="{TOWER_SPECIALS[special].name}: Ziel wählen"
  >
    <div class="flex items-center gap-2 px-1 pb-1.5">
      <TowerBadge {special} size={22} />
      <p class="min-w-0 flex-1 text-[0.78rem] font-extrabold leading-tight">{TOWER_SPECIALS[special].name} <span class="font-semibold text-white/60">auf wen?</span></p>
      <button class="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/80" aria-label="Schließen" onclick={onCancel}>
        <svg viewBox="0 0 24 24" class="h-3.5 w-3.5"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
      </button>
    </div>
    <div class="flex flex-wrap gap-1.5">
      {#each targets as t (t.id)}
        <button
          class="target flex min-w-[8.5rem] flex-1 items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2 text-left"
          style="--c:{t.color}"
          aria-label="{TOWER_SPECIALS[special].name} auf {playerName(view, t.id)}"
          onclick={() => onPick(t.id)}
        >
          <span class="shrink-0 rounded-full" style="box-shadow: 0 0 0 2px {t.color}"><PlayerHead {view} id={t.id} size={28} /></span>
          <span class="min-w-0 flex-1 leading-tight">
            <span class="block break-words text-[0.75rem] font-extrabold">{playerName(view, t.id)}</span>
            <span class="flex items-center gap-1.5 text-[0.62rem] font-bold">
              <span class="font-mono text-white/60">{meters(t.height)} m</span>
              {#if t.holding}<span class="uppercase tracking-wider" style="color:{HOLD_GREEN}">hält</span>
              {:else if t.id === leaderId}<span class="uppercase tracking-wider" style="color:{GOLD}">führt</span>{/if}
              {#if t.shielded}
                <span class="text-[#ffe29a]" title="Schutzschild: blockt deinen Zauber">
                  <svg viewBox="0 0 24 24" class="h-3 w-3" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z" fill="currentColor" /></svg>
                </span>
              {/if}
            </span>
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .pop {
    background: linear-gradient(180deg, rgba(24, 22, 56, 0.94), rgba(12, 12, 32, 0.95));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow:
      inset 0 0 0 1px rgba(185, 162, 255, 0.35),
      0 10px 30px -10px var(--glow),
      0 14px 30px -18px rgba(0, 0, 0, 0.8);
  }
  .target {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    -webkit-tap-highlight-color: transparent;
    transition: transform 80ms ease;
  }
  .target:active {
    transform: scale(0.95);
    background: color-mix(in srgb, var(--c) 25%, transparent);
  }
</style>
