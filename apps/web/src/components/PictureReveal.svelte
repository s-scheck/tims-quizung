<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { PictureRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import PictureView from './PictureView.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: PictureRoundView; readonly?: boolean } = $props();

  const players = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const solvedCount = $derived(round.fields.filter((f) => f.solved).length);
  /** In der Auflösung ist jedes Feld offen, auch die nie gelösten. */
  const shown = $derived(round.fields.map((f) => ({ ...f, solved: true })));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <PictureView image={round.image} original={round.original ?? null} fields={shown} large={readonly} />
    <ol class="card space-y-1">
      {#each round.fields as f, i (f.id)}
        <li
          class="flex items-center gap-3 rounded-lg px-3 py-2 {f.solved ? 'bg-emerald-500/10' : 'bg-slate-900/40 text-slate-400'} {readonly ? 'text-xl' : ''}"
          in:fly={{ y: 8, delay: i * 60, duration: 250 }}
        >
          <span class="w-6 shrink-0 text-right font-mono text-sm text-slate-500">{f.number}</span>
          <span class="min-w-0 flex-1 break-words font-semibold {f.solved ? '' : 'font-normal'}">{f.answer}</span>
          {#if f.solved}
            <span class="hidden text-xs text-slate-400 sm:inline">{playerName(view, f.solvedBy)}</span>
            <span class="text-emerald-400">✓</span>
          {:else}
            <span class="text-xs">nicht erraten</span>
          {/if}
        </li>
      {/each}
    </ol>
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Rundenergebnis</h3>
      <p class="text-sm text-slate-400">{solvedCount} von {round.fields.length} Feldern gelöst.</p>
      <ul class="space-y-1.5">
        {#each players as p (p.id)}
          {@const lives = round.lives[p.id] ?? 0}
          <li class="flex items-center gap-3 {readonly ? 'text-xl' : ''}">
            <span class="min-w-0 flex-1 break-words font-semibold {lives === 0 ? 'text-slate-500 line-through' : ''}">{p.name}</span>
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
