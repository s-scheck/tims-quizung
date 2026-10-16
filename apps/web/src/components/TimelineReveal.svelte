<script lang="ts">
  import type { RoomView, TimelineRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatYear, formatYearDistance, formatYearSpan, playerColor, playerName } from '../lib/format.ts';
  import Timeline, { type TimelineMarker } from './Timeline.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: TimelineRoundView; readonly?: boolean } = $props();

  const ranking = $derived(round.ranking ?? []);
  const yearOf = $derived(new Map((round.guesses ?? []).map((g) => [g.playerId, g.year])));
  const markers = $derived<TimelineMarker[]>(
    (round.guesses ?? []).map((g) => {
      const idx = view.players.findIndex((pl) => pl.id === g.playerId);
      const name = playerName(view, g.playerId);
      return { id: g.playerId, year: g.year, label: name.slice(0, 2).toUpperCase(), color: playerColor(idx) };
    }),
  );
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.eventName}</h2>
      {#if round.target}
        <p class="text-lg font-bold text-emerald-300 {readonly ? 'text-2xl' : ''}">{formatYearSpan(round.target)}</p>
        {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
      {/if}
    </header>
    <Timeline target={round.target ?? null} {markers} fitAll large={readonly} />
  </section>

  <aside class="space-y-4">
    <ol class="card divide-y divide-slate-800 p-0">
      {#each ranking as row, i (row.playerId)}
        {@const idx = view.players.findIndex((pl) => pl.id === row.playerId)}
        {@const year = yearOf.get(row.playerId)}
        <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-xl' : ''} {row.playerId === client.myId ? 'bg-indigo-500/10' : ''}">
          <span class="w-6 text-right font-mono text-slate-500">{row.distanceYears === null ? '–' : `${i + 1}.`}</span>
          <span class="h-3 w-3 shrink-0 rounded-full" style="background:{playerColor(idx)}"></span>
          <span class="min-w-0 flex-1 break-words">
            <span class="font-semibold">{playerName(view, row.playerId)}</span>
            {#if year !== undefined}<span class="ml-1 text-sm text-slate-400">{formatYear(year)}</span>{/if}
          </span>
          <span class="font-mono {row.distanceYears === null ? 'text-sm text-slate-500' : row.distanceYears === 0 ? 'text-lg font-bold text-emerald-300' : 'text-lg font-bold'}">
            {row.distanceYears === null ? 'kein Tipp' : formatYearDistance(row.distanceYears)}
          </span>
        </li>
      {/each}
    </ol>

    {#if !readonly}
      {#if client.isHost && view.phase === 'reveal'}
        <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'to_scoring' })}>Punkte eintragen</button>
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
      {/if}
    {/if}
  </aside>
</div>
