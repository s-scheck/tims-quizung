<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { BluffRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  let { view, round, readonly = false }: { view: RoomView; round: BluffRoundView; readonly?: boolean } = $props();

  const entries = $derived(round.entries ?? []);
  const truthEntry = $derived(entries.find((e) => e.isTruth));
  const ranking = $derived(
    round.turnOrder
      .map((id) => ({ id, points: round.points?.[id] ?? 0 }))
      .sort((a, b) => b.points - a.points || playerName(view, a.id).localeCompare(playerName(view, b.id), 'de')),
  );
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title} · {round.category.promptLabel}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.prompt}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>

    {#if round.truth}
      <div class="card border-emerald-500/50 bg-emerald-500/10" in:fly={{ y: 8, duration: 250 }}>
        <p class="text-xs font-semibold uppercase tracking-widest text-emerald-300">Echte {round.category.answerLabel}</p>
        <p class="mt-1 text-xl font-bold {readonly ? 'text-3xl' : ''}">{round.truth}</p>
        <p class="mt-2 text-sm text-slate-300">
          {#if (truthEntry?.votes ?? []).length === 0}
            Niemand hat sie erkannt.
          {:else}
            Erkannt von {(truthEntry?.votes ?? []).map((v) => playerName(view, v)).join(', ')} (+2).
          {/if}
        </p>
      </div>
    {/if}

    <ol class="space-y-2">
      {#each entries.filter((e) => !e.isTruth) as e, i (e.id)}
        {@const voters = e.votes ?? []}
        <li class="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 {readonly ? 'text-xl' : ''}" in:fly={{ y: 8, delay: 100 + i * 60, duration: 250 }}>
          <div class="flex items-start justify-between gap-3">
            <p class="font-semibold leading-snug">{e.text}</p>
            <span class="shrink-0 font-mono text-lg font-black {voters.length > 0 ? 'text-amber-300' : 'text-slate-600'}">+{e.points ?? 0}</span>
          </div>
          <p class="mt-1 text-xs text-slate-400">
            von <span class="font-semibold text-slate-200">{playerName(view, e.authorId)}</span>
            {#if voters.length > 0}
              · hereingefallen: {voters.map((v) => playerName(view, v)).join(', ')}
            {:else}
              · niemand ist hereingefallen
            {/if}
          </p>
        </li>
      {/each}
    </ol>
  </section>

  <aside class="space-y-4">
    <div class="card">
      <h3 class="mb-3 font-bold">Rundenpunkte</h3>
      <ol class="divide-y divide-slate-800">
        {#each ranking as row, i (row.id)}
          <li class="flex items-center gap-3 py-2 {readonly ? 'text-xl' : ''} {row.id === client.myId ? 'text-indigo-200' : ''}">
            <span class="w-6 text-right font-mono text-slate-500">{i + 1}.</span>
            <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, row.id)}</span>
            <span class="font-mono text-lg font-black">{row.points}</span>
          </li>
        {/each}
      </ol>
      <p class="mt-2 text-xs text-slate-500">1 Punkt je Stimme auf den eigenen Text, 2 für die Wahrheit. Die Endpunkte trägt der Host ein.</p>
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
