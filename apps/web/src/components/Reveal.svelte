<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatValue, playerName } from '../lib/format.ts';

  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();

  const round = $derived(view.round!);
  const rows = $derived(
    (round.solution ?? []).map((id, i) => {
      const card = round.cards.find((c) => c.id === id)!;
      return { rank: i + 1, card, placed: round.chain.includes(id), isStart: id === round.startCardId };
    }),
  );
  const survivors = $derived(round.turnOrder.filter((id) => !round.eliminated.includes(id)));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <ol class="card space-y-1">
      <p class="mb-1 text-center text-xs font-semibold uppercase tracking-widest text-emerald-300">▲ {round.category.topLabel}</p>
      {#each rows as row, i (row.card.id)}
        <li
          class="flex items-center gap-3 rounded-lg px-3 py-2 {row.placed ? 'bg-slate-800/80' : 'bg-slate-900/40 text-slate-500'} {readonly ? 'text-xl' : ''}"
          in:fly={{ y: 8, delay: i * 60, duration: 250 }}
        >
          <span class="w-6 shrink-0 text-right font-mono text-sm text-slate-500">{row.rank}</span>
          <span class="min-w-0 flex-1 truncate font-semibold {row.placed ? '' : 'font-normal'}">{row.card.name}</span>
          {#if row.isStart}<span class="badge">Start</span>{:else if row.placed}<span class="text-emerald-400">✓</span>{:else}<span class="text-xs">nicht gelegt</span>{/if}
          <span class="shrink-0 font-mono text-sm {row.placed ? 'text-slate-200' : ''}">{formatValue(row.card, round.category)}</span>
        </li>
      {/each}
      <p class="mt-1 text-center text-xs font-semibold uppercase tracking-widest text-sky-300">▼ {round.category.bottomLabel}</p>
    </ol>
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Rundenergebnis</h3>
      <div>
        <p class="text-xs uppercase tracking-wider text-emerald-300">Durchgekommen</p>
        <p class="{readonly ? 'text-xl' : ''}">{survivors.length > 0 ? survivors.map((id) => playerName(view, id)).join(', ') : 'niemand'}</p>
      </div>
      <div>
        <p class="text-xs uppercase tracking-wider text-rose-300">Ausgeschieden (in Reihenfolge)</p>
        <p class="{readonly ? 'text-xl' : ''}">{round.eliminated.length > 0 ? round.eliminated.map((id, i) => `${i + 1}. ${playerName(view, id)}`).join(' · ') : 'niemand'}</p>
      </div>
      <p class="text-xs text-slate-500">{round.chain.length} von {round.cards.length} Karten liegen richtig.</p>
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
