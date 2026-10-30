<script lang="ts">
  import type { RoomView, SongsRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import SongCover from './SongCover.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: SongsRoundView; readonly?: boolean } = $props();

  const ranking = $derived([...round.turnOrder].sort((a, b) => (round.totals[b] ?? 0) - (round.totals[a] ?? 0)));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · Songs erraten</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.category.title}</h2>
      <p class="text-sm text-slate-500">{round.history.length} {round.history.length === 1 ? 'Song' : 'Songs'} gespielt{round.category.source ? ` · ${round.category.source}` : ''}</p>
    </header>
    <ol class="space-y-2">
      {#each round.history as p (p.passNo)}
        <li class="card flex items-start gap-3 {readonly ? 'text-lg' : ''}">
          <SongCover deezer={p.song.deezer} size={readonly ? 72 : 56} />
          <div class="min-w-0 flex-1">
            <p class="break-words font-black">{p.song.title}</p>
            <p class="break-words text-sm font-bold text-slate-400">{p.song.artist}</p>
            <p class="mt-1 flex flex-wrap gap-1.5 text-xs">
              {#each p.results.filter((r) => r.points > 0) as r (r.playerId)}
                <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-300">{playerName(view, r.playerId)} +{r.points}</span>
              {:else}
                <span class="text-slate-500">Niemand hat etwas erkannt.</span>
              {/each}
            </p>
          </div>
        </li>
      {:else}
        <p class="text-slate-500">Es wurde kein Song aufgelöst.</p>
      {/each}
    </ol>
  </section>

  <aside class="space-y-4">
    <ol class="card divide-y divide-slate-800 p-0">
      {#each ranking as id, i (id)}
        <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-xl' : ''} {id === client.myId ? 'bg-indigo-500/10' : ''}">
          <span class="w-6 text-right font-mono text-slate-500">{i + 1}.</span>
          <span class="min-w-0 flex-1 truncate font-semibold">{playerName(view, id)}</span>
          <span class="font-mono text-lg font-black">{round.totals[id] ?? 0}</span>
        </li>
      {/each}
    </ol>
    <p class="text-xs text-slate-500">1 Punkt für den Titel, 1 für den Interpreten. Diese Punkte gelten nur in dieser Playlist.</p>

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
