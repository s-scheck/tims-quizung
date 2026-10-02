<script lang="ts">
  import type { MapRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import WorldMap from './WorldMap.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: MapRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const myPin = $derived(round.myPin ?? null);
  const canPlace = $derived(isParticipant && view.phase === 'playing' && !myPin?.confirmed);
  const allConfirmed = $derived(participants.length > 0 && participants.every((p) => round.confirmed.includes(p.id)));
  const canEnd = $derived(!readonly && client.isHost && view.phase === 'playing');

  let confirmingEnd = $state(false);

  function place(p: { lat: number; lng: number }) {
    if (!canPlace) return;
    client.send({ type: 'place_pin', lat: p.lat, lng: p.lng });
  }

  function confirmPin() {
    if (!canPlace || !myPin) return;
    client.send({ type: 'confirm_pin' });
  }

  function endRound() {
    if (!canEnd) return;
    if (!allConfirmed && !confirmingEnd) {
      confirmingEnd = true;
      setTimeout(() => (confirmingEnd = false), 3500);
      return;
    }
    confirmingEnd = false;
    client.send({ type: 'end_round' });
  }

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (client.isModerator) return 'Du moderierst. Das Ziel siehst nur du.';
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (myPin?.confirmed) return 'Bestätigt. Warte, bis der Host die Runde beendet.';
    if (!myPin) return 'Tippe auf die Karte, um deinen Pin zu setzen. Zoomen und Verschieben geht mit zwei Fingern.';
    return 'Pin ziehen oder neu antippen, dann bestätigen.';
  });
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <p class="text-sm text-slate-400">{round.category.title} · {round.category.question}</p>
      <h2 class="truncate text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.targetName}</h2>
    </div>
    <div class="flex items-center gap-2">
      <span class="badge {round.borders ? 'bg-sky-500/20 text-sky-200' : ''}">{round.borders ? 'mit Grenzen' : 'ohne Grenzen'}</span>
      {#if canEnd}
        <button class="{confirmingEnd ? 'btn-danger' : 'btn-secondary'}" onclick={endRound}>
          {confirmingEnd ? `Wirklich beenden? ${round.confirmed.length} von ${participants.length} fertig` : 'Runde beenden'}
        </button>
      {/if}
    </div>
  </header>

  <div class="card flex flex-wrap items-center gap-2 py-2">
    <span class="mr-1 text-sm text-slate-400">{round.confirmed.length} von {participants.length} bestätigt</span>
    {#each participants as p (p.id)}
      {@const done = round.confirmed.includes(p.id)}
      <span class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'} {readonly ? 'text-base' : ''}">
        {done ? '✓ ' : ''}{p.name}{p.id === client.myId ? ' (du)' : ''}
      </span>
    {/each}
  </div>

  {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}

  <WorldMap
    class="h-[58dvh] min-h-[320px] overflow-hidden rounded-2xl border border-slate-800 {readonly ? 'h-[70dvh]' : ''}"
    borders={round.borders}
    bounds={round.category.bounds}
    interactive={canPlace}
    pin={isParticipant ? myPin : null}
    onPick={place}
    target={round.target ?? null}
  />

  {#if round.privileged}
    <p class="text-xs text-amber-300/80">Das rote Ziel siehst nur du als Moderator. Pins der Spieler erscheinen erst in der Auflösung.</p>
  {/if}
</div>

{#if isParticipant && !myPin?.confirmed && view.phase === 'playing'}
  <div class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <div class="mx-auto flex max-w-5xl items-center gap-3">
      <div class="min-w-0 flex-1 text-sm text-slate-300">
        {#if myPin}
          Pin bei <span class="font-mono text-white">{myPin.lat.toFixed(2)}°, {myPin.lng.toFixed(2)}°</span>
        {:else}
          <span class="text-slate-500">Noch kein Pin gesetzt</span>
        {/if}
      </div>
      <button class="btn-primary" disabled={!myPin} onclick={confirmPin}>Pin bestätigen</button>
    </div>
  </div>
{/if}
