<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { backOut } from 'svelte/easing';
  import { fade, scale } from 'svelte/transition';
  import type { RoomView, TowerRoundView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerColor, playerName } from '../../lib/format.ts';
  import Burst from '../Burst.svelte';
  import PlayerHead from '../PlayerHead.svelte';
  import ScoringHandoff from '../ScoringHandoff.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import TowerPodium from './TowerPodium.svelte';
  import { towerFeed } from './towerFeed.svelte.ts';
  import { GOLD, groupOf, meters, ms } from './towerStyle.ts';

  /**
   * Auswertung: Siegertreppchen mit den Endstand-Türmen, darunter die übrigen Plätze mit Höhe und Punkten,
   * dazu die Zauber der Runde. Am Handy erst kurz der eigene Platz groß, dann kompakt.
   */
  let { view, round, readonly = false }: { view: RoomView; round: TowerRoundView; readonly?: boolean } = $props();

  const ranking = $derived(round.ranking ?? []);
  const winner = $derived(round.winners[0] ?? null);
  const top = $derived(ranking.slice(0, 3));
  const rest = $derived(ranking.slice(3));
  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));

  // Eigener Platz als große Einblendung am Handy, Tippen schließt sie früher.
  const mine = $derived(readonly ? null : (ranking.find((r) => r.playerId === client.myId) ?? null));
  let intro = $state(untrack(() => !readonly));
  let timer: ReturnType<typeof setTimeout> | null = null;
  onMount(() => {
    if (intro) timer = setTimeout(() => (intro = false), 3400);
  });
  onDestroy(() => timer && clearTimeout(timer));

  /** Zauber der Runde, so wie dieses Gerät sie gesehen hat. */
  const facts = $derived.by(() => {
    const spells = towerFeed.spellsOf(round.startedAt).filter((e) => round.players[e.by] !== undefined || ranking.some((r) => r.playerId === e.by));
    const count = (pick: (e: (typeof spells)[number]) => string | null) => {
      const m = new Map<string, number>();
      for (const e of spells) {
        const id = pick(e);
        if (id) m.set(id, (m.get(id) ?? 0) + 1);
      }
      const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      return best ? { id: best[0], n: best[1] } : null;
    };
    const out: { label: string; id: string; n: number; special: 'gust' | 'shield' | 'beam' }[] = [];
    const dark = count((e) => (groupOf(e.special) === 'dark' ? e.by : null));
    if (dark) out.push({ label: 'Meiste dunkle Magie', ...dark, special: 'gust' });
    const light = count((e) => (groupOf(e.special) === 'light' ? e.by : null));
    if (light) out.push({ label: 'Meiste helle Magie', ...light, special: 'beam' });
    const hit = count((e) => (groupOf(e.special) === 'dark' && !e.blocked ? e.target : null));
    if (hit) out.push({ label: 'Am häufigsten getroffen', ...hit, special: 'gust' });
    const blocks = count((e) => (e.blocked ? e.target : null));
    if (blocks) out.push({ label: 'Schild-Paraden', ...blocks, special: 'shield' });
    return out;
  });
</script>

{#if intro && mine}
  <button
    class="intro fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center text-white"
    onclick={() => (intro = false)}
    transition:fade={{ duration: ms(300) }}
    aria-label="Weiter zur Auswertung"
  >
    <span class="text-xs font-extrabold uppercase tracking-[0.3em] text-white/60">Hochstapler · Endstand</span>
    <span class="relative" in:scale={{ start: 0.4, duration: ms(700), easing: backOut }}>
      <span class="rank-big block font-black leading-none" style={mine.rank === 1 ? `color:${GOLD}` : ''}>{mine.rank}.</span>
      {#if mine.rank === 1}<Burst scale={3} ms={1100} />{/if}
    </span>
    <span class="rounded-full" style="box-shadow: 0 0 0 3px {mine.rank === 1 ? GOLD : colorOf(mine.playerId)}"><PlayerHead {view} id={mine.playerId} size={64} /></span>
    <span class="text-3xl font-black">
      {#if mine.rank === 1 && mine.playerId === winner}Du gewinnst!{:else if mine.rank === 1}Höchster Turm!{:else}Platz {mine.rank} von {ranking.length}{/if}
    </span>
    <span class="font-mono text-lg font-bold text-white/70">{meters(mine.height)} m{mine.finishedAt !== null ? ' · im Ziel' : ''}</span>
    <span class="mt-6 text-xs font-bold text-white/40">Tippen für die Auswertung</span>
  </button>
{/if}

<div class="flex flex-col {readonly ? 'gap-4' : 'gap-4'}" style={readonly ? 'height: calc(100dvh - 5.75rem)' : undefined}>
  <header class="flex items-center gap-3 {readonly ? 'justify-center text-center' : ''}">
    <div class="min-w-0">
      <p class="text-xs font-extrabold uppercase tracking-[0.25em] text-slate-500">Hochstapler · Ziellinie {round.goalHeight} m</p>
      {#if winner}
        <h2 class="flex flex-wrap items-center gap-2 font-black {readonly ? 'justify-center text-4xl' : 'text-2xl'}">
          <svg viewBox="0 0 24 24" class={readonly ? 'h-9 w-9' : 'h-6 w-6'} aria-hidden="true"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" fill={GOLD} stroke="#a8740a" stroke-width="1.2" stroke-linejoin="round" /></svg>
          {playerName(view, winner)} gewinnt!
        </h2>
      {:else}
        <h2 class="font-black {readonly ? 'text-4xl' : 'text-2xl'}">Niemand hat die Linie gehalten</h2>
        <p class="text-sm text-slate-500">Gewertet wird nach Turmhöhe.</p>
      {/if}
    </div>
  </header>

  <div class="{readonly ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-6' : 'flex flex-col gap-4'}">
    <div class={readonly ? 'min-h-0' : ''} style={readonly ? undefined : `height: ${rest.length >= 3 ? 34 : rest.length > 0 ? 38 : 44}dvh`}>
      <TowerPodium {view} {round} {top} big={readonly} />
    </div>

    <div class="flex min-h-0 flex-col gap-3">
      {#if rest.length > 0}
        {@const dense = !readonly && rest.length > 3}
        <ol class={dense ? 'grid grid-cols-2 gap-1.5 text-sm' : 'space-y-1.5'}>
          {#each rest as r (r.playerId)}
            <li class="flex items-center rounded-2xl border border-slate-800 bg-slate-900 {readonly ? 'gap-3 px-3 py-2 text-xl' : dense ? 'gap-1.5 px-2 py-1.5' : 'gap-3 px-3 py-1.5'}">
              <span class="text-center font-black text-slate-500 {dense ? 'w-5' : 'w-7'}">{r.rank}.</span>
              <PlayerHead {view} id={r.playerId} size={readonly ? 32 : dense ? 20 : 24} />
              <span class="flex-1 truncate font-bold {r.playerId === client.myId && !readonly ? 'text-indigo-500' : ''}" style="min-width:0">{playerName(view, r.playerId)}</span>
              {#if !dense}<span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background:{colorOf(r.playerId)}"></span>{/if}
              <span class="text-right font-mono font-black tabular-nums {dense ? '' : 'w-16'}">{meters(r.height)} m</span>
              {#if round.points?.[r.playerId] !== undefined && !dense}<span class="w-9 text-right font-black text-slate-500">+{round.points[r.playerId]}</span>{/if}
            </li>
          {/each}
        </ol>
      {/if}

      {#if facts.length > 0}
        <section class="rounded-2xl border border-slate-800 bg-slate-900 p-3">
          <p class="mb-2 text-xs font-extrabold uppercase tracking-[0.22em] text-slate-500">Zauber der Runde</p>
          <ul class="space-y-2">
            {#each readonly || rest.length < 3 ? facts : facts.slice(0, 2) as f (f.label)}
              <li class="flex items-center gap-2.5 {readonly ? 'text-lg' : 'text-sm'}">
                <TowerBadge special={f.special} size={readonly ? 34 : 24} />
                {#if readonly}
                  <span class="flex flex-1 flex-col" style="min-width:0">
                    <span class="text-xs font-bold text-slate-500">{f.label}</span>
                    <span class="flex items-center gap-1.5 font-bold"><PlayerHead {view} id={f.id} size={22} />{playerName(view, f.id)}</span>
                  </span>
                {:else}
                  <span class="flex-1 text-slate-400" style="min-width:0">{f.label}</span>
                  <PlayerHead {view} id={f.id} size={20} />
                  <span class="font-bold">{playerName(view, f.id)}</span>
                {/if}
                <span class="font-mono font-black text-slate-500">×{f.n}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if !readonly}
        <ScoringHandoff {view} />
      {/if}
    </div>
  </div>
</div>

<style>
  .intro {
    background:
      radial-gradient(60% 45% at 50% 40%, rgba(246, 196, 83, 0.18), transparent 70%),
      linear-gradient(180deg, #0b1122, #05070f);
  }
  .rank-big {
    font-size: clamp(6rem, 34vw, 11rem);
    text-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
</style>
