<script lang="ts">
  import { untrack } from 'svelte';
  import { LIVES_MAX, LIVES_MIN, type CategorySummary, type GameId, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import Scoreboard from './Scoreboard.svelte';

  let { view }: { view: RoomView } = $props();

  const games = $derived(view.games ?? []);
  const roundNo = $derived(view.rounds.length + 1);
  // Startwerte bewusst nur einmal lesen: danach steuert der Host die Auswahl selbst.
  let gameId = $state<GameId>(untrack(() => view.gameId ?? 'sort'));
  let lives = $state(untrack(() => view.defaultLives));
  let borders = $state(untrack(() => view.mapBorders));
  /** Bei Karte als Moderator: gewählte Sammlung, deren Ziele gerade zur Wahl stehen. */
  let targetPickFor = $state<string | null>(null);
  const usesLives = $derived(gameId === 'topx' || gameId === 'match');
  const isMap = $derived(gameId === 'map');
  const picksTarget = $derived(isMap && client.isModerator);
  const targetCategory = $derived((view.categories ?? []).find((c) => c.id === targetPickFor) ?? null);

  const categories = $derived((view.categories ?? []).filter((c) => c.games.includes(gameId)));
  const currentGame = $derived(games.find((g) => g.id === gameId));

  function choose(categoryId: string, targetId?: string) {
    client.send({
      type: 'choose_category',
      gameId,
      categoryId,
      ...(usesLives ? { lives } : {}),
      ...(isMap ? { borders } : {}),
      ...(targetId ? { targetId } : {}),
    });
  }

  function onCategoryClick(c: CategorySummary) {
    if (picksTarget) targetPickFor = c.id;
    else choose(c.id);
  }

  function selectGame(id: GameId) {
    gameId = id;
    targetPickFor = null;
  }
</script>

{#if client.isHost}
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">Runde {roundNo}</p>
        <h2 class="text-2xl font-bold">Spiel und Kategorie wählen</h2>
      </div>
      <button class="btn-ghost text-rose-300" onclick={() => client.send({ type: 'end_game' })}>Spiel beenden</button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      {#each games as g (g.id)}
        <button
          class="card flex flex-col items-start gap-1 text-left transition
            {gameId === g.id ? 'border-indigo-500 bg-indigo-500/15' : 'hover:border-slate-600'}"
          onclick={() => selectGame(g.id)}
        >
          <span class="text-lg font-bold">{g.name}</span>
          <span class="text-sm text-slate-400">{g.description}</span>
        </button>
      {/each}
    </div>

    {#if usesLives}
      <div class="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-semibold">Leben pro Spieler</p>
          <p class="text-xs text-slate-500">Jeder Fehler kostet eins. Ohne Leben ist man für diese Runde raus.</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary px-4" disabled={lives <= LIVES_MIN} onclick={() => (lives = Math.max(LIVES_MIN, lives - 1))} aria-label="weniger Leben">−</button>
          <span class="w-16 text-center text-2xl font-black text-rose-300">{'♥'.repeat(lives)}</span>
          <button class="btn-secondary px-4" disabled={lives >= LIVES_MAX} onclick={() => (lives = Math.min(LIVES_MAX, lives + 1))} aria-label="mehr Leben">+</button>
        </div>
      </div>
    {/if}

    {#if isMap}
      <div class="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-semibold">Ländergrenzen</p>
          <p class="text-xs text-slate-500">Ohne Grenzen zeigt die Karte nur Land und Wasser.</p>
        </div>
        <div class="flex gap-2">
          {#each [false, true] as withBorders (withBorders)}
            <button
              class="rounded-xl border px-3 py-2 text-sm font-semibold transition
                {borders === withBorders ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
              onclick={() => (borders = withBorders)}
            >
              {withBorders ? 'Mit Grenzen' : 'Ohne Grenzen'}
            </button>
          {/each}
        </div>
      </div>
      {#if !picksTarget}
        <p class="text-xs text-slate-500">Du spielst mit, deshalb zieht der Server ein zufälliges Ziel, das du nicht vorher siehst.</p>
      {/if}
    {/if}

    {#if targetCategory && picksTarget}
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm text-slate-400">{targetCategory.title}</p>
            <h3 class="text-lg font-bold">Ziel wählen</h3>
          </div>
          <button class="btn-ghost text-sm" onclick={() => (targetPickFor = null)}>Zurück</button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each targetCategory.targets ?? [] as t (t.id)}
            <button
              class="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-sm font-semibold transition hover:border-indigo-500/60 hover:bg-slate-800/60 {t.played ? 'opacity-60' : ''}"
              onclick={() => choose(targetCategory.id, t.id)}
            >
              <span class="truncate">{t.name}</span>
              {#if t.played}<span class="badge shrink-0 bg-emerald-500/20 text-emerald-300">gespielt</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {:else}
    <div>
      <p class="mb-2 text-sm text-slate-400">Kategorien für {currentGame?.name ?? gameId}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each categories as c (c.id)}
          <button
            class="card flex flex-col items-start gap-1 text-left transition hover:border-indigo-500/60 hover:bg-slate-800/60 {c.played ? 'opacity-60' : ''}"
            onclick={() => onCategoryClick(c)}
          >
            <div class="flex w-full items-start justify-between gap-2">
              <span class="font-bold">{c.title}</span>
              {#if c.played}<span class="badge shrink-0 bg-emerald-500/20 text-emerald-300">gespielt</span>{/if}
            </div>
            <span class="text-sm text-slate-400">{c.question}</span>
            <span class="text-xs text-slate-500">{c.count} {c.games.includes('map') ? 'Ziele' : 'Karten'}</span>
          </button>
        {/each}
      </div>
    </div>
    {/if}
  </div>
{:else}
  <div class="grid gap-6 md:grid-cols-2">
    <section class="card flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400"></div>
      <p class="text-lg">{playerName(view, view.hostId)} wählt Spiel und Kategorie…</p>
      <p class="text-sm text-slate-500">Runde {roundNo}</p>
    </section>
    <Scoreboard {view} readonly compact />
  </div>
{/if}
