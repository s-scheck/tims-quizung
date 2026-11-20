<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { DungeonAttemptView, DungeonDoorView, DungeonRoundView, RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import ScoringHandoff from '../ScoringHandoff.svelte';
  import DungeonPodium from './DungeonPodium.svelte';
  import { doorFormat, doorIcon } from './doorLabel.ts';

  /**
   * Auswertung: Treppchen für die ersten drei, darunter die übrigen Plätze mit Punkten, daneben bzw. darunter
   * das Protokoll „Hinter den Türen“: je versuchter Tür Frage, Lösung und alle Versuche.
   * Am Fernseher ohne Scrollen: das Protokoll blättert von selbst, am Handy darf es scrollen.
   */
  let { view, round, readonly = false }: { view: RoomView; round: DungeonRoundView; readonly?: boolean } = $props();

  const ranking = $derived(round.ranking);
  const top = $derived(ranking.slice(0, 3));
  const rest = $derived(ranking.slice(3));
  const winners = $derived(ranking.filter((x) => x.place === 1 && x.status === 'out'));
  const headline = $derived(
    winners.length === 0
      ? 'Niemand ist entkommen'
      : winners.length === 1
        ? `${playerName(view, winners[0]!.playerId)} entkommt zuerst!`
        : `${winners.map((w) => playerName(view, w.playerId)).join(' und ')} entkommen gleichzeitig!`,
  );
  const triesText = (w: number) => (w === 0 ? 'fehlerfrei' : w === 1 ? '1 Fehlversuch' : `${w} Fehlversuche`);
  const reached = (x: (typeof ranking)[number]) => (x.status === 'out' ? `draußen nach ${x.exitRound} R.` : `Raum ${x.room + 1}${x.status === 'eliminated' ? ' · festgesessen' : ''}`);

  // ------------------------------------------------------------ Protokoll

  interface DoorLog {
    room: number;
    door: DungeonDoorView;
    attempts: DungeonAttemptView[];
  }
  const logs = $derived.by((): DoorLog[] => {
    const all = round.attempts ?? [];
    const out: DoorLog[] = [];
    round.rooms.forEach((doors, room) => {
      for (const door of doors) {
        const attempts = all.filter((a) => a.doorId === door.id).sort((a, b) => a.roundNo - b.roundNo);
        if (attempts.length > 0) out.push({ room, door, attempts });
      }
    });
    return out;
  });

  /** Antwort kurz: Karte nur mit Entfernung (Koordinaten sagen niemandem etwas). */
  function answerText(a: DungeonAttemptView, door: DungeonDoorView): string {
    if (door.kind === 'map') return a.detail ?? 'Pin gesetzt';
    return a.detail ? `${a.answer} · ${a.detail}` : a.answer;
  }

  /** Top X: gewertete Plätze, am Fernseher gekürzt. */
  function topList(doorId: string, limit: number): { items: string[]; more: number } {
    const sol = round.solutions?.[doorId];
    const items = sol?.items ? sol.items.slice(0, sol.n ?? sol.items.length) : [];
    return { items: items.slice(0, limit), more: Math.max(0, (sol?.items?.length ?? 0) - Math.min(limit, items.length)) };
  }

  // Fernseher: Seiten zu je sechs Türen (bei kleinen Bildschirmen vier), die von selbst weiterblättern.
  const PER_PAGE = window.innerHeight < 900 ? 4 : 6;
  const PAGE_MS = 10000;
  const pages = $derived(Math.max(1, Math.ceil(logs.length / PER_PAGE)));
  let page = $state(0);
  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    if (readonly) timer = setInterval(() => (page = (page + 1) % pages), PAGE_MS);
  });
  onDestroy(() => timer && clearInterval(timer));
  const pageLogs = $derived(logs.slice((page % pages) * PER_PAGE, (page % pages) * PER_PAGE + PER_PAGE));
</script>

{#snippet solutionOf(l: DoorLog, tv: boolean)}
  {@const sol = round.solutions?.[l.door.id]}
  {#if l.door.kind === 'topx' && sol?.items}
    {@const list = topList(l.door.id, tv ? 3 : 5)}
    <p class="sol leading-snug {tv ? 'line-clamp-1' : ''}">
      {list.items.map((name, i) => `${i + 1}. ${name}`).join(' · ')}{#if (sol.n ?? 0) > list.items.length}<span class="opacity-60"> … bis Platz {sol.n}</span>{/if}
    </p>
    {#if !tv && sol.items.length > list.items.length}
      <details class="mt-0.5 text-xs text-stone-400">
        <summary class="cursor-pointer select-none font-semibold text-amber-300/80">Ganze Liste ({sol.items.length})</summary>
        <ol class="mt-1 columns-2 gap-3">
          {#each sol.items as name, i (i)}<li class={i < (sol.n ?? 0) ? 'text-stone-200' : ''}><span class="opacity-60">{i + 1}.</span> {name}</li>{/each}
        </ol>
      </details>
    {/if}
  {:else if l.door.kind === 'map'}
    <p class="sol truncate"><span aria-hidden="true">📍</span> {sol?.solution}</p>
  {:else}
    <p class="sol {tv ? 'line-clamp-1' : ''}">{sol?.solution}</p>
  {/if}
{/snippet}

{#snippet doorCard(l: DoorLog, tv: boolean)}
  {@const sol = round.solutions?.[l.door.id]}
  <article class="door-card flex min-h-0 flex-col gap-1 overflow-hidden rounded-xl {tv ? 'p-3' : 'p-2.5'}">
    <p class="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wider text-amber-400/80">
      <span aria-hidden="true">{doorIcon(l.door)}</span>
      <span class="mw0 truncate">{l.door.title}</span>
      <span class="ml-auto shrink-0 font-semibold normal-case tracking-normal text-stone-500">{doorFormat(l.door)}</span>
    </p>
    <p class="font-semibold leading-snug text-stone-200 {tv ? 'line-clamp-2 text-lg' : ''}">{sol?.prompt}</p>
    {@render solutionOf(l, tv)}
    <ul class="{tv ? 'mt-auto flex flex-wrap gap-1' : 'mt-0.5 space-y-0.5'} text-sm">
      {#each l.attempts as a, i (i)}
        {#if tv}
          <li class="chip inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold {a.correct ? 'ok' : 'bad'}">
            <span class="font-black">{a.correct ? '✓' : '✗'}</span>
            <PlayerHead {view} id={a.playerId} size={16} />
            <span class="truncate">{playerName(view, a.playerId)}</span>
            {#if (l.door.kind === 'map' || l.door.kind === 'timeline') && a.detail}<span class="opacity-70">· {a.detail.replace(' entfernt', '')}</span>{/if}
          </li>
        {:else}
          <li class="flex items-start gap-1.5 {a.correct ? 'text-emerald-200' : 'text-stone-400'}">
            <span class="w-4 shrink-0 text-center font-black">{a.correct ? '✓' : '✗'}</span>
            <PlayerHead {view} id={a.playerId} size={16} />
            <span class="mw0 break-words"><span class="font-semibold">{playerName(view, a.playerId)}:</span> {answerText(a, l.door)}</span>
          </li>
        {/if}
      {/each}
    </ul>
  </article>
{/snippet}

{#snippet restList(tv: boolean)}
  {#if rest.length > 0}
    {@const dense = !tv && rest.length > 2}
    <ol class={dense ? 'grid grid-cols-2 gap-1.5' : 'space-y-1.5'}>
      {#each rest as x (x.playerId)}
        <li class="row flex items-center rounded-xl {tv ? 'gap-3 px-3 py-2 text-lg' : dense ? 'gap-1.5 px-2 py-1 text-sm' : 'gap-2 px-2.5 py-1.5 text-sm'} {x.playerId === client.myId && !tv ? 'me' : ''}">
          <span class="w-6 shrink-0 text-center font-black text-stone-500">{x.place}.</span>
          <PlayerHead {view} id={x.playerId} size={tv ? 30 : 20} />
          <span class="flex mw0 flex-1 flex-col leading-tight">
            <span class="truncate font-bold text-stone-100">{playerName(view, x.playerId)}</span>
            {#if !dense}<span class="truncate text-xs text-stone-500">{reached(x)} · {triesText(x.wrong)}</span>{/if}
          </span>
          <span class="shrink-0 font-mono font-black text-amber-300">+{x.points}</span>
        </li>
      {/each}
    </ol>
  {/if}
{/snippet}

{#if readonly}
  <div class="grid gap-6" style="height: calc(100dvh - 5.75rem); grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.25fr)">
    <section class="flex min-h-0 flex-col gap-3">
      <header>
        <p class="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-500/80">Dungeon · Auswertung</p>
        <h2 class="text-3xl font-black leading-tight text-stone-50">{headline}</h2>
      </header>
      <div class="min-h-0 flex-1">
        <DungeonPodium {view} {top} big />
      </div>
      {@render restList(true)}
    </section>

    <section class="flex min-h-0 flex-col gap-3">
      <div class="flex items-baseline gap-3">
        <h3 class="text-xl font-black text-stone-200">Hinter den Türen</h3>
        <span class="text-sm text-stone-500">{logs.length} {logs.length === 1 ? 'Tür' : 'Türen'} versucht</span>
        {#if pages > 1}
          <span class="ml-auto flex items-center gap-1.5">
            {#each Array.from({ length: pages }, (_, i) => i) as i (i)}
              <span class="dot {i === page % pages ? 'on' : ''}"></span>
            {/each}
          </span>
        {/if}
      </div>
      {#if logs.length === 0}
        <p class="text-stone-500">Niemand hat eine Tür versucht.</p>
      {:else}
        {#key page % pages}
          <div class="grid min-h-0 flex-1 grid-cols-2 gap-2.5" style="grid-template-rows: repeat({Math.min(3, Math.ceil(Math.max(pageLogs.length, 2) / 2))}, minmax(0, 1fr))" in:fade={{ duration: 400 }}>
            {#each pageLogs as l (l.door.id)}
              <div class="flex min-h-0 flex-col overflow-hidden">
                <p class="mb-1 text-[0.7rem] font-black uppercase tracking-[0.2em] text-stone-500">Raum {l.room + 1}</p>
                {@render doorCard(l, true)}
              </div>
            {/each}
          </div>
        {/key}
        {#if pages > 1}
          <div class="h-1 overflow-hidden rounded-full bg-stone-800"><div class="pager h-full bg-amber-500/70" style="animation-duration:{PAGE_MS}ms"></div></div>
        {/if}
      {/if}
    </section>
  </div>
{:else}
  <div class="space-y-4">
    <header>
      <p class="text-[0.65rem] font-extrabold uppercase tracking-[0.25em] text-amber-500/80">Dungeon · Auswertung</p>
      <h2 class="text-xl font-black leading-tight">{headline}</h2>
    </header>
    <div style="height: {rest.length > 2 ? 30 : 34}dvh">
      <DungeonPodium {view} {top} />
    </div>
    {@render restList(false)}
    <ScoringHandoff {view} />

    <section class="space-y-3 pt-1">
      <h3 class="font-black text-stone-300">Hinter den Türen</h3>
      {#if logs.length === 0}
        <p class="text-stone-500">Niemand hat eine Tür versucht.</p>
      {/if}
      {#each round.rooms as _, r (r)}
        {@const here = logs.filter((l) => l.room === r)}
        {#if here.length > 0}
          <div class="space-y-1.5">
            <p class="text-xs font-black uppercase tracking-[0.2em] text-amber-400/80">Raum {r + 1}</p>
            {#each here as l (l.door.id)}{@render doorCard(l, false)}{/each}
          </div>
        {/if}
      {/each}
    </section>
  </div>
{/if}

<style>
  /* Statt min-w-0: Der Fernseher bricht Flex-Zeilen mit .min-w-0 sonst um (app.css). */
  .mw0 {
    min-width: 0;
  }
  .door-card {
    background: linear-gradient(180deg, #221b15, #17120e);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
    flex: 1 1 auto;
  }
  .sol {
    color: #6ee7b7;
    font-weight: 700;
  }
  .chip.ok {
    background: rgb(16 185 129 / 0.14);
    color: #a7f3d0;
  }
  .chip.bad {
    background: rgb(255 255 255 / 0.05);
    color: #a8a29e;
  }
  .row {
    background: linear-gradient(180deg, #211a14, #16120e);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  }
  .row.me {
    box-shadow: inset 0 0 0 1.5px rgb(129 140 248 / 0.7);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.15);
  }
  .dot.on {
    background: #f59e0b;
  }
  .pager {
    animation: pager linear infinite;
    transform-origin: left;
  }
  @keyframes pager {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
</style>
