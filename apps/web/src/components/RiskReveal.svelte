<script lang="ts">
  import type { RiskRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import RiskSlots from './RiskSlots.svelte';
  import RiskTotals from './RiskTotals.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: RiskRoundView; readonly?: boolean } = $props();

  const latest = $derived(round.passes[round.passes.length - 1]);
  const earlier = $derived(round.passes.slice(0, -1).reverse());
  const canCorrect = $derived(!readonly && client.isHost && view.phase === 'reveal');
  /** In früheren Durchgängen getroffene Plätze lassen sich nicht noch einmal vergeben. */
  const blocked = $derived(new Set(round.passes.slice(0, -1).flatMap((p) => p.results.map((r) => r.rank).filter((r) => r !== null))));
  const ranks = $derived(Array.from({ length: round.size }, (_, i) => i + 1));
  const nameOf = $derived(new Map((round.solution ?? round.hitSlots).map((s) => [s.rank, s.name])));
  const listDone = $derived(view.phase !== 'reveal');

  function rankLabel(rank: number): string {
    const name = nameOf.get(rank);
    return name ? `${rank}. ${name}` : `Platz ${rank}`;
  }

  function correct(playerId: string, value: string) {
    client.send({ type: 'risk_correct', playerId, rank: value === '' ? null : Number(value) });
  }
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">{listDone ? 'Kategorie beendet' : `Auflösung · Durchgang ${round.passNo}`}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.category.title}</h2>
      {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>

    {#if latest && !listDone}
      <div class="card space-y-2">
        <h3 class="font-bold">Durchgang {latest.passNo}</h3>
        <ul class="divide-y divide-slate-800">
          {#each latest.results as res (res.playerId)}
            <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 {readonly ? 'text-xl' : ''} {res.playerId === client.myId ? 'text-indigo-100' : ''}">
              <span class="w-16 shrink-0 truncate font-semibold sm:w-28">{playerName(view, res.playerId)}</span>
              <span class="min-w-0 flex-1 truncate {res.text === null ? 'italic text-slate-500' : ''}">{res.text ?? 'kein Tipp'}</span>
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
            </li>
          {/each}
        </ul>
        {#if canCorrect}
          <p class="text-xs text-slate-500">Tippfehler? Über die Auswahl kannst du jede Zuordnung korrigieren, die Punkte rechnen sich neu.</p>
        {/if}
      </div>
    {/if}

    <div class="card">
      <h3 class="mb-2 font-bold">{listDone ? 'Die ganze Liste' : 'Getroffene Plätze'}</h3>
      {#if listDone && round.solution}
        <RiskSlots {view} {round} slots={round.solution} large={readonly} />
      {:else if round.hitSlots.length > 0}
        <RiskSlots {view} {round} slots={round.hitSlots} large={readonly} />
      {:else}
        <p class="text-sm text-slate-500">Noch kein Platz getroffen.</p>
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
                <span class="w-16 truncate font-semibold sm:w-28">{playerName(view, res.playerId)}</span>
                <span class="min-w-0 flex-1 truncate text-slate-400">{res.text ?? 'kein Tipp'}{res.rank !== null ? ` · Platz ${res.rank}` : ''}</span>
                <span class="font-mono">{res.points}</span>
              </li>
            {/each}
          </ul>
        {/each}
      </details>
    {/if}
  </section>

  <aside class="space-y-4">
    <RiskTotals {view} {round} large={readonly} />
    {#if !readonly}
      {#if client.isHost && view.phase === 'reveal'}
        <div class="flex flex-col gap-2">
          <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'next_pass' })}>Noch ein Durchgang</button>
          <button class="btn-secondary w-full" onclick={() => client.send({ type: 'to_scoring' })}>Kategorie beenden, Punkte eintragen</button>
        </div>
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
      {/if}
    {/if}
  </aside>
</div>
