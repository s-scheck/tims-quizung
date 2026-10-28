<script lang="ts">
  import type { FacesRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import FaceImage from './FaceImage.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: FacesRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const seconds = (at: number) => ((at - round.startedAt) / 1000).toFixed(1);
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-3xl font-black sm:text-4xl {readonly ? 'text-5xl' : ''}">{round.name ?? '?'}</h2>
      {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <FaceImage image={round.image} fx={{ effect: 'blur', level: 0, cols: 6, revealed: [] }} large={readonly} />
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Plätze</h3>
      {#if round.solved.length === 0}
        <p class="text-sm text-slate-500">Niemand hat es erkannt.</p>
      {:else}
        <ol class="space-y-1">
          {#each round.solved as s (s.playerId)}
            <li class="flex items-center gap-2 {readonly ? 'text-xl' : ''} {s.playerId === client.myId ? 'text-indigo-200' : ''}">
              <span class="w-6 text-right font-mono text-slate-500">{s.rank}.</span>
              <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, s.playerId)}</span>
              <span class="font-mono text-xs text-slate-400">{seconds(s.at)} s</span>
              <span class="font-mono font-black">{round.points?.[s.playerId] ?? 0}</span>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="text-xs text-slate-500">3, 2 und 1 Spielpunkte für die ersten drei, als Vorschlag. Die Endpunkte trägt der Host ein.</p>
    </div>

    <div class="card">
      <h3 class="mb-2 font-bold">Alle Tipps</h3>
      <ul class="space-y-2 text-sm">
        {#each participants as p (p.id)}
          {@const attempts = round.attempts?.[p.id] ?? []}
          <li>
            <span class="font-semibold">{p.name}</span>
            {#if attempts.length === 0}
              <span class="text-slate-500"> · kein Tipp</span>
            {:else}
              <span class="text-slate-400"> · {attempts.map((a) => (a.status === 'correct' ? `✓ ${a.text}` : a.status === 'wrong' ? `✗ ${a.text}` : `? ${a.text}`)).join(', ')}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>

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
