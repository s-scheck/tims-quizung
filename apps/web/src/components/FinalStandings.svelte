<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { ranking } from '../lib/format.ts';

  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();
  const rows = $derived(ranking(view));
  const medals = ['🥇', '🥈', '🥉'];
</script>

<section class="mx-auto max-w-lg space-y-6 text-center">
  <header>
    <p class="text-sm font-semibold uppercase tracking-widest text-indigo-400">Endstand</p>
    <h2 class="{readonly ? 'text-5xl' : 'text-3xl'} font-black">
      {#if rows[0]}{rows.filter((r) => r.rank === 1).length > 1 ? 'Unentschieden!' : `${rows[0].player.name} gewinnt!`}{/if}
    </h2>
    <p class="text-slate-400">{view.rounds.length} {view.rounds.length === 1 ? 'Runde' : 'Runden'}</p>
  </header>

  <ol class="card divide-y divide-slate-800 p-0 text-left">
    {#each rows as row, i (row.player.id)}
      <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-2xl' : ''}" in:fly={{ y: 10, delay: i * 120, duration: 300 }}>
        <span class="w-8 text-center text-xl">{row.rank <= 3 ? medals[row.rank - 1] : `${row.rank}.`}</span>
        <span class="min-w-0 flex-1 truncate font-semibold">{row.player.name}</span>
        <span class="font-mono text-2xl font-black">{row.score}</span>
      </li>
    {/each}
  </ol>

  {#if !readonly}
    {#if client.isHost}
      <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'back_to_lobby' })}>Zurück zur Lobby</button>
    {:else}
      <p class="text-sm text-slate-400">Der Host kann zurück in die Lobby und ein neues Spiel starten.</p>
    {/if}
  {/if}
</section>
