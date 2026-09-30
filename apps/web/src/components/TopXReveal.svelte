<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { RoomView, TopXRoundView, TopXSlotView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatValue, playerName } from '../lib/format.ts';

  let { view, round, readonly = false }: { view: RoomView; round: TopXRoundView; readonly?: boolean } = $props();

  const players = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const revealedCount = $derived(round.slots.filter((s) => s.revealed).length);

  function valueText(slot: TopXSlotView): string {
    return formatValue({ id: String(slot.rank), name: slot.name ?? '', value: slot.value, label: slot.label }, round.category);
  }
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <ol class="card space-y-1">
      <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">▲ {round.category.topLabel}</p>
      {#each round.slots as slot, i (slot.rank)}
        <li
          class="flex items-center gap-3 rounded-lg px-3 py-2 {slot.revealed ? 'bg-emerald-500/10' : 'bg-slate-900/40 text-slate-400'} {readonly ? 'text-xl' : ''}"
          in:fly={{ y: 8, delay: i * 60, duration: 250 }}
        >
          <span class="w-6 shrink-0 text-right font-mono text-sm text-slate-500">{slot.rank}</span>
          <span class="min-w-0 flex-1 truncate font-semibold {slot.revealed ? '' : 'font-normal'}">{slot.name}</span>
          {#if slot.revealed}
            <span class="hidden text-xs text-slate-400 sm:inline">{playerName(view, slot.revealedBy)}</span>
            <span class="text-emerald-400">✓</span>
          {:else}
            <span class="text-xs">nicht erraten</span>
          {/if}
          <span class="shrink-0 font-mono text-sm {slot.revealed ? 'text-slate-200' : ''}">{valueText(slot)}</span>
        </li>
      {/each}
      <p class="mt-1 text-xs font-semibold uppercase tracking-widest text-sky-300">▼ {round.category.bottomLabel}</p>
    </ol>
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Rundenergebnis</h3>
      <p class="text-sm text-slate-400">{revealedCount} von {round.slots.length} Karten erraten.</p>
      <ul class="space-y-1.5">
        {#each players as p (p.id)}
          {@const lives = round.lives[p.id] ?? 0}
          <li class="flex items-center gap-3 {readonly ? 'text-xl' : ''}">
            <span class="min-w-0 flex-1 truncate font-semibold {lives === 0 ? 'text-slate-500 line-through' : ''}">{p.name}</span>
            <span class="text-sm text-slate-300">{round.hits[p.id] ?? 0} Treffer</span>
            <span class="font-mono text-rose-400">{'♥'.repeat(lives)}<span class="text-slate-700">{'♥'.repeat(Math.max(0, round.maxLives - lives))}</span></span>
          </li>
        {/each}
      </ul>
      {#if round.wrongGuesses.length > 0}
        <p class="text-xs text-slate-500">Fehltipps: {round.wrongGuesses.map((w) => w.text).join(', ')}</p>
      {/if}
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
