<script lang="ts">
  import PlayerHead from './PlayerHead.svelte';
  import { fly } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { ranking } from '../lib/format.ts';
  import Podium from './avatar/Podium.svelte';

  /** Endstand: der Host deckt Platz für Platz auf, vom letzten zum ersten, der Sieger zuletzt mit Krone. */
  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();
  const rows = $derived(ranking(view));
  const medals = ['🥇', '🥈', '🥉'];

  // Rangstufen aufsteigend nach Punkten: Stufe 0 ist der letzte Platz.
  const levels = $derived([...new Set(rows.map((r) => r.score))].sort((a, b) => a - b));
  const shown = $derived(view.finale?.shown ?? levels.length);
  const total = $derived(view.finale?.total ?? levels.length);
  const complete = $derived(shown >= total);
  const visibleRows = $derived(rows.filter((r) => levels.indexOf(r.score) < shown));
  const nextRank = $derived(rows.find((r) => levels.indexOf(r.score) === shown)?.rank ?? 1);
  const podiumHeight = $derived(typeof window === 'undefined' ? 320 : readonly ? Math.round(window.innerHeight * 0.6) : Math.min(360, Math.round(window.innerHeight * 0.48)));
</script>

<section class="mx-auto {readonly ? 'max-w-5xl' : 'max-w-lg'} space-y-6 text-center">
  <header>
    <p class="text-sm font-semibold uppercase tracking-widest text-indigo-400">Endstand</p>
    <h2 class="{readonly ? 'text-5xl' : 'text-3xl'} font-black">
      {#if complete && rows[0]}
        {rows.filter((r) => r.rank === 1).length > 1 ? 'Unentschieden!' : `${rows[0].player.name} gewinnt!`}
      {:else}
        Wer hat gewonnen?
      {/if}
    </h2>
    <p class="text-slate-400">{view.rounds.length} {view.rounds.length === 1 ? 'Runde' : 'Runden'}</p>
  </header>

  <Podium {view} mode="finale" height={podiumHeight} large={readonly} />

  {#if !readonly && visibleRows.length > 0}
    <ol class="card divide-y divide-slate-800 p-0 text-left">
      {#each visibleRows as row (row.player.id)}
        <li class="flex items-center gap-3 px-4 py-2" in:fly={{ y: 10, duration: 300 }}>
          <span class="w-8 text-center text-xl">{row.rank <= 3 ? medals[row.rank - 1] : `${row.rank}.`}</span>
          <PlayerHead {view} id={row.player.id} />
          <span class="min-w-0 flex-1 break-words font-semibold">{row.player.name}</span>
          <span class="font-mono text-2xl font-black">{row.score}</span>
        </li>
      {/each}
    </ol>
  {/if}

  {#if !readonly}
    {#if client.isHost}
      {#if !complete}
        <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'finale_step' })}>
          {nextRank === 1 ? 'Sieger aufdecken 🏆' : `Platz ${nextRank} aufdecken`}
        </button>
      {:else}
        <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'back_to_lobby' })}>Zurück zur Lobby</button>
      {/if}
    {:else if !complete}
      <p class="text-sm text-slate-400">Der Host deckt Platz für Platz auf …</p>
    {:else}
      <p class="text-sm text-slate-400">Der Host kann zurück in die Lobby und ein neues Spiel starten.</p>
    {/if}
  {/if}
</section>
