<script lang="ts">
  import { FX_FOG, STONE_FALLING, type RoomView, type TowerRoundView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerColor, playerName } from '../../lib/format.ts';
  import Burst from '../Burst.svelte';
  import PlayerHead from '../PlayerHead.svelte';
  import ScoringHandoff from '../ScoringHandoff.svelte';
  import TowerCanvas from './TowerCanvas.svelte';
  import { formatMeters, type TowerScene } from './towerDraw.ts';
  import { towerFeed } from './towerFeed.svelte.ts';

  /** Auswertung: Pokal für den Sieger, die Türme im Endstand und die Rangliste mit Höhen. */
  let { view, round, readonly = false }: { view: RoomView; round: TowerRoundView; readonly?: boolean } = $props();

  const ranking = $derived(round.ranking ?? []);
  const winner = $derived(round.winners[0] ?? null);
  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));
  const shown = $derived(ranking.slice(0, readonly ? 6 : 4));

  function sceneOf(id: string): () => TowerScene {
    const color = colorOf(id);
    return () => {
      const f = towerFeed.frame(id, round.startedAt);
      return {
        stones: f ? towerFeed.stones(id, performance.now()).filter((s) => !(s.flags & STONE_FALLING)) : [],
        height: f?.h ?? 0,
        goal: round.goalHeight,
        marks: round.marks,
        reached: round.players[id]?.marks ?? [],
        color,
        fx: (f?.fx ?? 0) & ~FX_FOG,
        hold: 0,
        fog: false,
        won: round.winners.includes(id),
      };
    };
  }
</script>

<div class="{readonly ? 'grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start gap-6' : 'space-y-4'}">
  <div class="grid gap-2 {readonly ? 'fit-media' : ''}" style="grid-template-columns: repeat({Math.max(1, shown.length)}, minmax(0, 1fr))">
    {#each shown as r (r.playerId)}
      <div class="overflow-hidden rounded-2xl border {r.playerId === winner ? 'border-amber-400' : 'border-slate-800'} bg-slate-900">
        <TowerCanvas class="w-full" style={readonly ? 'height: calc(68dvh * var(--fit-media, 1))' : 'height: 30dvh'} scene={sceneOf(r.playerId)} worldWidth={12} headroom={3} minVisible={round.goalHeight + 3} labels={false} />
        <p class="flex items-center justify-center gap-1 px-1 py-1 text-xs font-bold"><PlayerHead {view} id={r.playerId} size={16} /><span class="truncate">{playerName(view, r.playerId)}</span></p>
      </div>
    {/each}
  </div>

  <section class="space-y-3">
    <header class="flex items-center gap-4">
      <div class="relative shrink-0">
        <svg viewBox="0 0 64 64" class={readonly ? 'h-20 w-20' : 'h-14 w-14'} aria-hidden="true">
          <defs>
            <linearGradient id="tower-cup" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#fff1b8" />
              <stop offset="0.45" stop-color="#ffc83d" />
              <stop offset="1" stop-color="#c98a00" />
            </linearGradient>
          </defs>
          <path d="M18 8h28v10c0 9-6 16-14 16S18 27 18 18z" fill="url(#tower-cup)" stroke="#a87200" stroke-width="1.5" />
          <path d="M18 12H9c0 8 4 12 10 13M46 12h9c0 8-4 12-10 13" fill="none" stroke="#d9a21c" stroke-width="3" stroke-linecap="round" />
          <path d="M28 34h8v8h-8z" fill="#e0a51a" />
          <path d="M20 50c0-5 5-8 12-8s12 3 12 8z" fill="url(#tower-cup)" stroke="#a87200" stroke-width="1.5" />
          <path d="M23 12c0 7 2 11 5 14" stroke="#fff" stroke-opacity="0.75" stroke-width="2.5" fill="none" stroke-linecap="round" />
        </svg>
        {#if winner}<Burst scale={1.6} />{/if}
      </div>
      <div class="min-w-0">
        <p class="text-sm text-slate-400">Hochstapler · Ziel {round.goalHeight} m</p>
        {#if winner}
          <h2 class="flex items-center gap-2 break-words font-black {readonly ? 'text-4xl' : 'text-2xl'}"><PlayerHead {view} id={winner} size={readonly ? 40 : 28} />{playerName(view, winner)} gewinnt!</h2>
        {:else}
          <h2 class="font-black {readonly ? 'text-4xl' : 'text-2xl'}">Niemand hat die Linie gehalten</h2>
          <p class="text-sm text-slate-400">Gewertet wird nach Turmhöhe.</p>
        {/if}
      </div>
    </header>

    <ol class="space-y-1.5">
      {#each ranking as r (r.playerId)}
        <li class="flex items-center gap-3 rounded-2xl border px-3 py-2 {readonly ? 'text-2xl' : ''} {r.playerId === winner ? 'border-amber-400 bg-amber-400/10' : 'border-slate-800'} {r.playerId === client.myId ? 'text-indigo-200' : ''}">
          <span class="w-8 text-center font-mono font-black text-slate-400">{r.rank}.</span>
          <PlayerHead {view} id={r.playerId} size={readonly ? 32 : 24} />
          <span class="min-w-0 flex-1 truncate font-bold">{playerName(view, r.playerId)}</span>
          {#if r.finishedAt !== null}<span class="badge bg-emerald-500/20 text-emerald-300">im Ziel</span>{/if}
          <span class="h-3 w-3 shrink-0 rounded-full" style="background:{colorOf(r.playerId)}"></span>
          <span class="w-20 text-right font-mono font-black">{formatMeters(r.height)} m</span>
        </li>
      {/each}
    </ol>

    {#if !readonly}
      <ScoringHandoff {view} />
    {/if}
  </section>
</div>
