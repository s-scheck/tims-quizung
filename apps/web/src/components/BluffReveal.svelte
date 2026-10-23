<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { BluffEntryView, BluffRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { canReveal, ranksVisible, revealPlayer, revealSolution, revealStep } from '../lib/reveal.ts';
  import RevealControls from './RevealControls.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: BluffRoundView; readonly?: boolean } = $props();

  const show = $derived(round.reveal);
  const moderator = $derived(canReveal(view, show, readonly));
  const entries = $derived(round.entries ?? []);
  const truthEntry = $derived(entries.find((e) => e.isTruth));
  /** Die Wahrheit steht als eigene Karte oben, sobald sie bekannt ist. Vorher läuft sie unerkannt in der Liste mit. */
  const listed = $derived(entries.filter((e) => !e.isTruth));
  const showRanks = $derived(ranksVisible(show, moderator));
  const complete = $derived(!show || show.complete);

  /** Für Spieler nur aufgedeckte, für den Moderator alle, verdeckte hinten. */
  const ranking = $derived(
    round.turnOrder
      .map((id) => ({ id, points: round.points?.[id] ?? 0, open: revealStep(show, id) >= 1 }))
      .sort((a, b) => Number(b.open) - Number(a.open) || b.points - a.points || playerName(view, a.id).localeCompare(playerName(view, b.id), 'de')),
  );

  /** Antippen eines Textes deckt seinen Autor auf, die Wahrheit ihren Knopf. */
  function tapEntry(e: BluffEntryView) {
    if (!moderator || e.authorId === undefined) return;
    if (e.authorId === null) {
      if (!show?.solution) revealSolution();
    } else if (revealStep(show, e.authorId) < 1) {
      revealPlayer(e.authorId);
    }
  }

  function tapPlayer(id: string) {
    if (!moderator || revealStep(show, id) >= 1) return;
    revealPlayer(id);
  }
</script>

{#snippet entryBody(e: BluffEntryView, open: boolean)}
  {@const voters = e.votes ?? []}
  <div class="flex items-start justify-between gap-3">
    <p class="font-semibold leading-snug">{e.text}</p>
    {#if open}
      <span class="shrink-0 font-mono text-lg font-black {voters.length > 0 ? 'text-amber-300' : 'text-slate-600'}">+{e.points ?? 0}</span>
    {:else}
      <span class="shrink-0 font-mono text-lg font-black text-slate-600">?</span>
    {/if}
  </div>
  <p class="mt-1 text-xs text-slate-400">
    {#if open}
      von <span class="font-semibold text-slate-200">{playerName(view, e.authorId ?? null)}</span>
      {#if moderator && typeof e.authorId === 'string' && revealStep(show, e.authorId) < 1}
        <span class="text-amber-300"> · noch verdeckt, antippen zum Aufdecken</span>
      {/if}
    {:else}
      von <span class="font-semibold text-slate-500">?</span>
    {/if}
    {#if voters.length > 0}
      · hereingefallen: {voters.map((v) => playerName(view, v)).join(', ')}
    {:else}
      · niemand ist hereingefallen
    {/if}
  </p>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title} · {round.category.promptLabel}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.prompt}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>

    {#if round.truth && (!show || show.solution || moderator)}
      <div class="card border-emerald-500/50 bg-emerald-500/10 {moderator && show && !show.solution ? 'opacity-80' : ''}" in:fly={{ y: 8, duration: 250 }}>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-widest text-emerald-300">Echte {round.category.answerLabel}</p>
            <p class="mt-1 text-xl font-bold {readonly ? 'text-3xl' : ''}">{round.truth}</p>
          </div>
          {#if moderator && show && !show.solution}
            <button class="btn-primary shrink-0 px-3 py-1.5 text-xs" onclick={revealSolution}>Aufdecken</button>
          {/if}
        </div>
        <p class="mt-2 text-sm text-slate-300">
          {#if (truthEntry?.votes ?? []).length === 0}
            Niemand hat sie erkannt.
          {:else}
            Erkannt von {(truthEntry?.votes ?? []).map((v) => playerName(view, v)).join(', ')} (+2).
          {/if}
        </p>
      </div>
    {:else if show}
      <div class="card border-dashed border-slate-700 text-slate-500">
        <p class="text-xs font-semibold uppercase tracking-widest">Echte {round.category.answerLabel}</p>
        <p class="mt-1 text-lg font-bold">noch verdeckt</p>
      </div>
    {/if}

    <ol class="space-y-2">
      {#each listed as e, i (e.id)}
        {@const open = e.authorId !== undefined}
        {@const tappable = moderator && open && (e.authorId === null ? !show?.solution : revealStep(show, e.authorId ?? '') < 1)}
        <li in:fly={{ y: 8, delay: 100 + i * 60, duration: 250 }}>
          {#if tappable}
            <button
              type="button"
              class="block w-full rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left transition hover:border-indigo-400 {readonly ? 'text-xl' : ''}"
              onclick={() => tapEntry(e)}
            >
              {@render entryBody(e, open)}
            </button>
          {:else}
            <div class="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 {readonly ? 'text-xl' : ''}">
              {@render entryBody(e, open)}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  </section>

  <aside class="space-y-4">
    {#if moderator && show}
      <RevealControls
        {show}
        turnOrder={round.turnOrder}
        solutionLabel="Wahrheit aufdecken"
        hint="Tippe auf einen Text oder einen Namen, dann sehen alle den Autor und seine Punkte."
      />
    {/if}

    <div class="card">
      <h3 class="mb-3 font-bold">Rundenpunkte</h3>
      <ol class="divide-y divide-slate-800">
        {#each ranking as row, i (row.id)}
          {@const tappable = moderator && !row.open}
          <li class="flex items-center gap-3 py-2 {readonly ? 'text-xl' : ''} {row.id === client.myId ? 'text-indigo-200' : ''} {!row.open && !moderator ? 'text-slate-500' : ''}">
            <span class="w-6 text-right font-mono text-slate-500">{row.open && showRanks ? `${i + 1}.` : row.open ? '–' : '?'}</span>
            <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, row.id)}</span>
            {#if row.open || moderator}
              <span class="font-mono text-lg font-black {moderator && !row.open ? 'text-slate-400' : ''}">{row.points}</span>
            {:else}
              <span class="text-sm italic">verdeckt</span>
            {/if}
            {#if tappable}
              <button class="btn-primary px-3 py-1.5 text-xs" onclick={() => tapPlayer(row.id)}>Aufdecken</button>
            {:else if moderator}
              <span class="w-8 text-center text-emerald-300" aria-label="aufgedeckt">✓</span>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="mt-2 text-xs text-slate-500">1 Punkt je Stimme auf den eigenen Text, 2 für die Wahrheit. Die Endpunkte trägt der Host ein.</p>
    </div>

    {#if !readonly}
      {#if client.isHost && view.phase === 'reveal'}
        <button class="btn-primary w-full text-lg" disabled={!complete} onclick={() => client.send({ type: 'to_scoring' })}>Punkte eintragen</button>
        {#if !complete}<p class="text-center text-xs text-slate-500">Erst alle Texte und die Wahrheit aufdecken.</p>{/if}
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
      {/if}
    {/if}
  </aside>
</div>
