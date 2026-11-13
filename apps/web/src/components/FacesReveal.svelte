<script lang="ts">
  import PlayerHead from './PlayerHead.svelte';
  import type { FacesRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import FaceImage from './FaceImage.svelte';
  import ScoringHandoff from './ScoringHandoff.svelte';
  import JokerTag from './JokerTag.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: FacesRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const seconds = (at: number) => ((at - round.startedAt) / 1000).toFixed(1);
  /** Automatischer Modus: Der Host korrigiert die Prüfung des Spiels, bevor er die Punkte einträgt. */
  const corrects = $derived(!readonly && client.isHost && !!round.auto && view.phase === 'reveal');
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
              <PlayerHead {view} id={s.playerId} />
              <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, s.playerId)} <JokerTag {view} {round} playerId={s.playerId} /></span>
              <span class="font-mono text-xs text-slate-400">{seconds(s.at)} s</span>
              <span class="font-mono font-black">{round.points?.[s.playerId] ?? 0}</span>
            </li>
          {/each}
        </ol>
      {/if}
      <p class="text-xs text-slate-500">3, 2 und 1 Spielpunkte für die ersten drei, als Vorschlag. Die Endpunkte trägt der Host ein.</p>
    </div>

    {#if corrects}
      <div class="card space-y-3">
        <div>
          <h3 class="font-bold">Tipps korrigieren</h3>
          <p class="text-xs text-slate-500">Das Spiel hat automatisch geprüft. Tippe einen Tipp an, um ihn umzuwerten. Gewertet wird der früheste richtige.</p>
        </div>
        {#each participants as p (p.id)}
          {@const attempts = round.attempts?.[p.id] ?? []}
          <div class="rounded-xl border border-slate-800 px-3 py-2">
            <p class="flex flex-wrap items-center gap-2 text-sm font-semibold">{p.name} <JokerTag {view} {round} playerId={p.id} /></p>
            {#if round.joker?.by === p.id}
              <p class="text-xs text-slate-500">Übernimmt die Wertung der kopierten Person.</p>
            {:else if attempts.length === 0}
              <p class="text-xs text-slate-500">kein Tipp</p>
            {:else}
              <ul class="mt-1 flex flex-wrap gap-1.5">
                {#each attempts as a, i (i)}
                  <li>
                    <button
                      class="rounded-full border px-2.5 py-0.5 text-sm transition {a.status === 'correct' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}"
                      title={a.status === 'correct' ? 'als falsch werten' : 'als richtig werten'}
                      onclick={() => client.send({ type: 'face_judge', playerId: p.id, index: i, correct: a.status !== 'correct' })}
                    >
                      <span class={a.status === 'correct' ? '' : 'line-through'}>{a.text}</span>
                      <span class="ml-1 text-xs opacity-70">{seconds(a.at)} s{a.status !== 'correct' && a.suggested ? ', ähnlich' : ''}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <div class="card">
      <h3 class="mb-2 font-bold">Alle Tipps</h3>
      <ul class="space-y-2 text-sm">
        {#each participants as p (p.id)}
          {@const attempts = round.attempts?.[p.id] ?? []}
          <li>
            <span class="inline-flex items-center gap-1.5 font-semibold"><PlayerHead {view} id={p.id} />{p.name}</span>
            <JokerTag {view} {round} playerId={p.id} />
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
      <ScoringHandoff {view} />
    {/if}
  </aside>
</div>
