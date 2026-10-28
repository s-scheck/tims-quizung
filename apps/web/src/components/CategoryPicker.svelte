<script lang="ts">
  import { untrack } from 'svelte';
  import {
    LIVES_MAX,
    LIVES_MIN,
    MORSE_SUGGESTIONS,
    MORSE_WORD_MAX,
    normalizeMorseText,
    toMorse,
    RISK_DUPLICATE_OPTIONS,
    RISK_MISS_OPTIONS,
    SHOW_GAMES,
    FACE_COLS_MAX,
    FACE_COLS_MIN,
    FACE_LEVEL_MAX,
    type CategorySummary,
    type FaceEffect,
    type GameId,
    type PictureMode,
    type RevealMode,
    type RiskDuplicates,
    type RiskMissPoints,
    type RoomView,
  } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import Scoreboard from './Scoreboard.svelte';

  let { view }: { view: RoomView } = $props();

  const games = $derived(view.games ?? []);
  const roundNo = $derived(view.rounds.length + 1);
  // Startwerte bewusst nur einmal lesen: danach steuert der Host die Auswahl selbst.
  let gameId = $state<GameId>(untrack(() => view.gameId ?? 'sort'));
  let lives = $state(untrack(() => view.defaultLives));
  let borders = $state(untrack(() => view.mapBorders));
  let duplicates = $state<RiskDuplicates>(untrack(() => view.riskRules.duplicates));
  let missPoints = $state<RiskMissPoints>(untrack(() => view.riskRules.missPoints));
  let reveal = $state<RevealMode>(untrack(() => view.revealMode));
  const REVEAL_OPTIONS: { mode: RevealMode; label: string }[] = [
    { mode: 'auto', label: 'Automatisch' },
    { mode: 'show', label: 'Show' },
  ];
  /** Bei Karte und Zeitstrahl als Moderator: gewählte Sammlung, deren Ziele gerade zur Wahl stehen. */
  let targetPickFor = $state<string | null>(null);
  const isPicture = $derived(gameId === 'picture');
  /** Bilderrätsel: reihum mit Leben oder alle gleichzeitig mit Prüfung am Ende. */
  let pictureMode = $state<PictureMode>('turns');
  const PICTURE_MODE_OPTIONS: { mode: PictureMode; label: string; hint: string }[] = [
    { mode: 'turns', label: 'Reihum', hint: 'Einer nach dem anderen nennt ein Feld und tippt. Falsch kostet ein Leben, du prüfst jeden Tipp sofort.' },
    { mode: 'all', label: 'Alle gleichzeitig', hint: 'Alle füllen jedes Feld aus und melden sich fertig. Du prüfst am Ende Feld für Feld als Show, Punkte nach Treffern und Tempo.' },
  ];
  const usesLives = $derived(gameId === 'topx' || gameId === 'match' || (isPicture && pictureMode === 'turns'));
  const isMap = $derived(gameId === 'map');
  const isRisk = $derived(gameId === 'risk');
  /** Show-Auflösung gibt es nur bei den gleichzeitigen Spielen und nur, wenn der Host moderiert. */
  const hasShow = $derived(SHOW_GAMES.includes(gameId) && client.isModerator);
  const isFaces = $derived(gameId === 'faces');
  const hasTargets = $derived(gameId === 'map' || gameId === 'timeline' || gameId === 'bluff' || isFaces);
  const targetNoun = $derived(gameId === 'map' ? 'Ziel' : gameId === 'timeline' ? 'Ereignis' : isFaces ? 'Promi' : 'Aufgabe');
  // Bei „Wer ist das?“ prüft der Host immer selbst, also wählt er die Person auch als Mitspieler.
  const picksTarget = $derived(hasTargets && (client.isModerator || (isFaces && client.isHost)));
  let faceEffect = $state<FaceEffect>('blur');
  let faceLevel = $state(80);
  let faceCols = $state(6);
  const FACE_EFFECT_OPTIONS: { effect: FaceEffect; label: string; hint: string }[] = [
    { effect: 'blur', label: 'Verschwommen', hint: 'Du stellst die Schärfe und gibst sie Stück für Stück frei.' },
    { effect: 'pixel', label: 'Pixel', hint: 'Grobe Klötzchen, die du nach und nach feiner machst.' },
    { effect: 'tiles', label: 'Kacheln', hint: 'Das Bild liegt unter Kacheln, die du einzeln aufdeckst.' },
  ];
  const targetCategory = $derived((view.categories ?? []).find((c) => c.id === targetPickFor) ?? null);
  const isMorse = $derived(gameId === 'morse');
  let morseWord = $state('');
  const morseNormalized = $derived(normalizeMorseText(morseWord));
  const morseOk = $derived(morseNormalized.length > 0 && morseNormalized.length <= MORSE_WORD_MAX);

  function suggestMorse() {
    const pick = MORSE_SUGGESTIONS[Math.floor(Math.random() * MORSE_SUGGESTIONS.length)] ?? 'SOS';
    morseWord = pick
      .split(' ')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }

  function startMorse() {
    if (!morseOk) return;
    client.send({ type: 'choose_category', gameId: 'morse', categoryId: 'morse', word: morseWord });
  }

  const categories = $derived((view.categories ?? []).filter((c) => c.games.includes(gameId)));
  const currentGame = $derived(games.find((g) => g.id === gameId));

  function choose(categoryId: string, targetId?: string) {
    client.send({
      type: 'choose_category',
      gameId,
      categoryId,
      ...(usesLives ? { lives } : {}),
      ...(isPicture ? { mode: pictureMode } : {}),
      ...(isMap ? { borders } : {}),
      ...(isRisk ? { duplicates, missPoints } : {}),
      ...(hasShow ? { reveal } : {}),
      ...(isFaces ? { effect: faceEffect, ...(faceEffect === 'tiles' ? { cols: faceCols } : { level: faceLevel }) } : {}),
      ...(targetId ? { targetId } : {}),
    });
  }

  function onCategoryClick(c: CategorySummary) {
    if (picksTarget) targetPickFor = c.id;
    else choose(c.id);
  }

  function selectGame(id: GameId) {
    gameId = id;
    targetPickFor = null;
  }
</script>

{#if client.isHost}
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">Runde {roundNo}</p>
        <h2 class="text-2xl font-bold">Spiel und Kategorie wählen</h2>
      </div>
      <button class="btn-ghost text-rose-300" onclick={() => client.send({ type: 'end_game' })}>Spiel beenden</button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      {#each games as g (g.id)}
        <button
          class="card flex flex-col items-start gap-1 text-left transition
            {gameId === g.id ? 'border-indigo-500 bg-indigo-500/15' : 'hover:border-slate-600'}"
          onclick={() => selectGame(g.id)}
        >
          <span class="text-lg font-bold">{g.name}</span>
          <span class="text-sm text-slate-400">{g.description}</span>
        </button>
      {/each}
    </div>

    {#if usesLives}
      <div class="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-semibold">Leben pro Spieler</p>
          <p class="text-xs text-slate-500">Jeder Fehler kostet eins. Ohne Leben ist man für diese Runde raus.</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-secondary px-4" disabled={lives <= LIVES_MIN} onclick={() => (lives = Math.max(LIVES_MIN, lives - 1))} aria-label="weniger Leben">−</button>
          <span class="w-16 text-center text-2xl font-black text-rose-300">{'♥'.repeat(lives)}</span>
          <button class="btn-secondary px-4" disabled={lives >= LIVES_MAX} onclick={() => (lives = Math.min(LIVES_MAX, lives + 1))} aria-label="mehr Leben">+</button>
        </div>
      </div>
    {/if}

    {#if isFaces}
      <div class="card space-y-3">
        <div>
          <p class="font-semibold">Effekt</p>
          <p class="text-xs text-slate-500">Du moderierst bei diesem Spiel immer, auch wenn du sonst mitspielst: Du siehst den Namen, gibst das Bild frei und prüfst die Tipps.</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-3">
          {#each FACE_EFFECT_OPTIONS as opt (opt.effect)}
            <button
              class="rounded-xl border px-3 py-2 text-left transition {faceEffect === opt.effect ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
              onclick={() => (faceEffect = opt.effect)}
            >
              <span class="block text-sm font-semibold">{opt.label}</span>
              <span class="block text-xs opacity-80">{opt.hint}</span>
            </button>
          {/each}
        </div>
        {#if faceEffect === 'tiles'}
          <label class="block text-sm">
            <span class="mb-1 flex justify-between text-slate-400"><span>Spalten zu Beginn</span><span class="font-mono text-slate-200">{faceCols}</span></span>
            <input type="range" class="w-full accent-[var(--color-indigo-500)]" min={FACE_COLS_MIN} max={FACE_COLS_MAX} step="1" bind:value={faceCols} />
          </label>
        {:else}
          <label class="block text-sm">
            <span class="mb-1 flex justify-between text-slate-400"><span>Stärke zu Beginn</span><span class="font-mono text-slate-200">{faceLevel}</span></span>
            <input type="range" class="w-full accent-[var(--color-indigo-500)]" min="0" max={FACE_LEVEL_MAX} step="1" bind:value={faceLevel} />
          </label>
        {/if}
      </div>
    {/if}
    {#if isPicture}
      <div class="card space-y-3">
        <div>
          <p class="font-semibold">Modus</p>
          <p class="text-xs text-slate-500">Gilt für diese Runde.</p>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          {#each PICTURE_MODE_OPTIONS as o (o.mode)}
            <button
              type="button"
              class="rounded-xl border px-3 py-2 text-left transition {pictureMode === o.mode ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-700 hover:border-slate-500'}"
              onclick={() => (pictureMode = o.mode)}
            >
              <span class="block font-semibold">{o.label}</span>
              <span class="block text-xs text-slate-400">{o.hint}</span>
            </button>
          {/each}
        </div>
        <p class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Beim Bilderrätsel moderierst du immer: Du siehst die Lösungen und prüfst, auch wenn du laut Lobby mitspielst. Bilder legst du im Editor an.
        </p>
      </div>
    {/if}
    {#if hasShow}
      <div class="card flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold">Auflösung</p>
          <p class="text-xs text-slate-500">
            {reveal === 'show'
              ? 'Show: Alle sehen erst nur die Namen. Du deckst jedes Ergebnis und die Lösung selbst auf, Stück für Stück.'
              : 'Automatisch: Alle Ergebnisse erscheinen auf einmal.'}
          </p>
        </div>
        <div class="flex gap-2">
          {#each REVEAL_OPTIONS as opt (opt.mode)}
            <button
              class="rounded-xl border px-3 py-2 text-sm font-semibold transition
                {reveal === opt.mode ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
              onclick={() => (reveal = opt.mode)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if isMap}
      <div class="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-semibold">Ländergrenzen</p>
          <p class="text-xs text-slate-500">Ohne Grenzen zeigt die Karte nur Land und Wasser.</p>
        </div>
        <div class="flex gap-2">
          {#each [false, true] as withBorders (withBorders)}
            <button
              class="rounded-xl border px-3 py-2 text-sm font-semibold transition
                {borders === withBorders ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
              onclick={() => (borders = withBorders)}
            >
              {withBorders ? 'Mit Grenzen' : 'Ohne Grenzen'}
            </button>
          {/each}
        </div>
      </div>
    {/if}
    {#if isRisk}
      <div class="card space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-semibold">Gleicher Treffer im selben Durchgang</p>
            <p class="text-xs text-slate-500">Wenn zwei dasselbe richtige Land nennen.</p>
          </div>
          <div class="flex gap-2">
            {#each RISK_DUPLICATE_OPTIONS as opt (opt)}
              <button
                class="rounded-xl border px-3 py-2 text-sm font-semibold transition
                  {duplicates === opt ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
                onclick={() => (duplicates = opt)}
              >
                {opt === 'both' ? 'Beide punkten' : 'Beide 0 Punkte'}
              </button>
            {/each}
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="font-semibold">Daneben oder kein Tipp</p>
            <p class="text-xs text-slate-500">Für einen Tipp, der nicht in der Liste steht.</p>
          </div>
          <div class="flex gap-2">
            {#each RISK_MISS_OPTIONS as opt (opt)}
              <button
                class="rounded-xl border px-3 py-2 text-sm font-semibold transition
                  {missPoints === opt ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
                onclick={() => (missPoints = opt)}
              >
                {opt === 0 ? '0 Punkte' : `−${-opt} Punkte`}
              </button>
            {/each}
          </div>
        </div>
      </div>
    {/if}
    {#if hasTargets && !picksTarget}
      <p class="text-xs text-slate-500">Du spielst mit, deshalb zieht der Server {targetNoun === 'Aufgabe' ? 'eine zufällige Aufgabe' : `ein zufälliges ${targetNoun}`}, {targetNoun === 'Aufgabe' ? 'die' : 'das'} du nicht vorher siehst.</p>
    {/if}

    {#if isMorse}
      <div class="card space-y-3">
        <div>
          <p class="font-semibold">Wort zum Morsen</p>
          <p class="text-xs text-slate-500">Nur du siehst es. Bei Morse moderierst du immer, auch wenn du sonst mitspielst. Ton und Licht laufen auf deinem Gerät.</p>
        </div>
        <input
          class="input"
          type="text"
          maxlength="40"
          autocomplete="off"
          placeholder="z. B. Hallo Welt"
          bind:value={morseWord}
          onkeydown={(e) => e.key === 'Enter' && startMorse()}
        />
        <p class="text-xs text-slate-500">
          Gemorst wird: <span class="font-mono text-slate-200">{morseNormalized || '–'}</span>
          {#if morseNormalized}<span class="ml-2 font-mono tracking-widest text-amber-200">{toMorse(morseWord).replace(/\./g, '·').replace(/-/g, '−')}</span>{/if}
          {#if morseNormalized.length > MORSE_WORD_MAX}<span class="text-rose-300"> · zu lang, höchstens {MORSE_WORD_MAX} Zeichen</span>{/if}
        </p>
        <div class="flex gap-2">
          <button class="btn-secondary" onclick={suggestMorse}>Vorschlag</button>
          <button class="btn-primary flex-1" disabled={!morseOk} onclick={startMorse}>Runde starten</button>
        </div>
      </div>
    {:else if targetCategory && picksTarget}
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm text-slate-400">{targetCategory.title}</p>
            <h3 class="text-lg font-bold">{targetNoun} wählen</h3>
          </div>
          <button class="btn-ghost text-sm" onclick={() => (targetPickFor = null)}>Zurück</button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each targetCategory.targets ?? [] as t (t.id)}
            <button
              class="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-sm font-semibold transition hover:border-indigo-500/60 hover:bg-slate-800/60 {t.played ? 'opacity-60' : ''}"
              onclick={() => choose(targetCategory.id, t.id)}
            >
              <span class="break-words">{t.name}</span>
              {#if t.played}<span class="badge shrink-0 bg-emerald-500/20 text-emerald-300">gespielt</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {:else}
    <div>
      <p class="mb-2 text-sm text-slate-400">Kategorien für {currentGame?.name ?? gameId}</p>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each categories as c (c.id)}
          <button
            class="card flex flex-col items-start gap-1 text-left transition {c.draft ? 'cursor-not-allowed opacity-50' : 'hover:border-indigo-500/60 hover:bg-slate-800/60'} {c.played ? 'opacity-60' : ''}"
            disabled={!!c.draft}
            onclick={() => onCategoryClick(c)}
          >
            <div class="flex w-full items-start justify-between gap-2">
              <span class="font-bold">{c.title}</span>
              {#if c.draft}
                <span class="badge shrink-0 bg-amber-500/20 text-amber-300">Entwurf</span>
              {:else if c.played}
                <span class="badge shrink-0 bg-emerald-500/20 text-emerald-300">gespielt</span>
              {/if}
            </div>
            <span class="text-sm text-slate-400">{c.question}</span>
            {#if c.draft}
              <span class="text-xs text-amber-300">Noch nicht spielbar: {c.draft}</span>
            {:else}
              <span class="text-xs text-slate-500">{c.count} {c.games.includes('map') ? 'Ziele' : c.games.includes('timeline') ? 'Ereignisse' : c.games.includes('risk') ? 'Plätze' : c.games.includes('bluff') ? 'Aufgaben' : c.games.includes('picture') ? 'Felder' : c.games.includes('faces') ? 'Personen' : 'Karten'}</span>
            {/if}
          </button>
        {/each}
        {#if categories.length === 0}
          <p class="text-sm text-slate-500 sm:col-span-2 lg:col-span-3">Noch keine Liste für dieses Spiel. Im Editor lässt sich eine anlegen.</p>
        {/if}
      </div>
    </div>
    {/if}
  </div>
{:else}
  <div class="grid gap-6 md:grid-cols-2">
    <section class="card flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400"></div>
      <p class="text-lg">{playerName(view, view.hostId)} wählt Spiel und Kategorie…</p>
      <p class="text-sm text-slate-500">Runde {roundNo}</p>
    </section>
    <Scoreboard {view} readonly compact />
  </div>
{/if}
