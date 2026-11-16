<script lang="ts">
  import PlayerHead from './PlayerHead.svelte';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { ranking } from '../lib/format.ts';
  import Podium from './avatar/Podium.svelte';

  let { view, readonly = false, compact = false }: { view: RoomView; readonly?: boolean; compact?: boolean } = $props();

  const rows = $derived(ranking(view));
  const lastRound = $derived(view.rounds.at(-1));
  const showHostButtons = $derived(!readonly && client.isHost && view.phase === 'scoreboard');
  /** Nach dem Punkteeintragen: Podium statt Liste. Am Fernseher nur das Podium, am Handy darunter die Zahlen. */
  const podium = $derived(view.phase === 'scoreboard' && !compact);
  const podiumHeight = $derived(typeof window === 'undefined' ? 320 : readonly ? Math.round(window.innerHeight * 0.62) : Math.min(340, Math.round(window.innerHeight * 0.45)));
</script>

<section class="space-y-4">
  <header class="flex items-baseline justify-between">
    <h2 class="{compact ? 'text-lg' : 'text-2xl'} font-bold">Punktestand</h2>
    <span class="text-sm text-slate-400">{view.rounds.length} {view.rounds.length === 1 ? 'Runde' : 'Runden'} gespielt</span>
  </header>

  {#if podium}
    {#key view.rounds.length}
      <Podium {view} height={podiumHeight} large={readonly} />
    {/key}
  {/if}

  {#if !(podium && readonly)}
  <ol class="card divide-y divide-slate-800 p-0 {podium ? 'text-sm' : ''}" data-fit={readonly ? 'cols' : undefined} data-fit-min="18">
    {#each rows as row (row.player.id)}
      {@const delta = lastRound?.scores[row.player.id]}
      <li class="flex items-center gap-3 px-4 {podium ? 'py-1.5' : 'py-3'} {readonly && !compact ? 'text-2xl' : ''} {row.player.id === client.myId ? 'bg-indigo-500/10' : ''}">
        <span class="w-6 text-right font-mono text-slate-500">{row.rank}.</span>
        <PlayerHead {view} id={row.player.id} />
        <span class="min-w-0 flex-1 break-words font-semibold">{row.player.name}</span>
        {#if delta !== undefined && view.phase === 'scoreboard'}
          <span class="font-mono text-sm {delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-500'}">{delta > 0 ? '+' : ''}{delta}</span>
        {/if}
        <span class="w-12 text-right font-mono text-xl font-black">{row.score}</span>
      </li>
    {/each}
  </ol>
  {/if}

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
