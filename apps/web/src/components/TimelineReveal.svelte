<script lang="ts">
  import { untrack } from 'svelte';
  import type { RoomView, TimelineRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatYear, formatYearDistance, formatYearSpan, playerColor, playerName } from '../lib/format.ts';
  import { canReveal, newlyRevealed, ranksVisible, revealPlayer, revealStep } from '../lib/reveal.ts';
  import Timeline, { type TimelineFocus, type TimelineMarker } from './Timeline.svelte';
  import RevealControls from './RevealControls.svelte';
  import ScoringHandoff from './ScoringHandoff.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: TimelineRoundView; readonly?: boolean } = $props();

  const show = $derived(round.reveal);
  const moderator = $derived(canReveal(view, show, readonly));
  const ranking = $derived(round.ranking ?? []);
  const hidden = $derived(show && !round.privileged ? round.turnOrder.filter((id) => revealStep(show, id) < 1) : []);
  const showRanks = $derived(ranksVisible(show, moderator));
  const yearOf = $derived(new Map((round.guesses ?? []).map((g) => [g.playerId, g.year])));
  const colorOf = (id: string) => playerColor(view.players.findIndex((pl) => pl.id === id));

  const markers = $derived<TimelineMarker[]>(
    (round.guesses ?? [])
      .filter((g) => revealStep(show, g.playerId) >= 1)
      .map((g) => ({ id: g.playerId, year: g.year, label: playerName(view, g.playerId).slice(0, 2).toUpperCase(), color: colorOf(g.playerId) })),
  );
  const target = $derived(round.target && (!show || show.solution || round.privileged) ? round.target : null);

  let focus = $state<TimelineFocus | null>(null);
  let last: { players: Record<string, number>; solution: boolean } | null = null;
  $effect(() => {
    const s = show;
    if (!s) return;
    const years = yearOf;
    const t = round.target;
    untrack(() => {
      if (last) {
        const fresh = newlyRevealed(last.players, s.players);
        if (fresh.length === 1) {
          const year = years.get(fresh[0]!);
          if (year !== undefined) focus = { year, key: `guess:${fresh[0]}` };
        } else if (fresh.length === 0 && s.solution && !last.solution && t) {
          focus = { year: Math.round((t.from + t.to) / 2), key: 'target' };
        }
      }
      last = { players: { ...s.players }, solution: s.solution };
    });
  });

  const complete = $derived(!show || show.complete);
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.eventName}</h2>
      {#if target}
        <p class="text-lg font-bold text-emerald-300 {readonly ? 'text-2xl' : ''}">{formatYearSpan(target)}</p>
        {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
      {:else if show}
        <p class="text-sm text-slate-500">Das Jahr ist noch verdeckt.</p>
      {/if}
    </header>
    <Timeline {target} {markers} {focus} fitAll large={readonly} />
  </section>

  <aside class="space-y-4">
    {#if moderator && show}
      <RevealControls {show} turnOrder={round.turnOrder} solutionLabel="Jahr aufdecken" />
    {/if}

    <ol class="card divide-y divide-slate-800 p-0">
      {#each ranking as row, i (row.playerId)}
        {@const open = revealStep(show, row.playerId) >= 1}
        {@const year = yearOf.get(row.playerId)}
        <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-xl' : ''} {row.playerId === client.myId ? 'bg-indigo-500/10' : ''}">
          <span class="w-6 text-right font-mono text-slate-500">{row.distanceYears === null || !showRanks ? '–' : `${i + 1}.`}</span>
          <span class="h-3 w-3 shrink-0 rounded-full" style="background:{colorOf(row.playerId)}"></span>
          <span class="min-w-0 flex-1 break-words">
            <span class="font-semibold">{playerName(view, row.playerId)}</span>
            {#if year !== undefined}<span class="ml-1 text-sm text-slate-400">{formatYear(year)}</span>{/if}
          </span>
          <span class="font-mono {row.distanceYears === null ? 'text-sm text-slate-500' : row.distanceYears === 0 ? 'text-lg font-bold text-emerald-300' : 'text-lg font-bold'} {moderator && !open ? 'text-slate-400' : ''}">
            {row.distanceYears === null ? 'kein Tipp' : formatYearDistance(row.distanceYears)}
          </span>
          {#if moderator}
            {#if open}
              <span class="w-8 text-center text-emerald-300" aria-label="aufgedeckt">✓</span>
            {:else}
              <button class="btn-primary px-3 py-1.5 text-xs" onclick={() => revealPlayer(row.playerId)}>Aufdecken</button>
            {/if}
          {/if}
        </li>
      {/each}
      {#each hidden as id (id)}
        <li class="flex items-center gap-3 px-4 py-3 text-slate-500 {readonly ? 'text-xl' : ''} {id === client.myId ? 'bg-indigo-500/10' : ''}">
          <span class="w-6 text-right font-mono">?</span>
          <span class="h-3 w-3 shrink-0 rounded-full bg-slate-800"></span>
          <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, id)}</span>
          <span class="text-sm italic">verdeckt</span>
        </li>
      {/each}
    </ol>

    {#if !readonly}
      <ScoringHandoff {view} disabled={!complete} hint="Erst alle Spieler und das Jahr aufdecken." />
    {/if}
  </aside>
</div>
