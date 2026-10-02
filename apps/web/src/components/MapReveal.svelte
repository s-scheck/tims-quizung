<script lang="ts">
  import type { MapRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatKm, playerColor, playerName } from '../lib/format.ts';
  import WorldMap, { type MapMarker } from './WorldMap.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: MapRoundView; readonly?: boolean } = $props();

  const ranking = $derived(round.ranking ?? []);
  const markers = $derived<MapMarker[]>(
    (round.pins ?? []).map((p) => {
      const idx = view.players.findIndex((pl) => pl.id === p.playerId);
      const name = playerName(view, p.playerId);
      return { id: p.playerId, lat: p.lat, lng: p.lng, label: name.slice(0, 2).toUpperCase(), color: playerColor(idx) };
    }),
  );
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.targetName}</h2>
      {#if round.target}
        <p class="text-xs text-slate-500">{round.target.lat.toFixed(3)}°, {round.target.lng.toFixed(3)}°{round.category.source ? ` · Quelle: ${round.category.source}` : ''}</p>
      {/if}
    </header>
    <WorldMap
      class="h-[52dvh] min-h-[320px] overflow-hidden rounded-2xl border border-slate-800 {readonly ? 'h-[65dvh]' : ''}"
      borders={round.borders}
      target={round.target ?? null}
      {markers}
      showLines
      fitAll
    />
  </section>

  <aside class="space-y-4">
    <ol class="card divide-y divide-slate-800 p-0">
      {#each ranking as row, i (row.playerId)}
        {@const idx = view.players.findIndex((pl) => pl.id === row.playerId)}
        <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-xl' : ''} {row.playerId === client.myId ? 'bg-indigo-500/10' : ''}">
          <span class="w-6 text-right font-mono text-slate-500">{row.distanceKm === null ? '–' : `${i + 1}.`}</span>
          <span class="h-3 w-3 shrink-0 rounded-full" style="background:{playerColor(idx)}"></span>
          <span class="min-w-0 flex-1 truncate font-semibold">{playerName(view, row.playerId)}</span>
          <span class="font-mono {row.distanceKm === null ? 'text-sm text-slate-500' : 'text-lg font-bold'}">{row.distanceKm === null ? 'kein Pin' : formatKm(row.distanceKm)}</span>
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
