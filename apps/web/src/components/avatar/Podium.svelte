<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { podiumHeights, type RoomView } from '@quiz/shared';
  import { figureOf, type Pose } from '../../lib/avatar.ts';
  import { isModerator, playerColor, scoredPlayers } from '../../lib/format.ts';
  import { client } from '../../lib/client.svelte.ts';
  import Burst from '../Burst.svelte';
  import Figure from './Figure.svelte';

  /**
   * Figuren auf Plattformen, Höhe nach Gesamtpunkten. `round`: nach dem Punkteeintragen fahren die Plattformen
   * von der alten zur neuen Höhe, dann jubeln oder trauern die Figuren. `finale`: der Host deckt Rangstufe für
   * Rangstufe auf, vom letzten Platz an. Ein moderierender Host steht ohne Plattform daneben.
   */
  let { view, mode = 'round', height = 320, large = false }: { view: RoomView; mode?: 'round' | 'finale'; height?: number; large?: boolean } = $props();

  const MOVE_DELAY_MS = 350;
  const MOVE_MS = 1600;
  const REACT_MS = 5500;

  let width = $state(0);
  let moved = $state(false);
  let settled = $state(false);
  let calm = $state(false);
  const timers: ReturnType<typeof setTimeout>[] = [];

  onMount(() => {
    timers.push(setTimeout(() => (moved = true), MOVE_DELAY_MS));
    timers.push(setTimeout(() => (settled = true), MOVE_DELAY_MS + MOVE_MS));
    timers.push(setTimeout(() => (calm = true), MOVE_DELAY_MS + MOVE_MS + REACT_MS));
  });
  onDestroy(() => timers.forEach(clearTimeout));

  const players = $derived(scoredPlayers(view));
  const moderators = $derived(view.players.filter((p) => isModerator(view, p.id)));
  const lastRound = $derived(mode === 'round' ? view.rounds.at(-1) : undefined);
  const delta = (id: string) => lastRound?.scores[id] ?? 0;
  const scores = $derived(Object.fromEntries(players.map((p) => [p.id, view.scores[p.id] ?? 0])));
  const before = $derived(Object.fromEntries(players.map((p) => [p.id, (view.scores[p.id] ?? 0) - delta(p.id)])));
  const to = $derived(podiumHeights(scores));
  const from = $derived(podiumHeights(before));
  const best = $derived(Math.max(0, ...Object.values(scores)));

  // Endstand: Rangstufen aufsteigend nach Punkten, Stufe 0 ist der letzte Platz.
  const levels = $derived([...new Set(Object.values(scores))].sort((a, b) => a - b));
  const shown = $derived(view.finale?.shown ?? levels.length);
  const complete = $derived(mode !== 'finale' || shown >= levels.length);
  const level = (id: string) => levels.indexOf(scores[id] ?? 0);
  const revealed = (id: string) => mode !== 'finale' || level(id) < shown;

  const slots = $derived(players.length + moderators.length * 0.7);
  const slotW = $derived(width > 0 ? width / Math.max(1, slots) : 120);
  const labelH = $derived(large ? 70 : 44);
  const figSize = $derived(Math.max(56, Math.min(slotW * 1.9, height * 0.42)));
  const platformMax = $derived(Math.max(20, height - figSize - labelH - 8));
  const GROUND = 10;

  function frac(id: string): number {
    if (mode === 'finale') return revealed(id) ? (to[id] ?? 0) : 0;
    return (moved ? to[id] : from[id]) ?? 0;
  }

  function crowned(id: string): boolean {
    return best > 0 && scores[id] === best && (mode === 'round' ? settled : complete);
  }

  function poseOf(id: string): Pose {
    if (mode === 'finale') {
      if (complete && crowned(id)) return 'cheer';
      return level(id) === shown - 1 ? 'wave' : 'idle';
    }
    if (!settled || calm) return 'idle';
    return delta(id) > 0 ? 'cheer' : 'sad';
  }
</script>

<div class="flex items-end justify-center gap-1" style="height:{height}px" bind:clientWidth={width}>
  {#each players as p, i (p.id)}
    {@const color = playerColor(view.players.findIndex((x) => x.id === p.id))}
    {@const show = revealed(p.id)}
    {@const d = delta(p.id)}
    <div class="flex min-w-0 flex-1 flex-col items-center justify-end" style="max-width:{Math.max(slotW, 60)}px">
      <div class="relative flex justify-center transition-opacity duration-500 {show ? 'opacity-100' : 'opacity-0'}">
        {#if crowned(p.id)}<Burst scale={large ? 3 : 2} ms={900} />{/if}
        <Figure parts={figureOf(view, p)} size={figSize} pose={poseOf(p.id)} crown={crowned(p.id)} seed={i} />
      </div>
      <div
        class="platform relative w-[88%] rounded-t-lg border-x-2 border-t-2 border-slate-100/70"
        style="height:{GROUND + frac(p.id) * platformMax}px; background: linear-gradient(180deg, {color}, color-mix(in srgb, {color} 60%, #1f1f1f)); transition: height {mode === 'finale' ? 1200 : MOVE_MS}ms cubic-bezier(0.3, 0.7, 0.3, 1)"
      >
        {#if !show}
          <span class="absolute inset-x-0 -top-8 text-center text-2xl font-black text-slate-500">?</span>
        {/if}
      </div>
      <div class="flex w-full flex-col items-center overflow-hidden pt-1 leading-tight" style="height:{labelH}px">
        <span class="w-full truncate text-center font-bold {large ? 'text-2xl' : 'text-sm'} {p.id === client.myId ? 'text-indigo-300' : ''}">{p.name}</span>
        {#if show}
          <span class="font-mono font-black {large ? 'text-3xl' : 'text-base'}">
            {scores[p.id]}
            {#if mode === 'round' && settled && d !== 0}
              <span class="{large ? 'text-xl' : 'text-xs'} {d > 0 ? 'text-emerald-300' : 'text-rose-300'}">{d > 0 ? '+' : ''}{d}</span>
            {/if}
          </span>
        {/if}
      </div>
    </div>
  {/each}
  {#each moderators as p (p.id)}
    <div class="flex min-w-0 flex-col items-center justify-end border-l border-dashed border-slate-800 pl-2" style="flex: 0.7 1 0; max-width:{Math.max(slotW * 0.7, 50)}px">
      <Figure parts={figureOf(view, p)} size={figSize * 0.85} pose="idle" seed={7} />
      <div style="height:{GROUND}px"></div>
      <div class="flex w-full flex-col items-center overflow-hidden pt-1 leading-tight" style="height:{labelH}px">
        <span class="w-full truncate text-center font-bold {large ? 'text-2xl' : 'text-sm'}">{p.name}</span>
        <span class="text-slate-500 {large ? 'text-lg' : 'text-xs'}">Moderator</span>
      </div>
    </div>
  {/each}
</div>
