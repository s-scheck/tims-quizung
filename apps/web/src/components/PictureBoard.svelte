<script lang="ts">
  import { fly } from 'svelte/transition';
  import { GUESS_MAX_LENGTH, type PictureRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import PictureView from './PictureView.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import HostDecision from './HostDecision.svelte';
  import EndCategoryButton from './EndCategoryButton.svelte';
  import LivesList from './LivesList.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: PictureRoundView; readonly?: boolean } = $props();

  const guess = $derived(round.guess);
  const activeName = $derived(playerName(view, round.activePlayerId));
  const activePlayer = $derived(view.players.find((p) => p.id === round.activePlayerId));
  const canGuess = $derived(!readonly && client.isActive && view.phase === 'playing' && !guess);
  const canJudge = $derived(!readonly && client.isHost && guess?.status === 'judging');
  const canSkip = $derived(
    !readonly && client.isHost && !client.isActive && view.phase === 'playing' && !guess && view.settings.timerSeconds === 0,
  );
  const open = $derived(round.fields.filter((f) => !f.solved));
  const solvedCount = $derived(round.fields.length - open.length);
  const fieldById = (id: string | null | undefined) => round.fields.find((f) => f.id === id);
  const numberOf = (id: string | null | undefined) => fieldById(id)?.number ?? '?';

  let selectedId = $state<string | null>(null);
  let text = $state('');

  // Nach dem eigenen Zug die Auswahl vergessen, gelöste Felder sind nicht mehr wählbar.
  $effect(() => {
    if (!canGuess || (selectedId && fieldById(selectedId)?.solved)) selectedId = null;
  });

  function pick(id: string) {
    if (!canGuess) return;
    selectedId = selectedId === id ? null : id;
  }

  function submitGuess() {
    const t = text.trim();
    if (!t || !canGuess || !selectedId) return;
    client.send({ type: 'picture_guess', turnNo: round.turnNo, fieldId: selectedId, text: t });
    text = '';
  }

  function judge(correct: boolean) {
    if (!canJudge) return;
    client.send({ type: 'picture_judge', turnNo: round.turnNo, correct });
  }

  const statusText = $derived.by(() => {
    if (view.phase === 'host_decision') return null;
    if (guess) {
      const who = guess.by === client.myId && !readonly ? 'Du' : playerName(view, guess.by);
      if (guess.status === 'judging') return `${who} tippt bei Nr. ${numberOf(guess.fieldId)}: „${guess.text}“`;
      if (guess.status === 'correct') return `Richtig! Nr. ${numberOf(guess.fieldId)} ist „${guess.text}“`;
      return `Falsch: „${guess.text}“ bei Nr. ${numberOf(guess.fieldId)}`;
    }
    if (!readonly && client.isActive) return 'Du bist dran';
    return `${activeName} ist dran`;
  });

  const hint = $derived.by(() => {
    if (view.phase !== 'playing' || readonly) return '';
    if (guess?.status === 'judging') return client.isHost ? 'Prüfe den Tipp.' : `${playerName(view, view.hostId)} prüft den Tipp…`;
    if (guess) return '';
    if (client.isActive) return selectedId ? 'Schreib unten, was dort fehlt.' : 'Tippe ein Feld im Bild oder eine Nummer an.';
    if (client.isEliminated) return 'Keine Leben mehr. Schau zu, wie es weitergeht.';
    if (client.isHost) return 'Du prüfst jeden Tipp und siehst die Antworten.';
    if (!client.inRound) return 'Du bist ab der nächsten Runde dabei.';
    return '';
  });

  /** Höhe der festen Leiste unten, damit der Inhalt darüber nie verdeckt wird. */
  let barHeight = $state(0);
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="space-y-1">
      <p class="text-sm text-slate-400">{round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
    </header>

    <div class="card flex items-center gap-4 {guess?.status === 'wrong' ? 'animate-shake' : ''}">
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold {guess?.status === 'correct' ? 'text-emerald-300' : guess?.status === 'wrong' ? 'text-rose-300' : ''}">
          {statusText ?? ''}
        </p>
        {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}
        {#if activePlayer && !activePlayer.connected && view.phase === 'playing'}
          <p class="text-sm text-amber-300">{activeName} ist gerade nicht verbunden.</p>
        {/if}
      </div>
      <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
      {#if canSkip}
        <button class="btn-ghost text-xs" onclick={() => client.send({ type: 'skip_turn', turnNo: round.turnNo })}>Zug überspringen</button>
      {/if}
      <EndCategoryButton {view} {readonly} />
    </div>

    {#if view.phase === 'host_decision'}
      <HostDecision {view} {readonly} />
    {/if}

    {#if canJudge && guess}
      <div class="card space-y-3 border-amber-400/40 bg-amber-400/10" in:fly={{ y: 8, duration: 200 }}>
        <p class="font-bold">Tipp von {playerName(view, guess.by)} zu Nr. {numberOf(guess.fieldId)}: „{guess.text}“</p>
        <p class="text-sm text-slate-300">
          Richtige Antwort: <span class="font-semibold text-slate-50">{fieldById(guess.fieldId)?.answer ?? '?'}</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary flex-1 bg-emerald-600 hover:bg-emerald-500" onclick={() => judge(true)}>Richtig</button>
          <button class="btn-danger flex-1" onclick={() => judge(false)}>Falsch</button>
        </div>
      </div>
    {/if}

    <PictureView
      image={round.image}
      original={round.original ?? null}
      fields={round.fields}
      {selectedId}
      pendingId={guess?.status === 'judging' ? guess.fieldId : null}
      flashId={guess?.status === 'correct' ? guess.fieldId : null}
      interactive={canGuess}
      large={readonly}
      onPick={pick}
    />

    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <p class="text-xs font-semibold uppercase tracking-widest text-sky-300">Felder</p>
        <span class="text-xs text-slate-500">{solvedCount} von {round.fields.length} gelöst</span>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each round.fields as f (f.id)}
          {#if f.solved}
            <span class="inline-flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-sm {readonly ? 'text-lg' : ''}">
              <span class="font-mono font-bold">{f.number}</span>
              <span class="break-words">{f.answer}</span>
            </span>
          {:else}
            <button
              type="button"
              class="rounded-xl border-2 px-3 py-1 font-mono text-sm font-bold transition
                {selectedId === f.id ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200' : guess?.fieldId === f.id ? 'border-amber-400 bg-amber-400/10 text-amber-200' : 'border-slate-700 text-slate-300'}
                {canGuess ? 'hover:border-indigo-400' : 'cursor-default'}
                {readonly ? 'text-lg' : ''}"
              disabled={!canGuess}
              onclick={() => pick(f.id)}
            >
              {f.number}{#if round.privileged && f.answer}<span class="ml-1 font-sans text-xs font-medium text-amber-300/80">{f.answer} 🔒</span>{/if}
            </button>
          {/if}
        {/each}
      </div>
      {#if round.privileged}
        <p class="mt-2 text-xs text-amber-300/80">Die Antworten offener Felder siehst nur du als Moderator.</p>
      {/if}
    </div>
  </section>

  <aside class="space-y-4">
    <div class="card">
      <h3 class="mb-3 font-bold">Leben</h3>
      <LivesList {view} {round} {readonly} />
    </div>

    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <h3 class="font-bold">Fehltipps</h3>
        <span class="text-xs text-slate-500">{round.wrongGuesses.length}</span>
      </div>
      {#if round.wrongGuesses.length === 0}
        <p class="text-sm text-slate-500">Noch keine.</p>
      {:else}
        <ul class="flex flex-wrap gap-2">
          {#each round.wrongGuesses as w, i (i)}
            <li class="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-sm text-rose-100 {readonly ? 'text-lg' : ''}">
              <span class="font-mono text-xs text-rose-300/70">Nr. {numberOf(w.fieldId)}</span> {w.text} <span class="text-xs text-rose-300/70">{playerName(view, w.by)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
</div>

{#if canGuess}
  <div aria-hidden="true" style="height:{barHeight}px"></div>
  <div bind:clientHeight={barHeight} class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <form class="mx-auto flex max-w-5xl items-center gap-3" onsubmit={(e) => { e.preventDefault(); submitGuess(); }}>
      <span class="shrink-0 rounded-xl border-2 px-3 py-2 font-mono text-sm font-bold {selectedId ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200' : 'border-slate-700 text-slate-500'}">
        {selectedId ? `Nr. ${numberOf(selectedId)}` : 'Feld?'}
      </span>
      <input
        class="input flex-1"
        type="text"
        maxlength={GUESS_MAX_LENGTH}
        placeholder={selectedId ? 'Was fehlt dort?' : 'Erst ein Feld wählen'}
        autocomplete="off"
        autocapitalize="sentences"
        disabled={!selectedId}
        bind:value={text}
      />
      <button class="btn-primary" type="submit" disabled={!selectedId || text.trim().length === 0}>Tippen</button>
    </form>
  </div>
{/if}
