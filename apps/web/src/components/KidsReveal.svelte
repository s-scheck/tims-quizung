<script lang="ts">
  import type { KidsRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import ScoringHandoff from './ScoringHandoff.svelte';

  /** Auflösung der Runde: alle gezeigten Promis mit Gewinnern, dazu die Rangliste der Spielpunkte. */
  let { view, round, readonly = false }: { view: RoomView; round: KidsRoundView; readonly?: boolean } = $props();

  const me = $derived(client.myId);
  const typing = $derived(round.mode === 'type');
  const participants = $derived(round.turnOrder.map((id) => ({ id, name: playerName(view, id) })));
  const ranking = $derived(
    participants
      .map((p) => ({ ...p, points: round.points[p.id] ?? 0, hits: round.hits[p.id] ?? 0, misses: round.misses[p.id] ?? 0 }))
      .sort((a, b) => b.points - a.points || b.hits - a.hits),
  );
  const seconds = (at: number, from: number | null) => ((at - (from ?? at)) / 1000).toFixed(1);
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title} · {typing ? 'Tippen' : 'Buzzern'}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.history.length} {round.history.length === 1 ? 'Promi' : 'Promis'}</h2>
      {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>

    {#if round.history.length === 0}
      <p class="card text-sm text-slate-500">Die Runde wurde beendet, bevor ein Promi gezeigt wurde.</p>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2 {readonly ? 'lg:grid-cols-3' : ''}">
        {#each round.history as item, i (item.id)}
          <div class="card space-y-2 p-3">
            <img src={item.image} alt="" draggable="false" class="aspect-[4/3] w-full rounded-xl object-cover" />
            <div class="flex items-baseline gap-2">
              <span class="font-mono text-xs text-slate-500">{i + 1}.</span>
              <span class="break-words text-lg font-black {readonly ? 'text-2xl' : ''}">{item.name}</span>
            </div>
            {#if item.winners.length === 0}
              <p class="text-sm text-slate-500">Niemand hat es erkannt.</p>
            {:else}
              <ol class="space-y-0.5 text-sm {readonly ? 'text-lg' : ''}">
                {#each item.winners as w (w.playerId)}
                  <li class="flex items-center gap-2 {w.playerId === me ? 'text-indigo-200' : ''}">
                    {#if typing}<span class="w-5 text-right font-mono text-slate-500">{w.rank}.</span>{:else}<span class="text-emerald-400">✓</span>{/if}
                    <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, w.playerId)}</span>
                    <span class="font-mono text-xs text-slate-400">{seconds(w.at, item.shownAt)} s</span>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Rangliste</h3>
      <ol class="divide-y divide-slate-800">
        {#each ranking as p, i (p.id)}
          <li class="flex items-center gap-3 py-1.5 {readonly ? 'text-xl' : ''} {p.id === me ? 'text-indigo-200' : ''}">
            <span class="w-6 text-right font-mono text-slate-500">{i + 1}.</span>
            <span class="min-w-0 flex-1 break-words font-semibold">{p.name}</span>
            <span class="shrink-0 text-xs text-slate-500">{p.hits} Treffer{#if !typing && p.misses > 0} · {p.misses} daneben{/if}</span>
            <span class="shrink-0 font-mono font-black">{p.points}</span>
          </li>
        {/each}
      </ol>
      <p class="text-xs text-slate-500">
        {typing ? '3, 2 und 1 Spielpunkte je Promi für die Schnellsten' : round.penalty === 'minus' ? '1 Spielpunkt je Treffer, 1 Abzug je Fehlbuzzer' : '1 Spielpunkt je Treffer'}, als Vorschlag. Die Endpunkte trägt der Host ein.
      </p>
    </div>

    {#if !readonly}
      <ScoringHandoff {view} />
    {/if}
  </aside>
</div>
