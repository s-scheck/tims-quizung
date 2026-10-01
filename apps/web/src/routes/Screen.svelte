<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { client } from '../lib/client.svelte.ts';
  import { joinUrl, playerName } from '../lib/format.ts';
  import Board from '../components/Board.svelte';
  import TopXBoard from '../components/TopXBoard.svelte';
  import Reveal from '../components/Reveal.svelte';
  import TopXReveal from '../components/TopXReveal.svelte';
  import MatchBoard from '../components/MatchBoard.svelte';
  import MatchReveal from '../components/MatchReveal.svelte';
  import Scoreboard from '../components/Scoreboard.svelte';
  import FinalStandings from '../components/FinalStandings.svelte';
  import PlayerList from '../components/PlayerList.svelte';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';
  import Toast from '../components/Toast.svelte';

  let { code }: { code: string } = $props();
  const view = $derived(client.view);

  onMount(() => {
    if (client.intentCode !== code || client.me?.role !== 'screen') client.watch(code);
  });
  onDestroy(() => client.disconnect());
</script>

<div class="screen flex min-h-dvh flex-col text-lg">
  <header class="flex items-center justify-between gap-6 border-b border-slate-800 px-8 py-4">
    <div class="flex items-baseline gap-4">
      <span class="text-sm font-semibold uppercase tracking-widest text-indigo-400">Tims Quizung</span>
      {#if view?.round}
        <span class="text-slate-300">{view.round.category.title}</span>
      {/if}
    </div>
    <div class="flex items-center gap-3 text-slate-300">
      <span class="text-sm text-slate-500">Mitspielen:</span>
      <span class="font-mono text-2xl font-black tracking-[0.25em] text-white">{code}</span>
      <span class="hidden text-sm text-slate-500 lg:inline">{joinUrl(code).replace(/^https?:\/\//, '')}</span>
    </div>
  </header>
  <ConnectionBanner />
  <main class="mx-auto w-full max-w-7xl flex-1 px-8 py-6">
    {#if !view}
      {#if client.terminal}
        <p class="text-center text-slate-400">Der Raum wurde geschlossen.</p>
      {:else if client.status === 'closed'}
        <p class="text-center text-slate-400">Diesen Raum gibt es nicht.</p>
      {:else}
        <p class="text-center text-slate-400">Verbinde…</p>
      {/if}
    {:else if view.phase === 'lobby'}
      <div class="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div class="space-y-4">
          <p class="text-slate-400">Raum beitreten mit Code</p>
          <p class="font-mono text-8xl font-black tracking-[0.2em]">{view.code}</p>
          <p class="text-2xl text-slate-300">{joinUrl(view.code).replace(/^https?:\/\//, '')}</p>
        </div>
        <div>
          <h2 class="mb-3 text-2xl font-bold">Spieler ({view.players.length})</h2>
          <PlayerList {view} large />
          <p class="mt-6 text-slate-400">Warte auf {playerName(view, view.hostId)}, das Spiel zu starten…</p>
        </div>
      </div>
    {:else if view.phase === 'choosing_category'}
      <div class="grid gap-10 lg:grid-cols-[1fr_1fr]">
        <div class="space-y-3">
          <p class="text-3xl font-bold">{playerName(view, view.hostId)} wählt Spiel und Kategorie…</p>
          {#if view.rounds.length > 0}
            <p class="text-slate-400">Runde {view.rounds.length + 1}</p>
          {/if}
        </div>
        <Scoreboard {view} readonly compact />
      </div>
    {:else if view.phase === 'playing' || view.phase === 'host_decision'}
      {#if view.round?.game === 'topx'}
        <TopXBoard {view} round={view.round} readonly />
      {:else if view.round?.game === 'match'}
        <MatchBoard {view} round={view.round} readonly />
      {:else if view.round?.game === 'sort'}
        <Board {view} round={view.round} readonly />
      {/if}
    {:else if view.phase === 'reveal' || view.phase === 'scoring'}
      {#if view.round?.game === 'topx'}
        <TopXReveal {view} round={view.round} readonly />
      {:else if view.round?.game === 'match'}
        <MatchReveal {view} round={view.round} readonly />
      {:else if view.round?.game === 'sort'}
        <Reveal {view} round={view.round} readonly />
      {/if}
    {:else if view.phase === 'scoreboard'}
      <Scoreboard {view} readonly />
    {:else if view.phase === 'finished'}
      <FinalStandings {view} readonly />
    {/if}
  </main>
</div>
<Toast />
