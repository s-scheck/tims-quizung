<script lang="ts">
  import { GUESS_MAX_LENGTH, type RoomView, type StillsRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { playBuzzer, unlockBuzzer } from '../lib/buzzer.ts';
  import TurnTimer from './TurnTimer.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: StillsRoundView; readonly?: boolean } = $props();

  const isHost = $derived(!readonly && client.isHost);
  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const playing = $derived(view.phase === 'playing');
  const total = $derived(round.points.length);
  const isLast = $derived(round.stage >= total - 1);
  const isType = $derived(round.mode === 'type');

  // ------------------------------------------------------------ Fotos

  /** Angetipptes früheres Foto, sonst das aktuelle. Springt bei jedem neuen Foto zurück. */
  let picked = $state<number | null>(null);
  $effect(() => {
    void round.stage;
    picked = null;
  });
  const shownIndex = $derived(picked ?? round.stage);
  const released = $derived(round.images.slice(0, round.stage + 1));

  // ------------------------------------------------------------ Tippen

  const myStageGuess = $derived(round.myGuesses?.find((g) => g.stage === round.stage) ?? null);
  const canGuess = $derived(isParticipant && playing && isType && !round.over && round.stagePhase === 'guessing' && !myStageGuess);
  const stageGuesses = $derived(
    participants.map((p) => ({ player: p, guess: round.guesses?.[p.id]?.find((g) => g.stage === round.stage) ?? null })),
  );
  const allJudged = $derived(stageGuesses.every((s) => !s.guess || s.guess.status !== 'judging'));

  let text = $state('');
  let barHeight = $state(0);

  function submitGuess() {
    const t = text.trim();
    if (!t || !canGuess) return;
    client.send({ type: 'still_guess', text: t });
    text = '';
  }

  // ------------------------------------------------------------ Buzzern

  const lockedMe = $derived(!!client.myId && round.locked.includes(client.myId));
  const canBuzz = $derived(isParticipant && playing && !isType && !round.over && !round.buzz && !lockedMe);

  // Neuer Buzz: Ton am Host-Gerät, Vibration beim Buzzernden.
  let lastBuzz = '';
  $effect(() => {
    const key = round.buzz ? `${round.buzz.playerId}:${round.buzz.deadline}` : '';
    if (key === lastBuzz) return;
    lastBuzz = key;
    if (!round.buzz || readonly) return;
    if (isHost) playBuzzer();
    if (round.buzz.playerId === client.myId) navigator.vibrate?.(200);
  });

  // ------------------------------------------------------------ Host

  let confirmingEnd = $state(false);

  function endRound() {
    if (!isHost) return;
    // Nach dem Raten ist Auflösen der normale nächste Schritt, vorher fragen wir nach.
    if (!round.over && !confirmingEnd) {
      confirmingEnd = true;
      setTimeout(() => (confirmingEnd = false), 3500);
      return;
    }
    confirmingEnd = false;
    client.send({ type: 'end_round' });
  }

  const canNext = $derived(
    isHost && playing && !isLast && (round.over || (isType ? round.stagePhase === 'judging' && allJudged : !round.buzz)),
  );

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (isHost) {
      if (round.over) return isLast ? 'Das Raten ist vorbei. Löse auf, wenn alle so weit sind.' : 'Das Raten ist vorbei. Du kannst die übrigen Fotos noch zeigen oder gleich auflösen.';
      if (isType) return round.stagePhase === 'guessing' ? 'Alle tippen einmal zu diesem Foto. Schließe die Tipps, wenn alle so weit sind.' : 'Prüfe jeden Tipp. Danach geht es zum nächsten Foto.';
      return round.buzz ? 'Hör dir die Antwort an und urteile.' : 'Warte auf den ersten Buzzer oder zeig das nächste Foto.';
    }
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (round.over) return '';
    if (isType) {
      if (myStageGuess?.status === 'wrong') return 'Leider falsch. Beim nächsten Foto darfst du wieder tippen.';
      if (myStageGuess?.status === 'correct') return 'Richtig! Warte, bis der Host alle Tipps geprüft hat.';
      if (myStageGuess) return 'Tipp abgegeben. Der Host prüft nach diesem Foto.';
      if (round.stagePhase === 'judging') return 'Die Tipps zu diesem Foto sind geschlossen. Beim nächsten Foto darfst du wieder.';
      return 'Aus welchem Film ist das? Du hast einen Tipp pro Foto.';
    }
    if (round.buzz?.playerId === client.myId) return 'Du bist dran! Sag den Film laut.';
    if (lockedMe) return 'Falsch. Beim nächsten Foto darfst du wieder buzzern.';
    return 'Erkannt? Buzzer drücken und den Film laut sagen.';
  });
</script>

<svelte:window onpointerdown={() => isHost && unlockBuzzer()} />

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm text-slate-400">{round.category.title} · {isType ? 'Tippen' : 'Buzzern'} · Foto {round.stage + 1} von {total}</p>
        <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.category.question}</h2>
      </div>
      {#if isHost && playing}
        <button class="{confirmingEnd ? 'btn-danger' : round.over ? 'btn-primary' : 'btn-secondary'} px-3 py-2 text-sm" onclick={endRound}>
          {confirmingEnd ? 'Wirklich auflösen?' : 'Auflösen'}
        </button>
      {/if}
    </header>

    {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}

    {#if round.over}
      <div class="card border-emerald-500/40 bg-emerald-500/10 {readonly ? 'text-2xl' : ''}">
        {#if round.solved}
          <p class="text-sm text-emerald-300">Erkannt bei Foto {round.solved.stage + 1} · {round.points[round.solved.stage]} Punkte</p>
          <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{round.answer}</p>
          <p class="mt-1 break-words">{round.solved.winners.map((id) => playerName(view, id)).join(', ')}</p>
        {:else}
          <p class="text-sm text-slate-300">Niemand hat es erkannt. Es war:</p>
          <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{round.answer}</p>
        {/if}
      </div>
    {/if}

    {#if round.buzz}
      <div class="card flex items-center gap-4 border-amber-500/60 bg-amber-500/15">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-amber-300">Gebuzzert</p>
          <p class="break-words text-3xl font-black {readonly ? 'text-5xl' : ''}">{playerName(view, round.buzz.playerId)}</p>
        </div>
        <TurnTimer deadline={round.buzz.deadline} totalSeconds={round.thinkSeconds} size={readonly ? 80 : 56} />
      </div>
      {#if isHost}
        <div class="grid grid-cols-2 gap-3">
          <button class="btn-primary bg-emerald-600 py-4 text-lg hover:bg-emerald-500" onclick={() => client.send({ type: 'still_verdict', correct: true })}>Richtig</button>
          <button class="btn-danger py-4 text-lg" onclick={() => client.send({ type: 'still_verdict', correct: false })}>Falsch</button>
        </div>
      {/if}
    {/if}

    <figure class="space-y-2">
      <div class="relative">
        <img
          src={round.images[shownIndex]}
          alt="Foto {shownIndex + 1}"
          class="mx-auto block w-auto max-w-full rounded-2xl border border-slate-800 bg-slate-900 object-contain {readonly ? 'max-h-[70vh]' : 'max-h-[60vh]'}"
          draggable="false"
        />
        <span class="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-sm font-bold">
          Foto {shownIndex + 1} · {round.points[shownIndex]} P
        </span>
      </div>
      {#if released.length > 1}
        <div class="flex flex-wrap justify-center gap-2">
          {#each released as src, i (i)}
            <button
              class="relative overflow-hidden rounded-lg border-2 transition {shownIndex === i ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'}"
              aria-label="Foto {i + 1} zeigen"
              onclick={() => (picked = i === round.stage ? null : i)}
            >
              <img {src} alt="" class="block h-14 w-20 object-cover sm:h-16 sm:w-24" draggable="false" />
              <span class="absolute bottom-0 right-0 rounded-tl-md bg-slate-950/80 px-1.5 text-xs font-bold">{i + 1}</span>
            </button>
          {/each}
        </div>
      {/if}
    </figure>

    {#if canBuzz || (isParticipant && playing && !isType && !round.over)}
      <button
        class="w-full rounded-3xl py-10 text-4xl font-black uppercase tracking-wider shadow-lg transition active:scale-95
          {canBuzz ? 'bg-rose-600 text-white hover:bg-rose-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'}"
        disabled={!canBuzz}
        onclick={() => client.send({ type: 'still_buzz' })}
      >
        {lockedMe ? 'Gesperrt' : round.buzz ? (round.buzz.playerId === client.myId ? 'Du bist dran' : 'Besetzt') : 'Buzzer'}
      </button>
    {/if}

    {#if isHost}
      <div class="card space-y-3">
        <!-- Nach dem Lösen bleibt die Prüfliste stehen, bis weitergeschaltet wird: Urteile lassen sich noch korrigieren. -->
        {#if isType && (!round.over || stageGuesses.some((s) => s.guess))}
          {#if round.stagePhase === 'guessing'}
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="font-bold">Tipps zu Foto {round.stage + 1}</h3>
              <span class="text-xs text-slate-500">{round.typed?.length ?? 0} von {participants.length}</span>
            </div>
            <ul class="flex flex-wrap gap-2 text-sm">
              {#each participants as p (p.id)}
                {@const done = round.typed?.includes(p.id)}
                <li class="rounded-full border px-3 py-1 {done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}">{done ? '✓' : '…'} {p.name}</li>
              {/each}
            </ul>
            <button class="btn-primary w-full" onclick={() => client.send({ type: 'still_close' })}>Tipps schließen</button>
          {:else}
            <h3 class="font-bold">Tipps zu Foto {round.stage + 1} prüfen</h3>
            <ul class="space-y-2">
              {#each stageGuesses as { player, guess } (player.id)}
                <li class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm">
                  <span class="font-semibold">{player.name}</span>
                  {#if !guess}
                    <span class="text-slate-500">kein Tipp</span>
                  {:else}
                    <span class="min-w-0 break-words {guess.status === 'correct' ? 'text-emerald-300' : guess.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{guess.text}</span>
                    {#if guess.suggested && guess.status === 'judging'}<span class="rounded-full bg-emerald-500/20 px-2 text-[10px] font-bold text-emerald-300">sieht richtig aus</span>{/if}
                    <span class="ml-auto flex gap-1">
                      <button
                        class="rounded-full px-2 py-0.5 text-[10px] font-bold {guess.status === 'correct' ? 'bg-emerald-500 text-white' : 'bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600'}"
                        onclick={() => client.send({ type: 'still_judge', playerId: player.id, correct: true })}>richtig</button
                      >
                      <button
                        class="rounded-full px-2 py-0.5 text-[10px] font-bold {guess.status === 'wrong' ? 'bg-rose-500 text-white' : 'bg-rose-600/30 text-rose-200 hover:bg-rose-600'}"
                        onclick={() => client.send({ type: 'still_judge', playerId: player.id, correct: false })}>falsch</button
                      >
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if !allJudged}<p class="text-xs text-slate-500">Erst alle Tipps prüfen, dann geht es weiter.</p>{/if}
          {/if}
        {:else if !round.over && round.locked.length > 0}
          <p class="text-sm text-slate-400">Für dieses Foto gesperrt: {round.locked.map((id) => playerName(view, id)).join(', ')}</p>
        {/if}

        {#if !isLast}
          <button class={round.over ? 'btn-secondary w-full' : 'btn-primary w-full'} disabled={!canNext} onclick={() => client.send({ type: 'still_next' })}>
            {round.over ? `Foto ${round.stage + 2} noch zeigen` : `Nächstes Foto (${round.points[round.stage + 1]} Punkte)`}
          </button>
        {/if}
        <p class="text-xs text-amber-300/80">Der Film: <span class="font-semibold text-slate-200">{round.answer}</span>. Nur du siehst das.</p>
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    <div class="card">
      <h3 class="mb-2 font-bold">Punkte je Foto</h3>
      <ol class="flex flex-wrap gap-2">
        {#each round.points as p, i (i)}
          <li
            class="rounded-xl border px-3 py-1 text-sm {i === round.stage ? 'border-indigo-500 bg-indigo-500/15 font-bold' : i < round.stage ? 'border-slate-800 text-slate-500' : 'border-slate-700'} {readonly ? 'text-lg' : ''}"
          >
            Foto {i + 1}: {p}
          </li>
        {/each}
      </ol>
    </div>

    {#if readonly && isType && !round.over}
      <div class="card">
        <h3 class="mb-2 font-bold">Getippt</h3>
        <ul class="flex flex-wrap gap-2">
          {#each participants as p (p.id)}
            {@const done = round.typed?.includes(p.id)}
            <li class="rounded-full border px-3 py-1 text-lg {done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}">{done ? '✓' : '…'} {p.name}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if !isType && round.locked.length > 0 && !round.over}
      <div class="card">
        <h3 class="mb-2 font-bold">Gesperrt bei diesem Foto</h3>
        <p class="break-words text-sm text-slate-300 {readonly ? 'text-lg' : ''}">{round.locked.map((id) => playerName(view, id)).join(', ')}</p>
      </div>
    {/if}

    {#if !readonly && isParticipant && (round.myGuesses?.length ?? 0) > 0}
      <div class="card">
        <h3 class="mb-2 font-bold">Deine Tipps</h3>
        <ul class="space-y-1 text-sm">
          {#each round.myGuesses ?? [] as g (g.stage)}
            <li class="flex items-center gap-2">
              <span class="w-14 shrink-0 text-xs text-slate-500">Foto {g.stage + 1}</span>
              <span class="min-w-0 flex-1 break-words {g.status === 'correct' ? 'text-emerald-300' : g.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{g.text}</span>
              <span class="text-xs text-slate-500">{g.status === 'judging' ? 'wird geprüft…' : g.status === 'correct' ? 'richtig' : 'falsch'}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </aside>
</div>

{#if canGuess}
  <div aria-hidden="true" style="height:{barHeight}px"></div>
  <div bind:clientHeight={barHeight} class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <form class="mx-auto flex max-w-5xl items-center gap-3" onsubmit={(e) => { e.preventDefault(); submitGuess(); }}>
      <input class="input flex-1" type="text" maxlength={GUESS_MAX_LENGTH} placeholder="Welcher Film?" autocomplete="off" autocapitalize="words" bind:value={text} />
      <button class="btn-primary" type="submit" disabled={text.trim().length === 0}>Tippen</button>
    </form>
  </div>
{/if}
