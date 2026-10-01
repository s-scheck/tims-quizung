<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { MatchRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import LivesList from './LivesList.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: MatchRoundView; readonly?: boolean } = $props();

  const cardsById = $derived(new Map(round.cards.map((c) => [c.id, c])));
  const matchedCount = $derived(round.targets.filter((t) => t.matchedCardId !== null).length);
  const decoyCount = $derived(round.targets.filter((t) => t.decoy).length);
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <ol class="card space-y-1">
      {#each round.targets as target, i (target.id)}
        {@const solution = target.solutionCardId ? cardsById.get(target.solutionCardId)?.text : null}
        <li
          class="flex items-center gap-3 rounded-lg px-3 py-2
            {target.decoy ? 'bg-amber-500/10 text-amber-100' : target.matchedCardId ? 'bg-emerald-500/10' : 'bg-slate-900/40 text-slate-400'}
            {readonly ? 'text-xl' : ''}"
          in:fly={{ y: 8, delay: i * 50, duration: 250 }}
        >
          <span class="min-w-0 flex-1 truncate font-semibold">{target.text}</span>
          {#if target.decoy}
            <span class="badge bg-amber-500/20 text-amber-300">Köder</span>
          {:else}
            <span class="shrink-0 font-mono text-sm {target.matchedCardId ? 'text-slate-100' : ''}">{solution}</span>
            {#if target.matchedCardId}
              <span class="hidden text-xs text-slate-400 sm:inline">{playerName(view, target.matchedBy)}</span>
              <span class="text-emerald-400">✓</span>
            {:else}
              <span class="text-xs">nicht zugeordnet</span>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Rundenergebnis</h3>
      <p class="text-sm text-slate-400">{matchedCount} von {round.cards.length} Paaren gefunden, {decoyCount} {decoyCount === 1 ? 'Köder' : 'Köder'} dabei.</p>
      <LivesList {view} {round} {readonly} />
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
