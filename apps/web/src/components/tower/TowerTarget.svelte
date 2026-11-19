<script lang="ts">
  import { untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type RoomView, type TowerSpecial } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import { GOLD, meters, ms, toneOf } from './towerStyle.ts';

  /**
   * Zielwahl für dunkle Magie: Köpfe der Mitspieler mit Höhe. Vorausgewählt ist, wer gerade über der Linie hält,
   * sonst der Führende. Antippen wählt (zweimal tippen trifft sofort), „Einsetzen“ schickt ab. Das Spiel läuft weiter.
   */
  let {
    view,
    special,
    targets,
    goal,
    onPick,
    onCancel,
  }: {
    view: RoomView;
    special: TowerSpecial;
    /** Der Höchste zuerst. */
    targets: { id: string; height: number; color: string; holding?: boolean; shielded?: boolean }[];
    goal: number;
    onPick: (id: string) => void;
    onCancel: () => void;
  } = $props();

  const tone = $derived(toneOf(special));
  let chosen = $state<string | null>(untrack(() => (targets.find((t) => t.holding) ?? targets[0])?.id ?? null));
  const leaderId = $derived(targets[0]?.id ?? null);
  const cols = $derived(targets.length <= 1 ? 1 : targets.length === 2 || targets.length === 4 ? 2 : 3);
</script>

<div class="absolute inset-0 z-40 flex flex-col justify-end" onpointerdown={(e) => e.stopPropagation()} role="presentation">
  <button class="absolute inset-0 bg-[rgba(6,10,22,0.55)] backdrop-blur-[2px]" aria-label="Abbrechen" onclick={onCancel} transition:fade={{ duration: ms(180) }}></button>
  <div
    class="sheet relative m-2 rounded-[1.6rem] p-3.5 text-white"
    style="--glow:{tone.glow}"
    transition:fly={{ y: 60, duration: ms(320), easing: cubicOut }}
    role="dialog"
    aria-label="{TOWER_SPECIALS[special].name}: Ziel wählen"
  >
    <div class="flex items-center gap-3">
      <TowerBadge {special} size={44} glow />
      <div class="min-w-0 flex-1">
        <p class="text-[0.62rem] font-extrabold uppercase tracking-[0.22em]" style="color:{tone.text}">{tone.label} · Ziel wählen</p>
        <p class="text-lg font-black leading-tight">{TOWER_SPECIALS[special].name} gegen wen?</p>
      </div>
      <button class="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80" aria-label="Schließen" onclick={onCancel}>
        <svg viewBox="0 0 24 24" class="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
      </button>
    </div>

    <div class="mt-3 grid gap-2" style="grid-template-columns: repeat({cols}, minmax(0, 1fr))">
      {#each targets as t (t.id)}
        {@const on = chosen === t.id}
        <button
          class="target relative flex flex-col items-center gap-1 rounded-2xl px-2 pb-2.5 pt-3 transition {on ? 'target-on' : ''}"
          style="--c:{t.color}"
          onclick={() => (chosen === t.id ? onPick(t.id) : (chosen = t.id))}
        >
          {#if t.holding}
            <span class="absolute left-2 top-2 flex items-center gap-1 text-[0.58rem] font-extrabold uppercase tracking-wider text-[#3ee08f]">
              <span class="h-1.5 w-1.5 rounded-full bg-[#3ee08f]"></span>hält!
            </span>
          {:else if t.id === leaderId}
            <span class="absolute left-2 top-2 flex items-center gap-1 text-[0.58rem] font-extrabold uppercase tracking-wider" style="color:{GOLD}">
              <svg viewBox="0 0 24 24" class="h-3 w-3" aria-hidden="true"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" fill="currentColor" /></svg>führt
            </span>
          {/if}
          {#if t.shielded}
            <span class="absolute right-2 top-2 text-[#ffe29a]" title="Schutzschild: blockt deinen Zauber">
              <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z" fill="currentColor" /></svg>
            </span>
          {/if}
          <span class="rounded-full" style="box-shadow: 0 0 0 2.5px {on ? '#ffffff' : t.color}"><PlayerHead {view} id={t.id} size={44} /></span>
          <span class="max-w-full break-words text-center text-sm font-black leading-tight">{playerName(view, t.id)}</span>
          <span class="font-mono text-xs font-bold text-white/70">{meters(t.height)} m{t.shielded ? ' · Schild' : ''}</span>
          <span class="mt-0.5 h-1 w-4/5 overflow-hidden rounded-full bg-white/15">
            <span class="block h-full rounded-full" style="width:{Math.min(100, (t.height / goal) * 100)}%; background:{t.color}"></span>
          </span>
        </button>
      {/each}
    </div>

    <button
      class="go mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-black uppercase tracking-wide text-white"
      style="--from:{tone.from}; --to:{tone.to}"
      disabled={!chosen} onclick={() => chosen && onPick(chosen)}>
      Einsetzen{#if chosen}<span class="normal-case tracking-normal opacity-90">gegen {playerName(view, chosen)}</span>{/if}
    </button>
  </div>
</div>

<style>
  .sheet {
    background: linear-gradient(180deg, rgba(20, 27, 48, 0.94), rgba(12, 17, 32, 0.96));
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.1),
      0 -10px 40px -14px var(--glow),
      0 20px 40px -20px rgba(0, 0, 0, 0.8);
  }
  .target {
    background: rgba(255, 255, 255, 0.05);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    -webkit-tap-highlight-color: transparent;
  }
  .target-on {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    box-shadow:
      inset 0 0 0 2px var(--c),
      0 8px 24px -10px var(--c);
  }
  .target:active {
    transform: scale(0.97);
  }
  .go {
    background: linear-gradient(180deg, var(--from), var(--to));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      0 4px 0 color-mix(in srgb, var(--to) 65%, black),
      0 12px 24px -12px var(--to);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    -webkit-tap-highlight-color: transparent;
  }
  .go:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.3),
      0 1px 0 color-mix(in srgb, var(--to) 65%, black);
  }
  .go:disabled {
    opacity: 0.5;
  }
</style>
