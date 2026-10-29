<script lang="ts">
  import type { RiskRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { canReveal, revealPlayer, revealStep } from '../lib/reveal.ts';
  import RiskSlots from './RiskSlots.svelte';
  import RiskTotals from './RiskTotals.svelte';
  import RevealControls from './RevealControls.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: RiskRoundView; readonly?: boolean } = $props();

  const show = $derived(round.reveal);
  const moderator = $derived(canReveal(view, show, readonly));
  const latest = $derived(round.passes[round.passes.length - 1]);
  const earlier = $derived(round.passes.slice(0, -1).reverse());
  const canCorrect = $derived(!readonly && client.isHost && view.phase === 'reveal');
  /** In früheren Durchgängen getroffene Plätze lassen sich nicht noch einmal vergeben. */
  const blocked = $derived(new Set(round.passes.slice(0, -1).flatMap((p) => p.results.map((r) => r.rank).filter((r) => r !== null))));
  const ranks = $derived(Array.from({ length: round.size }, (_, i) => i + 1));
  const nameOf = $derived(new Map((round.solution ?? round.hitSlots).map((s) => [s.rank, s.name])));
  /** Die Kategorie ist zu: nach der Punkteeingabe oder wenn der Moderator die ganze Liste aufgedeckt hat. */
  const listDone = $derived(view.phase !== 'reveal' || !!show?.solution);
  const complete = $derived(!show || show.complete);

  function rankLabel(rank: number): string {
    const name = nameOf.get(rank);
    return name ? `${rank}. ${name}` : `Platz ${rank}`;
  }

  function correct(playerId: string, value: string) {
    client.send({ type: 'risk_correct', playerId, rank: value === '' ? null : Number(value) });
  }

  /** Was die Spieler von diesem Ergebnis schon sehen: 0 nichts, 1 den Tipp, 2 Platz und Punkte. */
  function stepOf(playerId: string): number {
    return Math.min(2, revealStep(show, playerId));
  }
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">{listDone ? 'Kategorie beendet' : `Auflösung · Durchgang ${round.passNo}`}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.category.title}</h2>
      {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>

    {#if latest && (!listDone || show)}
      <div class="card space-y-2">
        <h3 class="font-bold">Durchgang {latest.passNo}</h3>
        <ul class="divide-y divide-slate-800">
          {#each latest.results as res (res.playerId)}
            {@const step = stepOf(res.playerId)}
            {@const textOpen = moderator || step >= 1}
            {@const rankOpen = moderator || step >= 2}
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 {readonly ? 'text-xl' : ''} {res.playerId === client.myId ? 'text-indigo-100' : ''}">
              <span class="w-16 shrink-0 break-words font-semibold sm:w-28">{playerName(view, res.playerId)}</span>
              {#if !textOpen}
                <span class="min-w-0 flex-1 italic text-slate-500">verdeckt</span>
                <span class="w-12 shrink-0 text-right font-mono text-lg text-slate-600">?</span>
              {:else}
                <span class="min-w-0 flex-1 break-words {res.text === null ? 'italic text-slate-500' : ''} {moderator && step < 1 ? 'text-slate-400' : ''}">{res.text ?? 'kein Tipp'}</span>
                {#if !rankOpen}
                  <span class="text-sm italic text-slate-500">Platz verdeckt</span>
                  <span class="w-12 shrink-0 text-right font-mono text-lg text-slate-600">?</span>
                {:else}
                  {#if canCorrect && res.text !== null}
                    <select
                      class="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                      value={res.rank === null ? '' : String(res.rank)}
                      onchange={(e) => correct(res.playerId, e.currentTarget.value)}
                      aria-label="Zuordnung für {playerName(view, res.playerId)} korrigieren"
                    >
                      <option value="">nicht in der Liste</option>
                      {#each ranks as rank (rank)}
                        <option value={String(rank)} disabled={blocked.has(rank)}>{rankLabel(rank)}</option>
                      {/each}
                    </select>
                  {:else}
                    <span class="text-sm {res.rank === null ? 'text-slate-500' : 'text-emerald-300'}">{res.rank === null ? 'nicht drin' : `Platz ${res.rank}`}</span>
                  {/if}
                  <span class="w-12 shrink-0 text-right font-mono text-lg font-bold {res.points > 0 ? 'text-emerald-300' : res.points < 0 ? 'text-rose-300' : 'text-slate-500'}">
                    {res.points > 0 ? `+${res.points}` : res.points < 0 ? `−${-res.points}` : 0}
                  </span>
                {/if}
              {/if}
              {#if moderator}
                {#if step >= 2}
                  <span class="w-24 text-center text-emerald-300" aria-label="aufgedeckt">✓</span>
                {:else}
                  <button class="btn-primary w-24 px-2 py-1.5 text-xs" onclick={() => revealPlayer(res.playerId)}>{step === 0 ? 'Tipp zeigen' : 'Platz zeigen'}</button>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
        {#if canCorrect}
          <p class="text-xs text-slate-500">
            Tippfehler? Über die Auswahl kannst du jede Zuordnung korrigieren, die Punkte rechnen sich neu.
            {#if show}Am besten, bevor du den Platz zeigst.{/if}
          </p>
        {/if}
      </div>
    {/if}

    <div class="card">
      <h3 class="mb-2 font-bold">{listDone ? 'Die ganze Liste' : `Plätze 1–${round.size}`}</h3>
      {#if listDone && round.solution}
        <RiskSlots {view} {round} slots={round.solution} large={readonly} />
      {:else}
        <RiskSlots {view} {round} slots={round.hitSlots} full large={readonly} />
      {/if}
    </div>

    {#if earlier.length > 0 && !listDone}
      <details class="card">
        <summary class="cursor-pointer font-bold">Frühere Durchgänge</summary>
        {#each earlier as pass (pass.passNo)}
          <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Durchgang {pass.passNo}</p>
          <ul class="text-sm">
            {#each pass.results as res (res.playerId)}
              <li class="flex gap-3 py-0.5">
                <span class="w-16 break-words font-semibold sm:w-28">{playerName(view, res.playerId)}</span>
                <span class="min-w-0 flex-1 break-words text-slate-400">{res.text ?? 'kein Tipp'}{res.rank !== null ? ` · Platz ${res.rank}` : ''}</span>
                <span class="font-mono">{res.points}</span>
              </li>
            {/each}
          </ul>
        {/each}
      </details>
    {/if}
  </section>

  <aside class="space-y-4">
    {#if moderator && show}
      <RevealControls
        {show}
        turnOrder={round.turnOrder}
        solutionLabel="Liste aufdecken"
        confirmSolution="Wirklich? Das beendet die Kategorie"
        allLabel="Alle Tipps und Plätze zeigen"
        hint="„Tipp zeigen“ zeigt den Tipp, „Platz zeigen“ Platz und Punkte. „Liste aufdecken“ zeigt die ganze Liste und beendet die Kategorie."
      />
    {/if}
    <RiskTotals {view} {round} large={readonly} />
    {#if !readonly}
      {#if client.isHost && view.phase === 'reveal'}
        <div class="flex flex-col gap-2">
          {#if !show?.solution}
            <button class="btn-primary w-full text-lg" disabled={!complete} onclick={() => client.send({ type: 'next_pass' })}>Noch ein Durchgang</button>
          {/if}
          <button class="{show?.solution ? 'btn-primary' : 'btn-secondary'} w-full {show?.solution ? 'text-lg' : ''}" disabled={!complete} onclick={() => client.send({ type: 'to_scoring' })}>
            Kategorie beenden, Punkte eintragen
          </button>
          {#if !complete}<p class="text-center text-xs text-slate-500">Erst alle Tipps und Plätze aufdecken.</p>{/if}
        </div>
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
      {/if}
    {/if}
  </aside>
</div>
