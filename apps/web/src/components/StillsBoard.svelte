<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { RoomView, StillsRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { toasts } from '../lib/toast.svelte.ts';
  import { BuzzerPlayer } from '../lib/buzzer.ts';
  import GuessBar from './GuessBar.svelte';
  import StillsGallery from './StillsGallery.svelte';
  import TurnTimer from './TurnTimer.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: StillsRoundView; readonly?: boolean } = $props();

  const isHost = $derived(!readonly && client.isHost);
  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const playing = $derived(view.phase === 'playing');
  const total = $derived(round.stagePoints.length);
  const isLast = $derived(round.index >= total - 1);
  const isType = $derived(round.mode === 'type');
  /** Alle raten bis zum Schluss: ein Versuch pro Film, Treffer beenden das Raten nur für sich. */
  const allGuess = $derived(round.allGuess);
  const myResult = $derived(round.results.find((x) => x.playerId === client.myId) ?? null);
  /** Fertig vor dem aktuellen Foto: Diese Spieler raten in diesem Film nicht mehr. */
  const doneBefore = (id: string) => round.results.some((x) => x.playerId === id && x.index < round.index);

  // ------------------------------------------------------------ Fotos

  /** Angetipptes früheres Foto, sonst das aktuelle. Springt bei jedem neuen Foto zurück. */
  let picked = $state<number | null>(null);
  $effect(() => {
    void round.index;
    picked = null;
  });
  const shownIndex = $derived(picked ?? round.index);
  const released = $derived(round.images.slice(0, round.index + 1));

  // ------------------------------------------------------------ Tippen

  const myAttempt = $derived(round.myAttempts?.find((a) => a.index === round.index) ?? null);
  /** Mit `allGuess` der eine Tipp im Film, egal zu welchem Foto. */
  const myFilmAttempt = $derived(allGuess ? (round.myAttempts?.[0] ?? null) : null);
  const guessOpen = $derived(isParticipant && playing && isType && !round.over && round.stage === 'guessing' && !myAttempt && !myFilmAttempt);
  const canGuess = $derived(guessOpen && !round.iPassed);
  const attemptsNow = $derived(
    participants
      .map((p) => ({ player: p, attempt: round.attempts?.[p.id]?.find((a) => a.index === round.index) ?? null }))
      // Mit `allGuess` stehen nur die in der Prüfliste, die zu diesem Foto getippt haben.
      .filter((s) => !allGuess || s.attempt),
  );
  const allJudged = $derived(attemptsNow.every((s) => !s.attempt || s.attempt.status !== 'judging'));

  // ------------------------------------------------------------ Buzzern

  const buzzer = $derived(round.buzzer ?? { holder: null, deadline: null, used: [] });
  const holdsBuzzer = $derived(buzzer.holder !== null && buzzer.holder === client.myId);
  const usedByMe = $derived(!!client.myId && buzzer.used.includes(client.myId));
  const hitByMe = $derived(allGuess && !!myResult?.correct);
  const buzzVisible = $derived(isParticipant && playing && !isType && !round.over);
  const canBuzz = $derived(buzzVisible && buzzer.holder === null && !usedByMe && !hitByMe);

  // Ton am Host-Gerät: Der Browser spielt erst nach einer Nutzergeste, deshalb schaltet der Host ihn einmal ein.
  const sound = new BuzzerPlayer();
  let soundReady = $state(false);
  onDestroy(() => sound.dispose());

  async function enableSound() {
    const audio = await sound.prepareAudio();
    soundReady = audio.ok;
    if (!audio.ok) toasts.error(`Der Browser lässt gerade keinen Ton zu (${audio.state}). Nochmal tippen hilft meist. Der Name erscheint trotzdem groß.`);
  }

  // Neuer Buzz: Ton am Host-Gerät, Vibration beim Buzzernden.
  let lastBuzz = '';
  $effect(() => {
    const key = buzzer.holder ? `${buzzer.holder}:${buzzer.deadline}` : '';
    if (key === lastBuzz) return;
    lastBuzz = key;
    if (!buzzer.holder || readonly) return;
    if (isHost) sound.play();
    if (holdsBuzzer) navigator.vibrate?.(200);
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

  const canNext = $derived(isHost && playing && !isLast && (round.over || (isType ? round.stage === 'judging' && allJudged : buzzer.holder === null)));

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (isHost) {
      if (round.over) return isLast ? 'Das Raten ist vorbei. Löse auf, wenn alle so weit sind.' : 'Das Raten ist vorbei. Du kannst die übrigen Fotos noch zeigen oder gleich auflösen.';
      if (isType && allGuess && round.stage === 'guessing') return 'Wer noch nicht fertig ist, tippt einmal für den ganzen Film oder passt. Schließe die Tipps, wenn alle so weit sind.';
      if (isType) return round.stage === 'guessing' ? 'Alle tippen einmal zu diesem Foto. Schließe die Tipps, wenn alle so weit sind.' : 'Prüfe jeden Tipp. Danach geht es zum nächsten Foto.';
      return buzzer.holder !== null ? 'Hör dir die Antwort an und urteile.' : 'Warte auf den ersten Buzzer oder zeig das nächste Foto.';
    }
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (round.over) return '';
    if (allGuess && isType) {
      if (myFilmAttempt?.status === 'correct') return 'Richtig! Du bist für diesen Film fertig, die anderen raten noch.';
      if (myFilmAttempt?.status === 'wrong') return 'Leider falsch. Das war dein einziger Tipp für diesen Film.';
      if (myFilmAttempt) return 'Tipp abgegeben, das war dein einziger für diesen Film. Der Host prüft nach diesem Foto.';
      if (round.stage === 'judging') return 'Die Tipps zu diesem Foto sind geschlossen. Beim nächsten Foto darfst du wieder.';
      if (round.iPassed) return 'Gepasst. Du wartest aufs nächste Foto, dein Tipp bleibt dir.';
      return 'Aus welchem Film ist das? Du hast einen Tipp für den ganzen Film, je früher, desto mehr Punkte. Unsicher? Dann passen.';
    }
    if (allGuess) {
      if (holdsBuzzer) return 'Du bist dran! Sag den Film laut.';
      if (hitByMe) return 'Richtig! Du bist für diesen Film fertig, die anderen raten noch.';
      if (usedByMe) return 'Falsch. Das war dein einziger Buzz für diesen Film.';
      return 'Erkannt? Buzzer drücken und den Film laut sagen. Du hast einen Buzz für den ganzen Film.';
    }
    if (isType) {
      if (myAttempt?.status === 'wrong') return 'Leider falsch. Beim nächsten Foto darfst du wieder tippen.';
      if (myAttempt?.status === 'correct') return 'Richtig! Warte, bis der Host alle Tipps geprüft hat.';
      if (myAttempt) return 'Tipp abgegeben. Der Host prüft nach diesem Foto.';
      if (round.stage === 'judging') return 'Die Tipps zu diesem Foto sind geschlossen. Beim nächsten Foto darfst du wieder.';
      return 'Aus welchem Film ist das? Du hast einen Tipp pro Foto.';
    }
    if (holdsBuzzer) return 'Du bist dran! Sag den Film laut.';
    if (usedByMe) return 'Falsch. Beim nächsten Foto darfst du wieder buzzern.';
    return 'Erkannt? Buzzer drücken und den Film laut sagen.';
  });
</script>

{#snippet typedPills(size: string)}
  <ul class="flex flex-wrap gap-2 {size}">
    {#each participants as p (p.id)}
      {@const done = round.typed?.includes(p.id)}
      {@const passed = round.passed?.includes(p.id)}
      {#if allGuess && doneBefore(p.id)}
        <li class="rounded-full border border-slate-800 px-3 py-1 text-slate-600">fertig · {p.name}</li>
      {:else if passed}
        <li class="rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-sky-200">gepasst · {p.name}</li>
      {:else}
        <li class="rounded-full border px-3 py-1 {done ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}">{done ? '✓' : '…'} {p.name}</li>
      {/if}
    {/each}
  </ul>
{/snippet}

{#snippet resultList(size: string)}
  <ul class="space-y-1 {size}">
    {#each round.results as x (x.playerId)}
      <li class="flex items-center gap-2 {x.playerId === client.myId ? 'text-indigo-200' : ''}">
        <span class="w-5 shrink-0 font-bold {x.correct ? 'text-emerald-300' : 'text-rose-300'}">{x.correct ? '✓' : '✗'}</span>
        <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, x.playerId)}</span>
        <span class="shrink-0 text-xs text-slate-400">Foto {x.index + 1}{x.correct ? ` · ${round.stagePoints[x.index] ?? 0} Punkte` : ''}</span>
      </li>
    {/each}
  </ul>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm text-slate-400">{round.category.title} · {isType ? 'Tippen' : 'Buzzern'}{allGuess ? ' · alle raten' : ''} · Foto {round.index + 1} von {total}</p>
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
        {#if allGuess}
          <p class="text-sm text-emerald-300">Das Raten ist vorbei. Es war:</p>
          <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{round.answer}</p>
          {#if round.results.length > 0}
            <div class="mt-2">{@render resultList(readonly ? 'text-lg' : 'text-sm')}</div>
          {:else}
            <p class="mt-1 text-sm text-slate-300">Niemand hat geraten.</p>
          {/if}
        {:else if round.solved}
          <p class="text-sm text-emerald-300">Erkannt bei Foto {round.solved.index + 1} · {round.stagePoints[round.solved.index]} Punkte</p>
          <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{round.answer}</p>
          <p class="mt-1 break-words">{round.solved.winners.map((id) => playerName(view, id)).join(', ')}</p>
        {:else}
          <p class="text-sm text-slate-300">Niemand hat es erkannt. Es war:</p>
          <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{round.answer}</p>
        {/if}
      </div>
    {/if}

    {#if buzzer.holder !== null}
      <div class="card flex items-center gap-4 border-amber-500/60 bg-amber-500/15">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-amber-300">Gebuzzert</p>
          <p class="break-words text-3xl font-black {readonly ? 'text-5xl' : ''}">{playerName(view, buzzer.holder)}</p>
        </div>
        <TurnTimer deadline={buzzer.deadline} totalSeconds={round.thinkSeconds} size={readonly ? 80 : 56} />
      </div>
      {#if isHost}
        <div class="grid grid-cols-2 gap-3">
          <button class="btn-primary bg-emerald-600 py-4 text-lg hover:bg-emerald-500" onclick={() => client.send({ type: 'still_verdict', correct: true })}>Richtig</button>
          <button class="btn-danger py-4 text-lg" onclick={() => client.send({ type: 'still_verdict', correct: false })}>Falsch</button>
        </div>
      {/if}
    {/if}

    {#if allGuess && !round.over && !isHost && !readonly && round.answer}
      <div class="card border-emerald-500/40 bg-emerald-500/10">
        <p class="text-sm text-emerald-300">Du hast es erkannt</p>
        <p class="break-words text-xl font-black">{round.answer}</p>
        <p class="text-xs text-slate-400">Nicht verraten, die anderen raten noch.</p>
      </div>
    {/if}

    <StillsGallery images={released} stagePoints={round.stagePoints} {shownIndex} large={readonly} overlay onPick={(i) => (picked = i === round.index ? null : i)} />

    {#if buzzVisible}
      <button
        class="w-full rounded-3xl py-10 text-4xl font-black uppercase tracking-wider shadow-lg transition active:scale-95
          {canBuzz ? 'bg-rose-600 text-white hover:bg-rose-500' : 'cursor-not-allowed bg-slate-800 text-slate-500'}"
        disabled={!canBuzz}
        onclick={() => client.send({ type: 'still_buzz' })}
      >
        {hitByMe ? 'Erkannt' : usedByMe ? 'Gesperrt' : holdsBuzzer ? 'Du bist dran' : buzzer.holder !== null ? 'Besetzt' : 'Buzzer'}
      </button>
    {/if}

    {#if guessOpen && round.iPassed}
      <div class="card flex flex-wrap items-center justify-between gap-3 border-sky-500/40 bg-sky-500/10">
        <p class="text-sm text-sky-200">Gepasst. Bis der Host die Tipps schließt, kannst du doch noch tippen.</p>
        <button class="btn-secondary" onclick={() => client.send({ type: 'still_pass', pass: false })}>Doch tippen</button>
      </div>
    {/if}

    {#if isHost}
      <div class="card space-y-3">
        <!-- Nach dem Lösen bleibt die Prüfliste stehen, bis weitergeschaltet wird: Urteile lassen sich noch korrigieren. -->
        {#if isType && (!round.over || attemptsNow.some((s) => s.attempt))}
          {#if round.stage === 'guessing'}
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="font-bold">Tipps zu Foto {round.index + 1}</h3>
              {#if allGuess}
                <span class="text-xs text-slate-500">
                  {round.typed?.length ?? 0} getippt · {round.passed?.length ?? 0} gepasst · {participants.filter((p) => !doneBefore(p.id)).length} raten noch
                </span>
              {:else}
                <span class="text-xs text-slate-500">{round.typed?.length ?? 0} von {participants.length}</span>
              {/if}
            </div>
            {@render typedPills('text-sm')}
            <button class="btn-primary w-full" onclick={() => client.send({ type: 'still_close' })}>Tipps schließen</button>
          {:else}
            <h3 class="font-bold">Tipps zu Foto {round.index + 1} prüfen</h3>
            <ul class="space-y-2">
              {#each attemptsNow as { player, attempt } (player.id)}
                <li class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 px-3 py-2 text-sm">
                  <span class="font-semibold">{player.name}</span>
                  {#if !attempt}
                    <span class="text-slate-500">kein Tipp</span>
                  {:else}
                    <span class="min-w-0 break-words {attempt.status === 'correct' ? 'text-emerald-300' : attempt.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{attempt.text}</span>
                    {#if attempt.suggested && attempt.status === 'judging'}<span class="rounded-full bg-emerald-500/20 px-2 text-[10px] font-bold text-emerald-300">sieht richtig aus</span>{/if}
                    <span class="ml-auto flex gap-1">
                      <button
                        class="rounded-full px-2 py-0.5 text-[10px] font-bold {attempt.status === 'correct' ? 'bg-emerald-500 text-white' : 'bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600'}"
                        onclick={() => client.send({ type: 'still_judge', playerId: player.id, correct: true })}>richtig</button
                      >
                      <button
                        class="rounded-full px-2 py-0.5 text-[10px] font-bold {attempt.status === 'wrong' ? 'bg-rose-500 text-white' : 'bg-rose-600/30 text-rose-200 hover:bg-rose-600'}"
                        onclick={() => client.send({ type: 'still_judge', playerId: player.id, correct: false })}>falsch</button
                      >
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
            {#if !allJudged}<p class="text-xs text-slate-500">Erst alle Tipps prüfen, dann geht es weiter.</p>{/if}
          {/if}
        {:else if !round.over && buzzer.used.length > 0}
          <p class="text-sm text-slate-400">Für {allGuess ? 'diesen Film' : 'dieses Foto'} gesperrt: {buzzer.used.map((id) => playerName(view, id)).join(', ')}</p>
        {/if}

        {#if !isType && playing && !soundReady}
          <button class="btn-secondary w-full" onclick={enableSound}>Buzzer-Ton einschalten</button>
          <p class="text-xs text-slate-500">Einmal antippen, dann tönt dein Gerät bei jedem Buzzer.</p>
        {/if}

        {#if !isLast}
          <button class={round.over ? 'btn-secondary w-full' : 'btn-primary w-full'} disabled={!canNext} onclick={() => client.send({ type: 'still_next' })}>
            {round.over ? `Foto ${round.index + 2} noch zeigen` : `Nächstes Foto (${round.stagePoints[round.index + 1]} Punkte)`}
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
        {#each round.stagePoints as p, i (i)}
          <li
            class="rounded-xl border px-3 py-1 text-sm {i === round.index ? 'border-indigo-500 bg-indigo-500/15 font-bold' : i < round.index ? 'border-slate-800 text-slate-500' : 'border-slate-700'} {readonly ? 'text-lg' : ''}"
          >
            Foto {i + 1}: {p}
          </li>
        {/each}
      </ol>
    </div>

    {#if allGuess && !round.over}
      <div class="card">
        <h3 class="mb-2 font-bold">Schon fertig</h3>
        {#if round.results.length > 0}
          {@render resultList(readonly ? 'text-lg' : 'text-sm')}
        {:else}
          <p class="text-sm text-slate-500">Noch niemand.</p>
        {/if}
      </div>
    {/if}

    {#if readonly && isType && !round.over}
      <div class="card">
        <h3 class="mb-2 font-bold">Getippt</h3>
        {@render typedPills('text-lg')}
      </div>
    {/if}

    {#if !isType && buzzer.used.length > 0 && !round.over}
      <div class="card">
        <h3 class="mb-2 font-bold">Gesperrt {allGuess ? 'für diesen Film' : 'bei diesem Foto'}</h3>
        <p class="break-words text-sm text-slate-300 {readonly ? 'text-lg' : ''}">{buzzer.used.map((id) => playerName(view, id)).join(', ')}</p>
      </div>
    {/if}

    {#if !readonly && isParticipant && (round.myAttempts?.length ?? 0) > 0}
      <div class="card">
        <h3 class="mb-2 font-bold">Deine Tipps</h3>
        <ul class="space-y-1 text-sm">
          {#each round.myAttempts ?? [] as a (a.index)}
            <li class="flex items-center gap-2">
              <span class="w-14 shrink-0 text-xs text-slate-500">Foto {a.index + 1}</span>
              <span class="min-w-0 flex-1 break-words {a.status === 'correct' ? 'text-emerald-300' : a.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{a.text}</span>
              <span class="text-xs text-slate-500">{a.status === 'judging' ? 'wird geprüft…' : a.status === 'correct' ? 'richtig' : 'falsch'}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </aside>
</div>

{#if canGuess}
  <GuessBar
    placeholder="Welcher Film?"
    submitLabel="Tippen"
    onSubmit={(text) => client.send({ type: 'still_guess', text })}
    {...allGuess ? { secondaryLabel: 'Passen', onSecondary: () => client.send({ type: 'still_pass', pass: true }) } : {}}
  />
{/if}
