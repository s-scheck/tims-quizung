<script lang="ts">
  import { untrack } from 'svelte';
  import { FACE_COLS_MAX, FACE_COLS_MIN, FACE_LEVEL_MAX, type FaceEffectState, type FacesRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import FaceImage, { tileRows } from './FaceImage.svelte';
  import GuessBar from './GuessBar.svelte';
  import TurnTimer from './TurnTimer.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: FacesRoundView; readonly?: boolean } = $props();

  const isHost = $derived(!readonly && client.isHost);
  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const solvedIds = $derived(new Set(round.solved.map((s) => s.playerId)));
  const mySolved = $derived(round.solved.find((s) => s.playerId === client.myId) ?? null);
  const canGuess = $derived(isParticipant && view.phase === 'playing' && !mySolved);
  const published = $derived(round.effect);
  const effectName = $derived(published.effect === 'blur' ? 'Verschwommen' : published.effect === 'pixel' ? 'Pixel' : 'Kacheln');
  const seconds = (at: number) => ((at - round.startedAt) / 1000).toFixed(1);

  // ------------------------------------------------------------ Host: Vorschau und Übernehmen

  let pendingLevel = $state(untrack(() => round.effect.level));
  let pendingCols = $state(untrack(() => round.effect.cols));
  let pendingTiles = $state<number[]>([]);
  let ratio = $state(4 / 3);
  let confirmingEnd = $state(false);

  const colsLocked = $derived(published.revealed.length > 0);
  /** Zustand, den der Host gerade sieht: übernommener Stand plus Vormerkungen. */
  const preview = $derived<FaceEffectState>(
    isHost
      ? { effect: published.effect, level: pendingLevel, cols: colsLocked ? published.cols : pendingCols, revealed: published.revealed }
      : published,
  );
  const previewTotal = $derived(preview.cols * tileRows(preview.cols, ratio));
  const dirty = $derived(
    published.effect === 'tiles' ? pendingTiles.length > 0 || (!colsLocked && pendingCols !== published.cols) : pendingLevel !== published.level,
  );

  function toggleTile(i: number) {
    if (!isHost || published.revealed.includes(i)) return;
    pendingTiles = pendingTiles.includes(i) ? pendingTiles.filter((t) => t !== i) : [...pendingTiles, i];
  }

  function randomTile() {
    const open = Array.from({ length: previewTotal }, (_, i) => i).filter((i) => !published.revealed.includes(i) && !pendingTiles.includes(i));
    const pick = open[Math.floor(Math.random() * open.length)];
    if (pick !== undefined) pendingTiles = [...pendingTiles, pick];
  }

  function markAll() {
    pendingTiles = Array.from({ length: previewTotal }, (_, i) => i).filter((i) => !published.revealed.includes(i));
  }

  function changeCols(cols: number) {
    pendingCols = cols;
    pendingTiles = [];
  }

  function apply() {
    if (!isHost || !dirty) return;
    if (published.effect === 'tiles') {
      client.send({ type: 'face_effect', ...(!colsLocked && pendingCols !== published.cols ? { cols: pendingCols } : {}), revealed: pendingTiles });
      pendingTiles = [];
    } else {
      client.send({ type: 'face_effect', level: pendingLevel });
    }
  }

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

  // ------------------------------------------------------------ Spieler: Raten

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (isHost) return 'Du moderierst: Stelle den Effekt ein, übernimm ihn für alle und prüfe die Tipps.';
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (mySolved) return `Richtig! Du bist ${mySolved.rank}. nach ${seconds(mySolved.at)} s. Warte auf die Auflösung.`;
    return 'Wer ist das? Tippe unten deinen Tipp ein, so oft du willst.';
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm text-slate-400">{round.category.title} · {effectName}</p>
        <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.category.question}</h2>
      </div>
      <div class="flex items-center gap-2">
        <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
        {#if isHost && view.phase === 'playing'}
          <button class="{confirmingEnd ? 'btn-danger' : 'btn-secondary'} px-3 py-2 text-sm" onclick={endRound}>
            {confirmingEnd ? 'Wirklich auflösen?' : 'Auflösen'}
          </button>
        {/if}
      </div>
    </header>

    {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}

    <FaceImage image={round.image} fx={preview} pending={isHost && published.effect === 'tiles' ? pendingTiles : null} onTile={isHost && published.effect === 'tiles' ? toggleTile : undefined} large={readonly} bind:ratio />

    {#if isHost}
      <div class="card space-y-3 border-amber-500/40">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p class="font-bold text-amber-300">{effectName} einstellen</p>
          <span class="text-xs text-slate-500">
            Bei den Spielern: {published.effect === 'tiles' ? `${published.revealed.length} Kacheln offen, ${published.cols} Spalten` : `Stärke ${published.level}`}
          </span>
        </div>
        {#if published.effect === 'tiles'}
          <label class="block text-sm">
            <span class="mb-1 flex justify-between text-slate-400"><span>Spalten</span><span class="font-mono text-slate-200">{preview.cols}</span></span>
            <input type="range" class="w-full accent-[var(--color-indigo-500)]" min={FACE_COLS_MIN} max={FACE_COLS_MAX} step="1" value={preview.cols} disabled={colsLocked} oninput={(e) => changeCols(Number(e.currentTarget.value))} />
            {#if colsLocked}<span class="text-xs text-slate-500">Die Kachelgröße steht fest, sobald etwas aufgedeckt ist.</span>{/if}
          </label>
          <p class="text-xs text-slate-500">Kacheln im Bild antippen, um sie vorzumerken. Erst „Übernehmen“ deckt sie bei allen auf.</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn-secondary px-3 py-2 text-sm" onclick={randomTile}>Zufällige Kachel</button>
            <button class="btn-secondary px-3 py-2 text-sm" onclick={markAll}>Alle vormerken</button>
            <button class="btn-ghost text-sm" disabled={pendingTiles.length === 0} onclick={() => (pendingTiles = [])}>Vormerkungen löschen</button>
          </div>
        {:else}
          <label class="block text-sm">
            <span class="mb-1 flex justify-between text-slate-400"><span>Stärke (0 ist klar)</span><span class="font-mono text-slate-200">{pendingLevel}</span></span>
            <input type="range" class="w-full accent-[var(--color-indigo-500)]" min="0" max={FACE_LEVEL_MAX} step="1" bind:value={pendingLevel} />
          </label>
          <p class="text-xs text-slate-500">Du siehst die Vorschau sofort, die Spieler erst nach „Übernehmen“.</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn-secondary px-3 py-2 text-sm" onclick={() => (pendingLevel = Math.max(0, pendingLevel - 10))}>−10</button>
            <button class="btn-secondary px-3 py-2 text-sm" onclick={() => (pendingLevel = 0)}>Klar zeigen</button>
          </div>
        {/if}
        <button class="btn-primary w-full" disabled={!dirty || view.phase !== 'playing'} onclick={apply}>
          {published.effect === 'tiles' && pendingTiles.length > 0 ? `${pendingTiles.length} ${pendingTiles.length === 1 ? 'Kachel' : 'Kacheln'} übernehmen` : 'Übernehmen'}
        </button>
      </div>

      <div class="card space-y-3">
        <h3 class="font-bold">Tipps prüfen</h3>
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
                    {#if a.status === 'judging'}
                      {#if a.suggested}<span class="rounded-full bg-emerald-500/20 px-2 text-[10px] font-bold text-emerald-300">sieht richtig aus</span>{/if}
                      <span class="ml-auto flex gap-1">
                        <button class="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500" onclick={() => client.send({ type: 'face_judge', playerId: p.id, index: i, correct: true })}>richtig</button>
                        <button class="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-rose-500" onclick={() => client.send({ type: 'face_judge', playerId: p.id, index: i, correct: false })}>falsch</button>
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
        <p class="text-xs text-amber-300/80">Die Person: <span class="font-semibold text-slate-200">{round.name}</span>. Nur du siehst das.</p>
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <h3 class="font-bold">Richtig</h3>
        <span class="text-xs text-slate-500">{round.solved.length} von {participants.length}</span>
      </div>
      {#if round.solved.length === 0}
        <p class="text-sm text-slate-500">Noch niemand.</p>
      {:else}
        <ol class="space-y-1">
          {#each round.solved as s (s.playerId)}
            <li class="flex items-center gap-2 {readonly ? 'text-xl' : ''}">
              <span class="w-6 text-right font-mono text-slate-500">{s.rank}.</span>
              <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, s.playerId)}</span>
              <span class="font-mono text-xs text-slate-400">{seconds(s.at)} s</span>
            </li>
          {/each}
        </ol>
      {/if}
      {#if participants.some((p) => !solvedIds.has(p.id))}
        <p class="mt-2 text-xs text-slate-500">Noch dran: {participants.filter((p) => !solvedIds.has(p.id)).map((p) => p.name).join(', ')}</p>
      {/if}
    </div>

    {#if !readonly && isParticipant && (round.myAttempts?.length ?? 0) > 0}
      <div class="card">
        <h3 class="mb-2 font-bold">Deine Tipps</h3>
        <ul class="space-y-1 text-sm">
          {#each round.myAttempts ?? [] as a, i (i)}
            <li class="flex items-center gap-2">
              <span class="min-w-0 flex-1 break-words {a.status === 'correct' ? 'text-emerald-300' : a.status === 'wrong' ? 'text-rose-300 line-through' : ''}">{a.text}</span>
              <span class="text-xs text-slate-500">{a.status === 'judging' ? 'wird geprüft…' : a.status === 'correct' ? 'richtig' : 'falsch'}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

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
  <GuessBar placeholder="Wer ist das?" submitLabel="Raten" onSubmit={(text) => client.send({ type: 'face_guess', text })} />
{/if}
