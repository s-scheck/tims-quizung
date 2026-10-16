<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { MORSE_SPEEDS, type MorseRoundView, type MorseSpeed, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { toasts } from '../lib/toast.svelte.ts';
  import { MorsePlayer } from '../lib/morseAudio.ts';
  import MorseTable from './MorseTable.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: MorseRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isHost = $derived(!readonly && client.isHost);
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const playingPhase = $derived(view.phase === 'playing');
  const mySolved = $derived(round.solved.find((s) => s.playerId === client.myId) ?? null);
  const canGuess = $derived(isParticipant && playingPhase && !mySolved);
  const myAttempts = $derived(round.myAttempts ?? []);
  const pretty = (code: string) => code.replace(/\./g, '·').replace(/-/g, '−');
  const speedLabels: Record<MorseSpeed, string> = { slow: 'langsam', medium: 'mittel', fast: 'schnell' };
  const solvedBy = (id: string) => round.solved.find((s) => s.playerId === id) ?? null;
  const seconds = (at: number) => ((at - round.startedAt) / 1000).toFixed(1);

  let guess = $state('');
  let speed = $state<MorseSpeed>('medium');
  let lightOn = $state(false);
  let isPlaying = $state(false);
  let confirmingEnd = $state(false);
  let tableOpen = $state(true);
  let lastPlaybackId: number | null = null;

  const player = new MorsePlayer(
    (on) => {
      lightOn = on;
    },
    () => {
      isPlaying = false;
    },
  );
  onDestroy(() => player.dispose());

  // Jede neue Wiedergabe vom Server startet hier den Zeitplan, synchron über die Serveruhr.
  $effect(() => {
    const pb = round.playback;
    const id = pb?.id ?? null;
    untrack(() => {
      if (!pb) {
        if (lastPlaybackId !== null) {
          player.stop();
          isPlaying = false;
          lastPlaybackId = null;
        }
        return;
      }
      if (id === lastPlaybackId) return;
      lastPlaybackId = id;
      isPlaying = true;
      player.schedule(pb.beeps, pb.startAt - client.serverNow(), isHost);
    });
  });

  async function play() {
    if (!isHost || !playingPhase) return;
    const audio = await player.prepareAudio();
    if (!audio.ok) toasts.error(`Der Browser lässt gerade keinen Ton zu (${audio.state}). Nochmal auf Play tippen hilft meist. Das Licht läuft trotzdem.`);
    client.send({ type: 'morse_play', speed });
  }

  function stop() {
    player.stop();
    isPlaying = false;
    client.send({ type: 'morse_stop' });
  }

  function submitGuess() {
    const text = guess.trim();
    if (!text || !canGuess) return;
    client.send({ type: 'morse_guess', text });
    guess = '';
  }

  function endRound() {
    if (!isHost || !playingPhase) return;
    const allSolved = participants.length > 0 && participants.every((p) => round.solved.some((s) => s.playerId === p.id));
    if (!allSolved && !confirmingEnd) {
      confirmingEnd = true;
      setTimeout(() => (confirmingEnd = false), 3500);
      return;
    }
    confirmingEnd = false;
    player.stop();
    client.send({ type: 'end_round' });
  }

  /** Das Licht sehen alle, sobald der Host es zuschaltet. Der Host sieht es immer, als Kontrolle. */
  const showLightPanel = $derived(isHost || round.lightShown);
  const lit = $derived(lightOn && (isHost || round.lightShown));
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <p class="text-sm text-slate-400">Morse · Runde {view.rounds.length + 1}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">Was wird gemorst?</h2>
    </div>
    <div class="flex items-center gap-2">
      {#if isPlaying}
        <span class="badge animate-pulse bg-amber-500/20 text-amber-200">Wiedergabe läuft</span>
      {/if}
      <span class="badge">{round.plays} {round.plays === 1 ? 'Wiedergabe' : 'Wiedergaben'}</span>
      {#if isHost && playingPhase}
        <button class="{confirmingEnd ? 'btn-danger' : 'btn-secondary'}" onclick={endRound}>
          {confirmingEnd ? `Wirklich? ${round.solved.length} von ${participants.length} gelöst` : 'Runde beenden'}
        </button>
      {/if}
    </div>
  </header>

  <!-- Wortstruktur -->
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
    {#each round.lengths as len, wi (wi)}
      <div class="flex gap-1">
        {#each Array.from({ length: len }) as _, i (i)}
          <span class="h-8 w-6 rounded border-b-4 border-slate-600 bg-slate-900/60 {readonly ? 'h-12 w-9' : ''}"></span>
        {/each}
      </div>
    {/each}
    <span class="text-xs text-slate-500">{round.lengths.reduce((a, b) => a + b, 0)} Zeichen{round.lengths.length > 1 ? `, ${round.lengths.length} Wörter` : ''}</span>
  </div>

  <!-- Licht: bei allen, sobald der Host es zuschaltet -->
  {#if showLightPanel}
    <div
      class="flex items-center justify-center rounded-2xl border-2 transition-colors duration-75
        {readonly ? 'h-56' : 'h-32'}
        {lit ? 'border-yellow-200 bg-yellow-300 shadow-[0_0_80px_rgba(253,224,71,0.9)]' : 'border-slate-700 bg-slate-950'}"
      aria-label="Morselicht"
    >
      <span class="text-sm {lit ? 'text-slate-900' : 'text-slate-600'}">
        {#if isHost && !round.lightShown}Licht nur hier sichtbar, für die anderen aus{:else if isPlaying}Licht läuft{:else}Licht bereit{/if}
      </span>
    </div>
  {/if}

  <!-- Löser -->
  <div class="card flex flex-wrap items-center gap-2 py-2">
    <span class="mr-1 text-sm text-slate-400">{round.solved.length} von {participants.length} gelöst</span>
    {#each participants as p (p.id)}
      {@const s = solvedBy(p.id)}
      <span class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {s ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'} {readonly ? 'text-base' : ''}">
        {s ? `${s.rank}. ✓ ` : ''}{p.name}{p.id === client.myId ? ' (du)' : ''}{s ? ` · ${seconds(s.at)} s` : ''}
      </span>
    {/each}
  </div>

  {#if isHost}
    <!-- Host-Steuerung -->
    <div class="card space-y-4 border-amber-400/40 bg-amber-400/10">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-amber-300">Dein Wort · nur du siehst es</p>
        <p class="text-2xl font-black">{round.word}</p>
        <p class="font-mono text-lg tracking-widest text-amber-100">{pretty(round.code ?? '')}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#if isPlaying}
          <button class="btn-danger" onclick={stop}>■ Stopp</button>
        {:else}
          <button class="btn-primary" onclick={play} disabled={!playingPhase}>▶ Ton abspielen</button>
        {/if}
        <div class="flex rounded-xl border border-slate-700 p-0.5">
          {#each Object.keys(MORSE_SPEEDS) as s (s)}
            <button
              class="rounded-lg px-3 py-1.5 text-sm font-semibold transition {speed === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}"
              onclick={() => (speed = s as MorseSpeed)}
            >
              {speedLabels[s as MorseSpeed]}
            </button>
          {/each}
        </div>
        <button class="rounded-xl border px-3 py-2 text-sm font-semibold transition {round.lightShown ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-100' : 'border-slate-700 text-slate-400'}" onclick={() => client.send({ type: 'morse_show_light', shown: !round.lightShown })}>
          Licht {round.lightShown ? 'für alle an' : 'für alle aus'}
        </button>
        <button class="rounded-xl border px-3 py-2 text-sm font-semibold transition {round.codeShown ? 'border-sky-400/60 bg-sky-400/15 text-sky-100' : 'border-slate-700 text-slate-400'}" onclick={() => client.send({ type: 'morse_show_code', shown: !round.codeShown })}>
          Code {round.codeShown ? 'sichtbar' : 'zeigen'}
        </button>
        <button class="rounded-xl border px-3 py-2 text-sm font-semibold transition {round.tableShown ? 'border-sky-400/60 bg-sky-400/15 text-sky-100' : 'border-slate-700 text-slate-400'}" onclick={() => client.send({ type: 'morse_show_table', shown: !round.tableShown })}>
          Tabelle {round.tableShown ? 'freigegeben' : 'freigeben'}
        </button>
      </div>
      <p class="text-xs text-slate-400">Der Ton kommt nur aus deinem Gerät. Das Licht blinkt bei allen mit, sobald du es zuschaltest.</p>
    </div>

    <!-- Versuche live -->
    <div class="card space-y-3">
      <h3 class="font-bold">Versuche</h3>
      {#each participants as p (p.id)}
        {@const attempts = round.attempts?.[p.id] ?? []}
        {@const s = solvedBy(p.id)}
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold">{p.name}</span>
            <span class="text-xs {s ? 'text-emerald-300' : 'text-slate-500'}">{s ? `${s.rank}. Platz nach ${seconds(s.at)} s` : attempts.length === 0 ? 'noch kein Versuch' : `${attempts.length} ${attempts.length === 1 ? 'Versuch' : 'Versuche'}`}</span>
          </div>
          {#if attempts.length > 0}
            <ul class="mt-1.5 flex flex-wrap gap-1.5">
              {#each attempts as a, i (i)}
                <li class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs {a.correct ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'}">
                  <span class="font-mono">{seconds(a.at)} s</span>
                  <span class="font-semibold">{a.text}</span>
                  {#if !a.correct && !s && playingPhase}
                    <button class="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500" onclick={() => client.send({ type: 'morse_accept', playerId: p.id, index: i })}>zählt</button>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>
  {:else if isParticipant}
    {#if mySolved}
      <div class="card border-emerald-500/50 bg-emerald-500/10" in:fly={{ y: 8, duration: 250 }}>
        <p class="text-lg font-bold text-emerald-200">Richtig! Du bist {mySolved.rank}. nach {seconds(mySolved.at)} s.</p>
        <p class="text-sm text-slate-300">Warte, bis der Host die Runde beendet.</p>
      </div>
    {:else if playingPhase}
      <form class="card space-y-2" onsubmit={(e) => { e.preventDefault(); submitGuess(); }}>
        <label class="block">
          <span class="mb-1 block text-sm text-slate-400">Dein Tipp</span>
          <div class="flex gap-2">
            <input class="input flex-1 uppercase tracking-wider" type="text" maxlength="40" autocomplete="off" autocapitalize="characters" placeholder="Was wurde gemorst?" bind:value={guess} />
            <button class="btn-primary" type="submit" disabled={guess.trim().length === 0}>Raten</button>
          </div>
        </label>
        <p class="text-xs text-slate-500">So oft du willst. Groß- und Kleinschreibung und Leerzeichen sind egal, Umlaute werden zu AE, OE, UE.</p>
      </form>
    {/if}
    {#if myAttempts.length > 0}
      <div class="card">
        <p class="mb-1.5 text-xs font-semibold uppercase tracking-widest text-slate-400">Deine Versuche</p>
        <ul class="flex flex-wrap gap-1.5">
          {#each myAttempts as a, i (i)}
            <li class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {a.correct ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-100'}">
              {a.correct ? '✓' : '✗'} {a.text} <span class="font-mono text-slate-400">{seconds(a.at)} s</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else if !readonly}
    <p class="text-sm text-slate-400">Du bist ab der nächsten Runde dabei.</p>
  {/if}

  {#if round.codeShown && round.code && !isHost}
    <div class="card border-sky-400/40 bg-sky-400/10" in:fly={{ y: 8, duration: 250 }}>
      <p class="text-xs font-semibold uppercase tracking-widest text-sky-300">Morsecode</p>
      <p class="mt-1 font-mono text-2xl tracking-[0.3em] {readonly ? 'text-4xl' : ''}">{pretty(round.code)}</p>
    </div>
  {/if}

  {#if round.tableShown && !isHost}
    <div class="card space-y-2">
      <button class="flex w-full items-center justify-between text-left" onclick={() => (tableOpen = !tableOpen)}>
        <span class="font-bold">Morsetabelle</span>
        <span class="text-xs text-slate-500">{tableOpen ? 'einklappen' : 'aufklappen'}</span>
      </button>
      {#if tableOpen}<MorseTable large={readonly} />{/if}
    </div>
  {/if}
</div>
