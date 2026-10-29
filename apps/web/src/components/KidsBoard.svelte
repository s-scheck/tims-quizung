<script lang="ts">
  import { GUESS_MAX_LENGTH, type FaceEffectState, type KidsRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import FaceImage from './FaceImage.svelte';
  import TurnTimer from './TurnTimer.svelte';

  /** Kinderpromis: Der Host zeigt einen Promi nach dem anderen, alle tippen um die Wette oder buzzern. */
  let { view, round, readonly = false }: { view: RoomView; round: KidsRoundView; readonly?: boolean } = $props();

  /** Das Foto erscheint ohne Effekt, die Schwierigkeit ist das Erkennen. */
  const CLEAR: FaceEffectState = { effect: 'blur', level: 0, cols: 6, revealed: [] };

  const isHost = $derived(!readonly && client.isHost);
  const me = $derived(client.myId);
  const playing = $derived(view.phase === 'playing');
  const participants = $derived(round.turnOrder.map((id) => ({ id, name: playerName(view, id) })));
  const isParticipant = $derived(!readonly && me !== null && round.turnOrder.includes(me));
  const typing = $derived(round.mode === 'type');
  const modeName = $derived(typing ? 'Tippen' : 'Buzzern');
  const shownAt = $derived(round.shownAt ?? 0);
  const seconds = (at: number) => ((at - shownAt) / 1000).toFixed(1);
  const mySolved = $derived(round.solved.find((s) => s.playerId === me) ?? null);
  const solvedIds = $derived(new Set(round.solved.map((s) => s.playerId)));
  const canGuess = $derived(isParticipant && playing && typing && round.stage === 'open' && !mySolved);
  const buzzer = $derived(round.buzzer ?? { holder: null, deadline: null, used: [] });
  const usedByMe = $derived(me !== null && buzzer.used.includes(me));
  const holdsBuzzer = $derived(buzzer.holder !== null && buzzer.holder === me);
  const canBuzz = $derived(isParticipant && playing && !typing && round.stage === 'open' && buzzer.holder === null && !usedByMe);
  const isLast = $derived(round.index + 1 >= round.total);
  const ranking = $derived(
    participants
      .map((p) => ({ ...p, points: round.points[p.id] ?? 0, hits: round.hits[p.id] ?? 0, misses: round.misses[p.id] ?? 0 }))
      .sort((a, b) => b.points - a.points || b.hits - a.hits),
  );
  const pendingCount = $derived(Object.values(round.attempts ?? {}).flat().filter((a) => a.status === 'judging').length);

  // ------------------------------------------------------------ Host

  let confirmingEnd = $state(false);

  function endRound() {
    if (!isHost) return;
    if (!confirmingEnd) {
      confirmingEnd = true;
      setTimeout(() => (confirmingEnd = false), 3500);
      return;
    }
    confirmingEnd = false;
    client.send({ type: 'end_round' });
  }

  // ------------------------------------------------------------ Spieler

  let text = $state('');
  let barHeight = $state(0);

  function submitGuess() {
    const t = text.trim();
    if (!t || !canGuess) return;
    client.send({ type: 'kids_guess', text: t });
    text = '';
  }

  const statusText = $derived.by(() => {
    if (round.total === 0) return 'Kein Promi gezeigt';
    if (round.stage === 'hidden') return `Promi ${round.index + 1} von ${round.total} kommt gleich`;
    if (round.stage === 'solved') return round.name ?? 'Aufgelöst';
    if (!typing && buzzer.holder !== null) return `${playerName(view, buzzer.holder)} hat gebuzzert`;
    if (!typing) return 'Buzzer frei';
    return `${round.solved.length} von ${participants.length} haben es`;
  });

  const hint = $derived.by(() => {
    if (readonly || !playing) return '';
    if (isHost) {
      if (round.stage === 'hidden') return 'Du moderierst: Zeige den Promi, wenn alle bereit sind.';
      if (round.stage === 'open') return typing ? 'Treffer zählen sofort. Tipps, die nicht passen, prüfst du unten.' : 'Wer buzzert, sagt den Namen laut. Du wertest mit Richtig oder Falsch.';
      return isLast ? 'Letzter Promi. Weiter zur Auflösung der Runde.' : 'Aufgelöst. Weiter zum nächsten Promi.';
    }
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (round.stage === 'hidden') return 'Gleich zeigt der Host das Foto.';
    if (round.stage === 'solved') return 'Warte, bis der Host weitergeht.';
    if (typing) return mySolved ? `Richtig! Du bist ${mySolved.rank}. nach ${seconds(mySolved.at)} s.` : 'Wer war das als Kind? Tippe unten, so oft du willst.';
    if (holdsBuzzer) return 'Sag den Namen laut, der Host wertet.';
    if (usedByMe) return 'Dein Versuch bei diesem Promi ist verbraucht.';
    if (buzzer.holder !== null) return 'Jemand anderes war schneller. Bei Falsch ist der Buzzer wieder frei.';
    return 'Erkannt? Buzzern und laut sagen.';
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm text-slate-400">{round.category.title} · {modeName}{#if round.total > 0} · Promi {round.index + 1} von {round.total}{/if}</p>
        <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.category.question}</h2>
      </div>
      {#if !typing && buzzer.deadline !== null}
        <TurnTimer deadline={buzzer.deadline} totalSeconds={round.thinkSeconds} size={readonly ? 72 : 56} />
      {/if}
    </header>

    <div class="card flex items-center gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold {round.stage === 'solved' ? 'text-emerald-300' : ''} {readonly ? 'text-3xl' : ''}">{statusText}</p>
        {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}
      </div>
      {#if isHost && playing}
        <div class="flex shrink-0 flex-wrap justify-end gap-2">
          {#if round.stage === 'hidden'}
            <button class="btn-primary" onclick={() => client.send({ type: 'kids_show' })}>Zeigen</button>
          {:else if round.stage === 'open'}
            <button class="btn-primary" onclick={() => client.send({ type: 'kids_resolve' })}>Auflösen</button>
          {:else}
            <button class="btn-primary" onclick={() => client.send({ type: 'kids_next' })}>{isLast ? 'Zur Auflösung' : 'Nächster Promi'}</button>
          {/if}
          {#if !isLast || round.stage !== 'solved'}
            <button class="{confirmingEnd ? 'btn-danger' : 'btn-ghost'} text-sm" onclick={endRound}>{confirmingEnd ? 'Wirklich beenden?' : 'Runde beenden'}</button>
          {/if}
        </div>
      {/if}
    </div>

    {#if round.image}
      <FaceImage image={round.image} fx={CLEAR} large={readonly} />
      {#if isHost && round.stage === 'hidden'}
        <p class="text-center text-xs text-amber-300/80">Das Foto siehst nur du schon. Die Spieler sehen es nach „Zeigen“.</p>
      {/if}
    {:else}
      <div class="card flex aspect-[4/3] max-h-[60dvh] flex-col items-center justify-center gap-2 text-center">
        <span class="text-6xl font-black text-slate-700 {readonly ? 'text-8xl' : ''}">?</span>
        <p class="text-slate-400 {readonly ? 'text-2xl' : ''}">{round.total === 0 ? 'Diese Runde wurde ohne gezeigten Promi beendet.' : 'Der Host zeigt gleich das Foto.'}</p>
      </div>
    {/if}

    {#if round.stage === 'solved' && round.name}
      <p class="text-center text-3xl font-black text-emerald-300 {readonly ? 'text-5xl' : ''}">{round.name}</p>
    {:else if isHost && round.name}
      <p class="text-center text-xs text-amber-300/80">Die Person: <span class="font-semibold text-slate-200">{round.name}</span>. Nur du siehst das.</p>
    {/if}

    {#if !typing && isParticipant && playing && round.stage === 'open'}
      <button
        type="button"
        class="w-full rounded-3xl border-4 py-10 text-4xl font-black uppercase tracking-widest transition active:scale-95
          {canBuzz ? 'border-rose-400 bg-rose-600 text-white shadow-lg shadow-rose-900/50 hover:bg-rose-500' : holdsBuzzer ? 'border-amber-400 bg-amber-500 text-slate-950' : 'cursor-not-allowed border-slate-700 bg-slate-800 text-slate-500'}"
        disabled={!canBuzz}
        onclick={() => client.send({ type: 'kids_buzz' })}
      >
        {holdsBuzzer ? 'Du bist dran' : usedByMe ? 'Verbraucht' : buzzer.holder !== null ? 'Besetzt' : 'Buzzer'}
      </button>
    {/if}

    {#if !typing && buzzer.holder !== null}
      <div class="card space-y-3 border-amber-500/40">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold uppercase tracking-widest text-amber-300">Am Buzzer</p>
            <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{playerName(view, buzzer.holder)}</p>
          </div>
          <TurnTimer deadline={buzzer.deadline} totalSeconds={round.thinkSeconds} size={readonly ? 96 : 64} />
        </div>
        {#if isHost && playing}
          <div class="flex gap-2">
            <button class="btn-primary flex-1 bg-emerald-600 hover:bg-emerald-500" onclick={() => client.send({ type: 'kids_verdict', correct: true })}>Richtig</button>
            <button class="btn-danger flex-1" onclick={() => client.send({ type: 'kids_verdict', correct: false })}>Falsch</button>
          </div>
          <p class="text-xs text-slate-500">Beides beendet die Bedenkzeit. Läuft sie ab, zählt das als falsch.</p>
        {/if}
      </div>
    {/if}

    {#if isHost && typing && round.stage !== 'hidden'}
      <div class="card space-y-3">
        <div class="flex items-baseline justify-between">
          <h3 class="font-bold">Tipps prüfen</h3>
          <span class="text-xs text-slate-500">{pendingCount === 0 ? 'nichts offen' : `${pendingCount} offen`}</span>
        </div>
        {#each participants as p (p.id)}
          {@const attempts = round.attempts?.[p.id] ?? []}
          {@const s = round.solved.find((x) => x.playerId === p.id)}
          <div class="rounded-xl border border-slate-800 px-3 py-2">
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-semibold">{p.name}</span>
              <span class="text-xs {s ? 'text-emerald-300' : 'text-slate-500'}">{s ? `${s.rank}. Platz nach ${seconds(s.at)} s` : attempts.length === 0 ? 'noch kein Tipp' : `${attempts.length} ${attempts.length === 1 ? 'Tipp' : 'Tipps'}`}</span>
            </div>
            {#if attempts.length > 0}
              <ul class="mt-1 space-y-1">
                {#each attempts as a, i (i)}
                  <li class="flex flex-wrap items-center gap-2 text-sm">
                    <span class="break-words {a.status === 'correct' ? 'text-emerald-300' : a.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{a.text}</span>
                    <span class="text-xs text-slate-500">{seconds(a.at)} s</span>
                    {#if a.status === 'judging' && playing}
                      <span class="ml-auto flex gap-1">
                        <button class="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500" onclick={() => client.send({ type: 'kids_judge', playerId: p.id, index: i, correct: true })}>richtig</button>
                        <button class="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-500" onclick={() => client.send({ type: 'kids_judge', playerId: p.id, index: i, correct: false })}>falsch</button>
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
        <p class="text-xs text-slate-500">Passende Tipps zählen schon automatisch. Hier landet nur, was nicht zu Name oder Alias passt, etwa Tippfehler.</p>
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    {#if round.stage !== 'hidden' && round.total > 0}
      <div class="card">
        <div class="mb-2 flex items-baseline justify-between">
          <h3 class="font-bold">{typing ? 'Richtig' : 'Treffer'}</h3>
          <span class="text-xs text-slate-500">{typing ? `${round.solved.length} von ${participants.length}` : buzzer.used.length === 0 ? '' : `${buzzer.used.length} verbraucht`}</span>
        </div>
        {#if round.solved.length === 0}
          <p class="text-sm text-slate-500">Noch niemand.</p>
        {:else}
          <ol class="space-y-1">
            {#each round.solved as s (s.playerId)}
              <li class="flex items-center gap-2 {readonly ? 'text-xl' : ''} {s.playerId === me ? 'text-indigo-200' : ''}">
                {#if typing}<span class="w-6 text-right font-mono text-slate-500">{s.rank}.</span>{:else}<span class="text-emerald-400">✓</span>{/if}
                <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, s.playerId)}</span>
                <span class="font-mono text-xs text-slate-400">{seconds(s.at)} s</span>
              </li>
            {/each}
          </ol>
        {/if}
        {#if typing && participants.some((p) => !solvedIds.has(p.id))}
          <p class="mt-2 text-xs text-slate-500">Noch dran: {participants.filter((p) => !solvedIds.has(p.id)).map((p) => p.name).join(', ')}</p>
        {:else if !typing && buzzer.used.length > 0}
          <p class="mt-2 text-xs text-slate-500">Verbraucht: {buzzer.used.map((id) => playerName(view, id)).join(', ')}</p>
        {/if}
      </div>
    {/if}

    {#if !readonly && isParticipant && typing && (round.myAttempts?.length ?? 0) > 0}
      <div class="card">
        <h3 class="mb-2 font-bold">Deine Tipps</h3>
        <ul class="space-y-1 text-sm">
          {#each round.myAttempts ?? [] as a, i (i)}
            <li class="flex items-center gap-2">
              <span class="min-w-0 flex-1 break-words {a.status === 'correct' ? 'text-emerald-300' : a.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{a.text}</span>
              <span class="text-xs text-slate-500">{a.status === 'judging' ? 'der Host prüft…' : a.status === 'correct' ? 'richtig' : 'falsch'}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <h3 class="font-bold">Spielpunkte</h3>
        <span class="text-xs text-slate-500">{typing ? '3, 2, 1 je Promi' : round.penalty === 'minus' ? '1 je Treffer, −1 je Fehlbuzzer' : '1 je Treffer'}</span>
      </div>
      <ol class="divide-y divide-slate-800">
        {#each ranking as p, i (p.id)}
          <li class="flex items-center gap-3 py-1.5 {readonly ? 'text-xl' : ''} {p.id === me ? 'text-indigo-200' : ''}">
            <span class="w-6 text-right font-mono text-slate-500">{i + 1}.</span>
            <span class="min-w-0 flex-1 break-words font-semibold">{p.name}</span>
            <span class="shrink-0 text-xs text-slate-500">{p.hits} {p.hits === 1 ? 'Treffer' : 'Treffer'}{#if !typing && p.misses > 0} · {p.misses} daneben{/if}</span>
            <span class="shrink-0 font-mono font-black">{p.points}</span>
          </li>
        {/each}
      </ol>
    </div>

    {#if round.history.length > 0}
      <div class="card">
        <h3 class="mb-2 font-bold">Bisher</h3>
        <ul class="space-y-1 text-sm">
          {#each round.history as item, i (item.id)}
            <li class="flex flex-wrap items-baseline gap-x-2 {readonly ? 'text-lg' : ''}">
              <span class="font-mono text-xs text-slate-500">{i + 1}.</span>
              <span class="font-semibold">{item.name}</span>
              <span class="text-slate-400">{item.winners.length === 0 ? '· niemand' : `· ${item.winners.map((w) => playerName(view, w.playerId)).join(', ')}`}</span>
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
      <input class="input flex-1" type="text" maxlength={GUESS_MAX_LENGTH} placeholder="Wer war das als Kind?" autocomplete="off" autocapitalize="words" bind:value={text} />
      <button class="btn-primary" type="submit" disabled={text.trim().length === 0}>Raten</button>
    </form>
  </div>
{/if}
