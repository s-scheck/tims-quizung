<script lang="ts">
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { GUESS_MAX_LENGTH, type RoomView, type TopXRoundView, type TopXSlotView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { formatValue, playerName } from '../lib/format.ts';
  import TurnTimer from './TurnTimer.svelte';
  import HostDecision from './HostDecision.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: TopXRoundView; readonly?: boolean } = $props();

  const guess = $derived(round.guess);
  const activeName = $derived(playerName(view, round.activePlayerId));
  const activePlayer = $derived(view.players.find((p) => p.id === round.activePlayerId));
  const canGuess = $derived(!readonly && client.isActive && view.phase === 'playing' && !guess);
  const canJudge = $derived(!readonly && client.isHost && guess?.status === 'judging');
  const canSkip = $derived(
    !readonly && client.isHost && !client.isActive && view.phase === 'playing' && !guess && view.settings.timerSeconds === 0,
  );
  const unrevealed = $derived(round.slots.filter((s) => !s.revealed));
  const players = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const revealedCount = $derived(round.slots.filter((s) => s.revealed).length);

  let text = $state('');
  let judgeRank = $state<number | null>(null);
  // Bei jedem neuen Prüf-Tipp den Vorschlag übernehmen, danach nicht mehr überschreiben.
  const judgeKey = $derived(guess?.status === 'judging' ? `${round.turnNo}:${guess.by}` : null);
  $effect(() => {
    const key = judgeKey;
    untrack(() => {
      judgeRank = key ? (guess?.matchRank ?? null) : null;
    });
  });

  function submitGuess() {
    const t = text.trim();
    if (!t || !canGuess) return;
    client.send({ type: 'guess', turnNo: round.turnNo, text: t });
    text = '';
  }

  function judge(correct: boolean) {
    if (!canJudge) return;
    if (correct && judgeRank === null) return;
    client.send({ type: 'judge', turnNo: round.turnNo, correct, ...(correct && judgeRank !== null ? { rank: judgeRank } : {}) });
  }

  function valueText(slot: TopXSlotView): string {
    return formatValue({ id: String(slot.rank), name: slot.name ?? '', value: slot.value, label: slot.label }, round.category);
  }

  const statusText = $derived.by(() => {
    if (view.phase === 'host_decision') return null;
    if (guess) {
      const who = guess.by === client.myId && !readonly ? 'Du' : playerName(view, guess.by);
      if (guess.status === 'judging') return `${who} tippt „${guess.text}“`;
      if (guess.status === 'pending') return `${who} tippt „${guess.text}“…`;
      if (guess.status === 'correct') return `Richtig! „${guess.text}“`;
      return `Falsch: „${guess.text}“`;
    }
    if (!readonly && client.isActive) return 'Du bist dran';
    return `${activeName} ist dran`;
  });

  const hint = $derived.by(() => {
    if (view.phase !== 'playing' || readonly) return '';
    if (guess?.status === 'judging') return client.isHost ? 'Prüfe den Tipp.' : `${playerName(view, view.hostId)} prüft den Tipp…`;
    if (guess) return '';
    if (client.isActive) return 'Tippe einen Namen aus der Liste.';
    if (client.isEliminated) return 'Keine Leben mehr. Schau zu, wie es weitergeht.';
    if (client.isModerator) return 'Du moderierst diese Runde und prüfst die Tipps.';
    if (!client.inRound) return 'Du bist ab der nächsten Runde dabei.';
    return '';
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="space-y-1">
      <p class="text-sm text-slate-400">{round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
    </header>

    <div class="card flex items-center gap-4 {guess?.status === 'wrong' ? 'animate-shake' : ''}">
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold {guess?.status === 'correct' ? 'text-emerald-300' : guess?.status === 'wrong' ? 'text-rose-300' : guess?.status === 'pending' ? 'animate-pulse text-amber-200' : ''}">
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
    </div>

    {#if view.phase === 'host_decision'}
      <HostDecision {view} {readonly} />
    {/if}

    {#if canJudge && guess}
      <div class="card space-y-3 border-amber-400/40 bg-amber-400/10" in:fly={{ y: 8, duration: 200 }}>
        <p class="font-bold">Tipp von {playerName(view, guess.by)}: „{guess.text}“</p>
        <p class="text-sm text-slate-300">
          {#if guess.matchRank !== null}
            Vorschlag: <span class="font-semibold text-white">{round.slots.find((s) => s.rank === guess.matchRank)?.name}</span> (Platz {guess.matchRank})
          {:else}
            Kein Treffer gefunden. Falls doch richtig, Karte unten wählen.
          {/if}
        </p>
        <label class="block text-sm">
          <span class="mb-1 block text-slate-400">Getroffene Karte</span>
          <select class="input" bind:value={judgeRank}>
            <option value={null}>– keine –</option>
            {#each unrevealed as s (s.rank)}
              <option value={s.rank}>{s.rank}. {s.name ?? '?'}</option>
            {/each}
          </select>
        </label>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary flex-1 bg-emerald-600 hover:bg-emerald-500" disabled={judgeRank === null} onclick={() => judge(true)}>Richtig</button>
          <button class="btn-danger flex-1" onclick={() => judge(false)}>Falsch</button>
        </div>
      </div>
    {/if}

    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <p class="text-xs font-semibold uppercase tracking-widest text-emerald-300">▲ {round.category.topLabel}</p>
        <span class="text-xs text-slate-500">{revealedCount} von {round.slots.length} aufgedeckt</span>
      </div>
      <ol class="space-y-1.5">
        {#each round.slots as slot (slot.rank)}
          {@const justHit = guess?.status === 'correct' && guess.matchRank === slot.rank}
          <li
            class="flex items-center gap-3 rounded-lg border px-3 py-2 transition
              {slot.revealed ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'}
              {justHit ? 'animate-flash border-emerald-400' : ''}
              {readonly ? 'text-xl py-3' : ''}"
          >
            <span class="w-7 shrink-0 text-right font-mono text-sm text-slate-500">{slot.rank}.</span>
            {#if slot.revealed}
              <span class="min-w-0 flex-1 truncate font-semibold" in:fly={{ x: -8, duration: 300 }}>{slot.name}</span>
              <span class="shrink-0 font-mono text-sm text-slate-200">{valueText(slot)}</span>
              {#if slot.revealedBy && !readonly}
                <span class="hidden shrink-0 text-xs text-slate-500 sm:inline">{playerName(view, slot.revealedBy)}</span>
              {/if}
            {:else if round.privileged && slot.name}
              <span class="min-w-0 flex-1 truncate text-slate-400" title="nur du siehst das">{slot.name}</span>
              <span class="shrink-0 font-mono text-xs text-slate-500">{valueText(slot)}</span>
              <span class="shrink-0 text-xs text-amber-300/80">🔒</span>
            {:else}
              <span class="h-4 flex-1 rounded bg-slate-800"></span>
            {/if}
          </li>
        {/each}
      </ol>
      <p class="mt-2 text-xs font-semibold uppercase tracking-widest text-sky-300">▼ {round.category.bottomLabel}</p>
      {#if round.privileged}
        <p class="mt-2 text-xs text-amber-300/80">Verdeckte Karten siehst nur du als Moderator.</p>
      {/if}
    </div>
  </section>

  <aside class="space-y-4">
    <div class="card">
      <h3 class="mb-3 font-bold">Leben</h3>
      <ul class="space-y-2">
        {#each players as p (p.id)}
          {@const lives = round.lives[p.id] ?? 0}
          {@const out = lives === 0}
          <li
            class="flex items-center gap-3 rounded-xl border px-3 py-2
              {round.activePlayerId === p.id ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-800 bg-slate-900/50'}
              {out ? 'opacity-50' : ''} {readonly ? 'text-xl' : ''}"
          >
            <span class="h-2.5 w-2.5 shrink-0 rounded-full {p.connected ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
            <span class="min-w-0 flex-1 truncate font-semibold {out ? 'line-through' : ''}">
              {p.name}{#if p.id === client.myId}<span class="text-xs font-normal text-slate-500"> (du)</span>{/if}
            </span>
            <span class="shrink-0 text-xs text-slate-400">{round.hits[p.id] ?? 0} ✓</span>
            <span class="shrink-0 font-mono tracking-wider">
              <span class="text-rose-400">{'♥'.repeat(lives)}</span><span class="text-slate-700">{'♥'.repeat(Math.max(0, round.maxLives - lives))}</span>
            </span>
          </li>
        {/each}
      </ul>
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
              {w.text} <span class="text-xs text-rose-300/70">{playerName(view, w.by)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
</div>

{#if canGuess}
  <div class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <form class="mx-auto flex max-w-5xl items-center gap-3" onsubmit={(e) => { e.preventDefault(); submitGuess(); }}>
      <input
        class="input flex-1"
        type="text"
        maxlength={GUESS_MAX_LENGTH}
        placeholder="Wer oder was ist in der Liste?"
        autocomplete="off"
        autocapitalize="words"
        bind:value={text}
      />
      <button class="btn-primary" type="submit" disabled={text.trim().length === 0}>Tippen</button>
    </form>
  </div>
{/if}
