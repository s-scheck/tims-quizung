<script lang="ts">
  import { GUESS_MAX_LENGTH, type RiskRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import RiskSlots from './RiskSlots.svelte';
  import RiskTotals from './RiskTotals.svelte';
  import TurnTimer from './TurnTimer.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: RiskRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const canLogIn = $derived(isParticipant && view.phase === 'playing' && round.myGuess === undefined);
  const canEnd = $derived(!readonly && client.isHost && view.phase === 'playing');

  let text = $state('');
  let confirmingEnd = $state(false);

  function logIn() {
    if (!canLogIn || !text.trim()) return;
    client.send({ type: 'risk_guess', text: text.trim() });
  }

  function endPass() {
    if (!canEnd) return;
    if (!confirmingEnd) {
      confirmingEnd = true;
      setTimeout(() => (confirmingEnd = false), 3500);
      return;
    }
    confirmingEnd = false;
    client.send({ type: 'end_round' });
  }

  const missText = $derived(round.rules.missPoints === 0 ? 'Daneben gibt 0 Punkte' : `Daneben gibt −${-round.rules.missPoints} Punkte`);
  const dupText = $derived(round.rules.duplicates === 'both' ? 'gleiche Treffer punkten beide' : 'gleiche Treffer gehen leer aus');

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (client.isModerator) return 'Du moderierst. Die ganze Liste siehst nur du.';
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (round.myGuess !== undefined) return `Eingeloggt: „${round.myGuess}“. Warte auf die anderen.`;
    return `Ein Tipp pro Durchgang. Platz = Punkte, Platz ${round.size} bringt ${round.size}.`;
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm text-slate-400">No Risk No Fun · Durchgang {round.passNo}</p>
        <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-4xl' : ''}">{round.category.title}</h2>
        <p class="text-sm text-slate-400">{round.category.question}</p>
        <p class="text-xs text-slate-500">{missText}, {dupText}. Schon getroffene Plätze sind gesperrt.</p>
      </div>
      <div class="flex items-center gap-2">
        <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
        {#if canEnd}
          <button class={confirmingEnd ? 'btn-danger' : 'btn-secondary'} onclick={endPass}>
            {confirmingEnd ? `Wirklich auflösen? ${round.loggedIn.length} von ${participants.length} drin` : 'Durchgang auflösen'}
          </button>
        {/if}
      </div>
    </header>

    <div class="card flex flex-wrap items-center gap-2 py-2">
      <span class="mr-1 text-sm text-slate-400">{round.loggedIn.length} von {participants.length} eingeloggt</span>
      {#each participants as p (p.id)}
        {@const done = round.loggedIn.includes(p.id)}
        <span class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'} {readonly ? 'text-base' : ''}">
          {done ? '✓ ' : ''}{p.name}{p.id === client.myId ? ' (du)' : ''}
        </span>
      {/each}
    </div>

    {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}

    {#if canLogIn}
      <form class="card flex gap-2" onsubmit={(e) => { e.preventDefault(); logIn(); }}>
        <input class="input min-w-0 flex-1" type="text" maxlength={GUESS_MAX_LENGTH} placeholder="Dein Tipp, z. B. Mongolei" autocomplete="off" bind:value={text} />
        <button class="btn-primary" type="submit" disabled={!text.trim()}>Einloggen</button>
      </form>
    {/if}

    {#if round.solution}
      <div class="card">
        <h3 class="mb-2 font-bold">Ganze Liste <span class="text-xs font-normal text-amber-300/80">nur für dich</span></h3>
        <RiskSlots {view} {round} slots={round.solution} />
      </div>
    {:else}
      <div class="card">
        <h3 class="mb-2 font-bold">Plätze 1–{round.size}</h3>
        <RiskSlots {view} {round} slots={round.hitSlots} full large={readonly} />
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    {#if round.passes.length > 0}
      <RiskTotals {view} {round} large={readonly} />
    {/if}
  </aside>
</div>
