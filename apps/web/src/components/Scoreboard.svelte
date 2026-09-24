<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { ranking } from '../lib/format.ts';

  let { view, readonly = false, compact = false }: { view: RoomView; readonly?: boolean; compact?: boolean } = $props();

  const rows = $derived(ranking(view));
  const lastRound = $derived(view.rounds.at(-1));
  const showHostButtons = $derived(!readonly && client.isHost && view.phase === 'scoreboard');
</script>

<section class="space-y-4">
  <header class="flex items-baseline justify-between">
    <h2 class="{compact ? 'text-lg' : 'text-2xl'} font-bold">Punktestand</h2>
    <span class="text-sm text-slate-400">{view.rounds.length} {view.rounds.length === 1 ? 'Runde' : 'Runden'} gespielt</span>
  </header>

  <ol class="card divide-y divide-slate-800 p-0">
    {#each rows as row (row.player.id)}
      {@const delta = lastRound?.scores[row.player.id]}
      <li class="flex items-center gap-3 px-4 py-3 {readonly && !compact ? 'text-2xl' : ''} {row.player.id === client.myId ? 'bg-indigo-500/10' : ''}">
        <span class="w-6 text-right font-mono text-slate-500">{row.rank}.</span>
        <span class="min-w-0 flex-1 truncate font-semibold">{row.player.name}</span>
        {#if delta !== undefined && view.phase === 'scoreboard'}
          <span class="font-mono text-sm {delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-500'}">{delta > 0 ? '+' : ''}{delta}</span>
        {/if}
        <span class="w-12 text-right font-mono text-xl font-black">{row.score}</span>
      </li>
    {/each}
  </ol>

  {#if lastRound && view.phase === 'scoreboard'}
    <p class="text-sm text-slate-400">Letzte Runde: {lastRound.categoryTitle}</p>
  {/if}

  {#if showHostButtons}
    <div class="flex flex-wrap gap-2">
      <button class="btn-primary flex-1 text-lg" onclick={() => client.send({ type: 'next_round' })}>Nächste Runde</button>
      <button class="btn-secondary" onclick={() => client.send({ type: 'end_game' })}>Spiel beenden</button>
    </div>
  {:else if !readonly && view.phase === 'scoreboard'}
    <p class="text-center text-sm text-slate-400">Der Host entscheidet, ob es weitergeht…</p>
  {/if}
</section>
