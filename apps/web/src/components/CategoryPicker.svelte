<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import Scoreboard from './Scoreboard.svelte';

  let { view }: { view: RoomView } = $props();
  const categories = $derived(view.categories ?? []);
  const roundNo = $derived(view.rounds.length + 1);

  function choose(id: string) {
    client.send({ type: 'choose_category', categoryId: id });
  }

  function random() {
    const fresh = categories.filter((c) => !c.played);
    const pool = fresh.length > 0 ? fresh : categories;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick) choose(pick.id);
  }
</script>

{#if client.isHost}
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">Runde {roundNo}</p>
        <h2 class="text-2xl font-bold">Kategorie wählen</h2>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary" onclick={random}>Zufall</button>
        <button class="btn-ghost text-rose-300" onclick={() => client.send({ type: 'end_game' })}>Spiel beenden</button>
      </div>
    </div>
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each categories as c (c.id)}
        <button
          class="card flex flex-col items-start gap-1 text-left transition hover:border-indigo-500/60 hover:bg-slate-800/60 {c.played ? 'opacity-60' : ''}"
          onclick={() => choose(c.id)}
        >
          <div class="flex w-full items-start justify-between gap-2">
            <span class="font-bold">{c.title}</span>
            {#if c.played}<span class="badge shrink-0 bg-emerald-500/20 text-emerald-300">gespielt</span>{/if}
          </div>
          <span class="text-sm text-slate-400">{c.question}</span>
          <span class="text-xs text-slate-500">{c.count} Karten</span>
        </button>
      {/each}
    </div>
  </div>
{:else}
  <div class="grid gap-6 md:grid-cols-2">
    <section class="card flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400"></div>
      <p class="text-lg">{playerName(view, view.hostId)} wählt eine Kategorie…</p>
      <p class="text-sm text-slate-500">Runde {roundNo}</p>
    </section>
    <Scoreboard {view} readonly compact />
  </div>
{/if}
