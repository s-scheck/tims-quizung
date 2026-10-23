<script lang="ts">
  import { untrack } from 'svelte';
  import type { MapRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatKm, playerColor, playerName } from '../lib/format.ts';
  import { canReveal, newlyRevealed, ranksVisible, revealPlayer, revealStep } from '../lib/reveal.ts';
  import WorldMap, { type MapFocus, type MapMarker } from './WorldMap.svelte';
  import RevealControls from './RevealControls.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: MapRoundView; readonly?: boolean } = $props();

  const show = $derived(round.reveal);
  const moderator = $derived(canReveal(view, show, readonly));
  const ranking = $derived(round.ranking ?? []);
  /** Noch verdeckte Teilnehmer aus Sicht der Spieler. Der Moderator hat alle schon in der Rangliste. */
  const hidden = $derived(show && !round.privileged ? round.turnOrder.filter((id) => revealStep(show, id) < 1) : []);
  const showRanks = $derived(ranksVisible(show, moderator));
  const pinsById = $derived(new Map((round.pins ?? []).map((p) => [p.playerId, p])));
  const colorOf = (id: string) => playerColor(view.players.findIndex((pl) => pl.id === id));

  // Auf der Karte liegt nur, was schon aufgedeckt ist, auch beim Moderator. Seine Liste zeigt trotzdem alles.
  const markers = $derived<MapMarker[]>(
    (round.pins ?? [])
      .filter((p) => revealStep(show, p.playerId) >= 1)
      .map((p) => ({ id: p.playerId, lat: p.lat, lng: p.lng, label: playerName(view, p.playerId).slice(0, 2).toUpperCase(), color: colorOf(p.playerId) })),
  );
  const target = $derived(round.target && (!show || show.solution || round.privileged) ? round.target : null);

  // Flug zum frisch aufgedeckten Pin bzw. zur Lösung, auf allen Geräten.
  let focus = $state<MapFocus | null>(null);
  let last: { players: Record<string, number>; solution: boolean } | null = null;
  $effect(() => {
    const s = show;
    if (!s) return;
    const pins = pinsById;
    const t = round.target;
    untrack(() => {
      if (last) {
        const fresh = newlyRevealed(last.players, s.players);
        if (fresh.length === 1) {
          const pin = pins.get(fresh[0]!);
          if (pin) focus = { lat: pin.lat, lng: pin.lng, key: `pin:${fresh[0]}` };
        } else if (fresh.length === 0 && s.solution && !last.solution && t) {
          focus = { lat: t.lat, lng: t.lng, key: 'target' };
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
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.targetName}</h2>
      {#if target}
        <p class="text-xs text-slate-500">{target.lat.toFixed(3)}°, {target.lng.toFixed(3)}°{round.category.source ? ` · Quelle: ${round.category.source}` : ''}</p>
      {:else if show}
        <p class="text-xs text-slate-500">Das Ziel ist noch verdeckt.</p>
      {/if}
    </header>
    <WorldMap
      class="h-[52dvh] min-h-[320px] overflow-hidden rounded-2xl border border-slate-800 {readonly ? 'h-[65dvh]' : ''}"
      borders={round.borders}
      {target}
      {markers}
      {focus}
      showLines
      fitAll
    />
  </section>

  <aside class="space-y-4">
    {#if moderator && show}
      <RevealControls {show} turnOrder={round.turnOrder} solutionLabel="Ziel aufdecken" />
    {/if}

    <ol class="card divide-y divide-slate-800 p-0">
      {#each ranking as row, i (row.playerId)}
        {@const open = revealStep(show, row.playerId) >= 1}
        <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-xl' : ''} {row.playerId === client.myId ? 'bg-indigo-500/10' : ''}">
          <span class="w-6 text-right font-mono text-slate-500">{row.distanceKm === null || !showRanks ? '–' : `${i + 1}.`}</span>
          <span class="h-3 w-3 shrink-0 rounded-full" style="background:{colorOf(row.playerId)}"></span>
          <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, row.playerId)}</span>
          <span class="font-mono {row.distanceKm === null ? 'text-sm text-slate-500' : 'text-lg font-bold'} {moderator && !open ? 'text-slate-400' : ''}">
            {row.distanceKm === null ? 'kein Pin' : formatKm(row.distanceKm)}
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
      {#if client.isHost && view.phase === 'reveal'}
        <button class="btn-primary w-full text-lg" disabled={!complete} onclick={() => client.send({ type: 'to_scoring' })}>Punkte eintragen</button>
        {#if !complete}<p class="text-center text-xs text-slate-500">Erst alle Spieler und das Ziel aufdecken.</p>{/if}
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
      {/if}
    {/if}
  </aside>
</div>
