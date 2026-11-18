<script lang="ts">
  import type { RoomView, SplashRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerColor, playerName } from '../lib/format.ts';
  import { figureById, type Pose } from '../lib/avatar.ts';
  import { FrameClock } from '../lib/frameClock.svelte.ts';
  import GuessBar from './GuessBar.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import EndCategoryButton from './EndCategoryButton.svelte';
  import PlayerHead from './PlayerHead.svelte';
  import SplashField from './visual/SplashField.svelte';
  import AimBar from './visual/AimBar.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: SplashRoundView; readonly?: boolean } = $props();

  const LETTERS = ['A', 'B', 'C', 'D'];
  const me = $derived(readonly ? null : client.myId);
  const isHost = $derived(!readonly && client.isHost);
  const step = $derived(round.step);
  const stage = $derived(step?.stage ?? null);
  const playing = $derived(view.phase === 'playing');
  const answerers = $derived(step?.askedTo ? [step.askedTo] : round.turnOrder);
  const canAnswer = $derived(playing && stage === 'answering' && !!me && answerers.includes(me) && !step?.myAnswer);
  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));

  const clock = new FrameClock();
  $effect(() => clock.start());

  // --------------------------------------------------------------- Zielen

  const shot = $derived(step?.shot ?? null);
  const myShot = $derived(!!me && !!shot && shot.shooter === me && !shot.fired && playing);
  const ready = $derived(!!shot && clock.now >= shot.aimFrom);
  let aimPhase = $state<'power' | 'aim' | 'sent'>('power');
  let power = 0;
  let liveAim = $state<number | null>(null);
  const shotKey = $derived(step && shot ? `${step.no}:${step.shotIndex}` : '');
  $effect(() => {
    void shotKey;
    aimPhase = 'power';
    liveAim = null;
  });

  function stopPower(v: number) {
    power = v;
    aimPhase = 'aim';
  }

  function stopAim(v: number) {
    liveAim = v;
    aimPhase = 'sent';
    client.send({ type: 'splash_shoot', power, aim: v });
  }

  // Figur des Schützen an der Kanone: bereit, gespannt beim Flug, dann Jubel oder Enttäuschung.
  const shooterBlob = $derived.by(() => {
    if (!shot || !step) return null;
    const own = round.blobs.filter((b) => b.owner === shot.shooter && b.firedAt >= step.startedAt);
    return own[own.length - 1] ?? null;
  });
  const shooterPose = $derived.by((): Pose => {
    if (!shot) return 'idle';
    const b = shooterBlob;
    if (!b) return clock.now < shot.aimFrom ? 'wave' : 'idle';
    if (clock.now < b.landAt) return 'still';
    if (!round.options.reactions) return 'idle';
    return b.onField ? 'cheer' : 'sad';
  });
  const shooterFigure = $derived(shot ? { parts: figureById(view, shot.shooter) ?? {}, pose: shooterPose } : null);

  // --------------------------------------------------------------- Texte

  const answeredCount = $derived(step?.answered.length ?? 0);
  function answerText(a: { text?: string; choice?: number }): string {
    if (a.text !== undefined) return a.text;
    if (a.choice !== undefined && step?.choices) return `${LETTERS[a.choice]}: ${step.choices[a.choice]}`;
    return '–';
  }
  const status = $derived.by(() => {
    if (!step) return '';
    if (stage === 'answering') {
      if (step.askedTo) return step.askedTo === me ? 'Du bist dran!' : `${playerName(view, step.askedTo)} antwortet…`;
      return `${answeredCount} von ${answerers.length} haben geantwortet`;
    }
    if (stage === 'judging') return client.isHost && !readonly ? 'Prüfe die Antworten.' : `${playerName(view, view.hostId)} prüft die Antworten…`;
    if (stage === 'shooting' && shot) {
      if (shot.fired) return `${playerName(view, shot.shooter)} hat geschossen!`;
      return shot.shooter === me ? 'Du bist an der Kanone!' : `${playerName(view, shot.shooter)} zielt…`;
    }
    if (stage === 'done') return step.shooters.length === 0 ? 'Niemand lag richtig, kein Schuss.' : 'Alle Schüsse sind gelandet.';
    return '';
  });
  const isLast = $derived(!!step && step.no >= round.totalSteps);
</script>

<div class="{readonly ? 'grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-6' : 'flex flex-col gap-3'}">
  <!-- Feld: am Fernseher links groß, am Handy unter der Frage -->
  <div class={readonly ? 'fit-media' : 'order-2'}>
    <SplashField
      class="mx-auto w-full {readonly ? '' : 'max-w-md'}"
      style={readonly ? 'max-height: calc(80dvh * var(--fit-media, 1)); width: auto; height: calc(80dvh * var(--fit-media, 1))' : undefined}
      blobs={round.blobs}
      {colorOf}
      startedAt={round.startedAt}
      obstacles={round.options.obstacles}
      wind={shot?.wind ?? null}
      shooter={shooterFigure}
      aim={myShot && aimPhase === 'aim' ? liveAim : null}
      countdownUntil={shot && !shot.fired && round.options.countdown ? shot.aimFrom : null}
    />
  </div>

  <div class="space-y-3 {readonly ? 'text-xl' : 'order-1'}">
    {#if step}
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm text-slate-400">{round.category.title} · Frage {step.no} von {round.totalSteps}</p>
          {#if !(myShot && ready)}
            <h2 class="break-words font-black {readonly ? 'text-4xl' : 'text-2xl'}">{step.question}</h2>
          {/if}
        </div>
        {#if stage === 'answering' && round.turnDeadline}
          <TurnTimer deadline={round.turnDeadline} totalSeconds={round.options.answerSeconds} size={readonly ? 72 : 48} />
        {/if}
      </div>

      <p class="flex items-center gap-2 font-semibold text-slate-300">
        {#if step.askedTo && stage === 'answering'}<PlayerHead {view} id={step.askedTo} />{/if}
        {status}
      </p>

      <!-- Antworten -->
      {#if step.choices && (stage === 'answering' || stage === 'done' || stage === 'judging')}
        <div class="grid grid-cols-2 gap-2">
          {#each step.choices as choice, i (i)}
            {@const mine = step.myAnswer?.choice === i}
            {@const right = step.correctChoice === i}
            <button
              class="flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left font-bold transition
                {right ? 'border-emerald-400 bg-emerald-500/15 text-emerald-200' : mine ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200' : 'border-slate-700'}
                {canAnswer ? 'hover:border-slate-400' : 'cursor-default'}"
              disabled={!canAnswer}
              onclick={() => client.send({ type: 'splash_answer', choice: i })}
            >
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 font-black">{LETTERS[i]}</span>
              <span class="min-w-0 break-words">{choice}</span>
            </button>
          {/each}
        </div>
      {:else if !step.choices && step.myAnswer?.text !== undefined && stage === 'answering'}
        <p class="card text-sm">Deine Antwort: <span class="font-bold">{step.myAnswer.text}</span></p>
      {/if}

      {#if stage === 'answering' && !step.askedTo}
        <div class="flex flex-wrap gap-1.5">
          {#each answerers as id (id)}
            {@const done = step.answered.includes(id)}
            <span class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold {done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'} {readonly ? 'text-base' : ''}">
              {done ? '✓ ' : ''}<PlayerHead {view} {id} size={16} />{playerName(view, id)}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Prüfen durch den Host -->
      {#if stage === 'judging' && isHost && step.answers}
        <div class="card space-y-2">
          <p class="text-sm text-slate-400">Lösung: <span class="font-bold text-slate-100">{step.answer}</span></p>
          {#each step.answers as a (a.playerId)}
            <div class="flex items-center gap-2">
              <PlayerHead {view} id={a.playerId} />
              <span class="min-w-0 flex-1 break-words"><span class="font-semibold">{playerName(view, a.playerId)}:</span> {answerText(a)}</span>
              <button class="rounded-lg border px-3 py-1 font-bold {a.correct ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-slate-700 text-slate-500'}" onclick={() => client.send({ type: 'splash_judge', playerId: a.playerId, correct: true })}>✓</button>
              <button class="rounded-lg border px-3 py-1 font-bold {!a.correct ? 'border-rose-400 bg-rose-500/20 text-rose-200' : 'border-slate-700 text-slate-500'}" onclick={() => client.send({ type: 'splash_judge', playerId: a.playerId, correct: false })}>✗</button>
            </div>
          {/each}
          <button class="btn-primary w-full" onclick={() => client.send({ type: 'splash_release' })}>Freigeben, los geht's</button>
        </div>
      {/if}

      <!-- Schützen -->
      {#if (stage === 'shooting' || stage === 'done') && step.shooters.length > 0}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="mr-1 text-xs text-slate-500">Kanone:</span>
          {#each step.shooters as id, i (id)}
            {@const current = stage === 'shooting' && i === step.shotIndex}
            {@const skipped = step.skipped.includes(id)}
            <span
              class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold {readonly ? 'text-base' : ''}
                {current ? 'border-amber-400 bg-amber-400/15 text-amber-100' : i < step.shotIndex || stage === 'done' ? 'border-slate-700 text-slate-400' : 'border-slate-800 text-slate-500'}
                {skipped ? 'line-through opacity-60' : ''}"
            >
              <span class="h-2.5 w-2.5 rounded-full" style="background:{colorOf(id)}"></span>
              <PlayerHead {view} {id} size={16} />{playerName(view, id)}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Zielen am eigenen Handy -->
      {#if myShot}
        <div class="card space-y-3 border-amber-400/50">
          {#if !ready}
            <p class="text-center font-bold text-amber-200">Mach dich bereit …</p>
          {:else if aimPhase === 'power'}
            {#key shotKey}<AimBar kind="power" speed={round.options.speed} onStop={stopPower} />{/key}
          {:else if aimPhase === 'aim'}
            {#key shotKey}<AimBar kind="aim" speed={round.options.speed} onStop={stopAim} onChange={(v) => (liveAim = v)} />{/key}
          {:else}
            <p class="text-center font-bold text-amber-200">Feuer!</p>
          {/if}
        </div>
      {/if}

      <!-- Lösung und Antworten nach der Frage -->
      {#if stage === 'done'}
        <div class="card space-y-2">
          <p>Richtig: <span class="font-black text-emerald-300">{step.answer}</span></p>
          {#if step.answers && step.answers.length > 0}
            <ul class="space-y-1 text-sm">
              {#each step.answers as a (a.playerId)}
                <li class="flex items-center gap-2 {a.correct ? 'text-emerald-200' : 'text-slate-400'}">
                  <span class="w-4 font-bold">{a.correct ? '✓' : '✗'}</span>
                  <PlayerHead {view} id={a.playerId} size={18} />
                  <span class="min-w-0 break-words"><span class="font-semibold">{playerName(view, a.playerId)}:</span> {answerText(a)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      <!-- Host-Leiste -->
      {#if isHost && playing}
        <div class="flex flex-wrap gap-2">
          {#if stage === 'answering'}
            <button class="btn-secondary flex-1" onclick={() => client.send({ type: 'splash_close' })}>Frage schließen</button>
          {:else if stage === 'shooting' && shot && !shot.fired}
            <button class="btn-secondary flex-1" onclick={() => client.send({ type: 'splash_skip' })}>Schuss von {playerName(view, shot.shooter)} überspringen</button>
          {:else if stage === 'done'}
            <button class="btn-primary flex-1 text-lg" onclick={() => client.send({ type: 'splash_next' })}>{isLast ? 'Zur Auswertung' : 'Nächste Frage'}</button>
          {/if}
        </div>
        <EndCategoryButton {view} label="Runde beenden" title="Die Fläche wird sofort ausgewertet." />
      {/if}
    {/if}
  </div>
</div>

{#if canAnswer && step && !step.choices}
  <GuessBar placeholder="Deine Antwort" submitLabel="Antworten" onSubmit={(text) => client.send({ type: 'splash_answer', text })} />
{/if}
