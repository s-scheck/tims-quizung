<script lang="ts">
  import { isTimelineYear, shiftYear, type RoomView, type TimelineRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatYear } from '../lib/format.ts';
  import Timeline from './Timeline.svelte';
  import TurnTimer from './TurnTimer.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: TimelineRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const myGuess = $derived(round.myGuess ?? null);
  const canPlace = $derived(isParticipant && view.phase === 'playing' && !myGuess?.confirmed);
  const allConfirmed = $derived(participants.length > 0 && participants.every((p) => round.confirmed.includes(p.id)));
  const canEnd = $derived(!readonly && client.isHost && view.phase === 'playing');

  let confirmingEnd = $state(false);
  /** Eingabefeld: Betrag des Jahres, die Ära steht daneben. Folgt dem Tipp, solange nicht getippt wird. */
  let yearText = $state('');
  let beforeChrist = $state(false);
  let editing = $state(false);

  $effect(() => {
    const year = myGuess?.year;
    if (year === undefined || editing) return;
    yearText = String(Math.abs(year));
    beforeChrist = year < 0;
  });

  function place(year: number) {
    if (!canPlace || !isTimelineYear(year)) return;
    client.send({ type: 'place_year', year });
  }

  function shift(delta: number) {
    if (myGuess) place(shiftYear(myGuess.year, delta));
  }

  function applyText() {
    editing = false;
    const n = Number(yearText.trim());
    if (!Number.isInteger(n) || n <= 0) {
      if (myGuess) yearText = String(Math.abs(myGuess.year));
      return;
    }
    place(beforeChrist ? -n : n);
  }

  function toggleEra() {
    if (myGuess && !isTimelineYear(-myGuess.year)) return;
    beforeChrist = !beforeChrist;
    if (myGuess) place(-myGuess.year);
  }

  function confirmGuess() {
    if (!canPlace || !myGuess) return;
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
    if (client.isModerator) return 'Du moderierst. Die Lösung siehst nur du.';
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (myGuess?.confirmed) {
      return round.turnDeadline !== null
        ? 'Bestätigt. Warte, bis die Zeit abläuft oder der Host die Runde beendet.'
        : 'Bestätigt. Warte, bis der Host die Runde beendet.';
    }
    if (!myGuess) return 'Tippe auf den Zeitstrahl, um dein Jahr zu setzen. Zoomen geht mit zwei Fingern, mit dem Mausrad oder mit + und −.';
    return 'Neu antippen oder unten fein einstellen, dann bestätigen.';
  });

  /** Höhe der festen Leiste unten, damit der Inhalt darüber nie verdeckt wird. */
  let barHeight = $state(0);
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <p class="text-sm text-slate-400">{round.category.title} · {round.category.question}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.eventName}</h2>
    </div>
    <div class="flex items-center gap-2">
      <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
      {#if canEnd}
        <button class={confirmingEnd ? 'btn-danger' : 'btn-secondary'} onclick={endRound}>
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

  <Timeline guess={isParticipant ? (myGuess?.year ?? null) : null} target={round.target ?? null} interactive={canPlace} large={readonly} onPick={place} />

  {#if round.privileged}
    <p class="text-xs text-amber-300/80">Das grüne Band siehst nur du als Moderator. Die Tipps der Spieler erscheinen erst in der Auflösung.</p>
  {/if}
</div>

{#if canPlace}
  <div aria-hidden="true" style="height:{barHeight}px"></div>
  <div bind:clientHeight={barHeight} class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-1">
        <button class="btn-secondary px-2.5 py-2 text-sm" disabled={!myGuess} onclick={() => shift(-10)} aria-label="10 Jahre früher">−10</button>
        <button class="btn-secondary px-2.5 py-2 text-sm" disabled={!myGuess} onclick={() => shift(-1)} aria-label="1 Jahr früher">−1</button>
        <input
          class="input w-20 px-2 py-2 text-center font-mono"
          type="text"
          inputmode="numeric"
          maxlength="4"
          placeholder="Jahr"
          aria-label="Jahr eingeben"
          bind:value={yearText}
          onfocus={() => (editing = true)}
          onblur={applyText}
          onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <button class="btn-secondary px-2.5 py-2 text-sm" disabled={!myGuess} onclick={() => shift(1)} aria-label="1 Jahr später">+1</button>
        <button class="btn-secondary px-2.5 py-2 text-sm" disabled={!myGuess} onclick={() => shift(10)} aria-label="10 Jahre später">+10</button>
        <button
          class="rounded-xl border px-2.5 py-2 text-xs font-semibold transition {beforeChrist ? 'border-amber-400/60 bg-amber-400/15 text-amber-200' : 'border-slate-700 text-slate-400'}"
          onclick={toggleEra}
          aria-pressed={beforeChrist}
        >
          {beforeChrist ? 'v. Chr.' : 'n. Chr.'}
        </button>
      </div>
      <button class="btn-primary" disabled={!myGuess} onclick={confirmGuess}>
        {myGuess ? `${formatYear(myGuess.year)} bestätigen` : 'Tipp bestätigen'}
      </button>
    </div>
  </div>
{/if}
