<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import type { DungeonDoorView, DungeonRoundView, RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import DungeonScene from './DungeonScene.svelte';
  import DungeonQuestion from './DungeonQuestion.svelte';
  import DungeonHud from './DungeonHud.svelte';
  import DungeonKeyIcon from './DungeonKeyIcon.svelte';
  import DungeonPhoneHeads from './DungeonPhoneHeads.svelte';
  import DungeonPhoneMenu from './DungeonPhoneMenu.svelte';
  import DungeonPhoneOverview from './DungeonPhoneOverview.svelte';
  import DungeonPhoneCountdown from './DungeonPhoneCountdown.svelte';
  import { doorFormat, doorHint, doorIcon } from './doorLabel.ts';
  import {
    DUNGEON_SUSPENSE_MS,
    dungeonRoundFeedback,
    dungeonTapFeedback,
    isDungeonMuted,
    setDungeonMuted,
    wakeDungeonAudio,
  } from './dungeonFeedback.ts';

  /**
   * Handy: Mitspieler im eigenen Raum, moderierender Host und Zuschauer. Wie bei Hochstapler gehört der ganze
   * Bildschirm dem Spiel (ohne Scrollen, auch auf dem iPhone SE): oben eine dünne Kopfzeile und die Köpfe, in der
   * Mitte die Szene, unten im Daumenbereich die eine Aktion. Host-Werkzeuge stecken im Menü und an den Köpfen.
   */
  let { view, round }: { view: RoomView; round: DungeonRoundView } = $props();

  const me = $derived(client.myId);
  const isHost = $derived(client.isHost);
  const mine = $derived(me ? round.players[me] : undefined);
  const playing = $derived(view.phase === 'playing');
  const rooms = $derived(round.rooms.length);
  const iSkip = $derived(!!me && round.skipped.includes(me));
  const active = $derived(round.turnOrder.filter((id) => round.players[id]?.status === 'in' && !round.skipped.includes(id)));
  const waiting = $derived(
    round.stage === 'choosing' ? active.filter((id) => !round.walk[id]?.confirmed) : round.stage === 'answering' ? active.filter((id) => !round.answered.includes(id)) : [],
  );
  const anyoneIn = $derived(round.turnOrder.some((id) => round.players[id]?.status === 'in'));
  const heads = $derived(round.turnOrder.filter((id) => round.players[id]));

  // ------------------------------------------------------------ Vollbild

  // Die Seite darunter darf nicht scrollen oder federn.
  $effect(() => {
    document.documentElement.classList.add('dungeon-lock');
    return () => document.documentElement.classList.remove('dungeon-lock');
  });

  // Sichtbarer Bereich: Öffnet iOS die Tastatur, schrumpft er, und das Eingabefeld bleibt darüber.
  let vv = $state<{ top: number; height: number } | null>(null);
  $effect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const update = () => (vv = { top: v.offsetTop, height: v.height });
    update();
    v.addEventListener('resize', update);
    v.addEventListener('scroll', update);
    return () => {
      v.removeEventListener('resize', update);
      v.removeEventListener('scroll', update);
    };
  });

  // ------------------------------------------------------------ Klang

  let muted = $state(isDungeonMuted());
  let woke = false;
  function wake() {
    if (woke) return;
    woke = true;
    wakeDungeonAudio();
  }
  function toggleMute() {
    muted = !muted;
    setDungeonMuted(muted);
  }
  $effect(() => {
    const r = round;
    const id = me;
    untrack(() => dungeonRoundFeedback(r, id));
  });

  // ------------------------------------------------------------ Spannung vor dem Ergebnis

  // Wechselt der Stand vor meinen Augen auf `result`, bleibt das Ergebnis kurz verdeckt, solange die Szene die Türen
  // aufgehen lässt. Wer mitten im Ergebnis neu lädt, sieht es sofort.
  let suspense = $state(false);
  let prevStage: string | null = null;
  let suspenseTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const stage = round.stage;
    untrack(() => {
      if (stage === 'result' && prevStage !== null && prevStage !== 'result') {
        suspense = true;
        if (suspenseTimer) clearTimeout(suspenseTimer);
        suspenseTimer = setTimeout(() => (suspense = false), DUNGEON_SUSPENSE_MS);
      } else if (stage !== 'result') {
        suspense = false;
      }
      prevStage = stage;
    });
  });
  onDestroy(() => {
    if (suspenseTimer) clearTimeout(suspenseTimer);
  });
  const revealed = $derived(round.stage === 'result' && !suspense);

  // ------------------------------------------------------------ eigene Wahl

  const myWalk = $derived(me ? round.walk[me] : undefined);
  const myResult = $derived(me ? round.results?.[me] : undefined);
  const myRoom = $derived(round.stage === 'result' && myResult ? myResult.room : (mine?.room ?? 0));
  const myDoors = $derived(round.rooms[myRoom] ?? []);
  const selectedDoor = $derived(myDoors.find((d) => d.id === myWalk?.doorId) ?? null);
  const selectedLocked = $derived(!!selectedDoor && !!mine?.locked.includes(selectedDoor.id));
  const canChoose = $derived(playing && round.stage === 'choosing' && mine?.status === 'in' && !iSkip && !myWalk?.confirmed);
  const myQuestionDoor = $derived(round.myQuestion ? myDoors.find((d) => d.id === round.myQuestion!.doorId) : undefined);
  const asking = $derived(round.stage === 'answering' && !!round.myQuestion && !!myQuestionDoor && !round.myAnswer);
  const openCount = $derived(myDoors.filter((d) => !mine?.locked.includes(d.id)).length);

  // Bestätigen erst, wenn die Figur angekommen ist.
  let pickedAt = $state(0);
  let now = $state(Date.now());
  $effect(() => {
    if (!pickedAt) return;
    const t = setTimeout(() => (now = Date.now()), 950);
    return () => clearTimeout(t);
  });
  const arrived = $derived(now - pickedAt >= 900);

  function pick(doorId: string) {
    if (!canChoose || myWalk?.doorId === doorId) return;
    if (mine?.locked.includes(doorId) && !mine.key) return;
    pickedAt = Date.now();
    now = pickedAt;
    dungeonTapFeedback('door');
    client.send({ type: 'dungeon_walk', doorId });
  }

  // Kurze Erklärung zum Schlüssel, bis man ihn einmal vor einer Tür in der Hand hatte.
  const KEY_TIP = 'quiz.dungeon.keyTip';
  let keyTipSeen = $state(readTip());
  function readTip(): boolean {
    try {
      return localStorage.getItem(KEY_TIP) === '1';
    } catch {
      return false;
    }
  }
  function enter(key: boolean) {
    dungeonTapFeedback(key ? 'key' : 'enter');
    if (mine?.key && !keyTipSeen) {
      keyTipSeen = true;
      try {
        localStorage.setItem(KEY_TIP, '1');
      } catch {
        // egal, dann kommt die Erklärung eben noch einmal
      }
    }
    client.send(key ? { type: 'dungeon_enter', key: true } : { type: 'dungeon_enter' });
  }

  function skip(id: string) {
    client.send({ type: 'dungeon_skip', playerId: id });
  }
  function next() {
    client.send({ type: 'dungeon_next' });
  }

  /** Spuren an der Tür: wie viele dort schon gescheitert sind bzw. es geschafft haben. */
  function triesOf(door: DungeonDoorView): { ok: number; bad: number } {
    let ok = 0;
    let bad = 0;
    for (const t of door.tries) t.correct ? ok++ : bad++;
    return { ok, bad };
  }

  let menuOpen = $state(false);
  const place = $derived(me ? round.ranking.find((x) => x.playerId === me)?.place : undefined);
  const stageText = $derived(
    round.stage === 'choosing'
      ? waiting.length === 0
        ? 'Alle stehen in ihrer Tür'
        : `Türwahl · noch ${waiting.length}`
      : round.stage === 'answering'
        ? waiting.length === 0
          ? 'Alle haben geantwortet'
          : `Antworten · noch ${waiting.length}`
        : revealed
          ? 'Ergebnis'
          : 'Die Türen öffnen sich …',
  );
  const nextLabel = $derived(anyoneIn ? 'Nächste Türwahl' : 'Auswertung');
  const inScene = $derived(!!mine && (mine.status === 'in' || !!myResult));
</script>

<div
  class="dg-full fixed inset-x-0 z-40 flex select-none justify-center overflow-hidden"
  style={vv ? `top:${vv.top}px; height:${vv.height}px` : 'top:0; bottom:0'}
  onpointerdown={wake}
  role="presentation"
>
  <div
    class="relative flex h-full w-full flex-col gap-1.5 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] {inScene ? 'max-w-[32rem]' : 'max-w-5xl'}"
  >
    <DungeonHud
      {rooms}
      room={!mine ? null : myResult && !revealed ? myResult.room : mine.status === 'out' ? rooms : mine.room}
      out={mine?.status === 'out' && (!myResult || revealed)}
      eliminated={mine?.status === 'eliminated' && (!myResult || revealed)}
      wrong={mine && myResult && !revealed && !myResult.correct ? mine.wrong - 1 : (mine?.wrong ?? 0)}
      hasKey={!!mine?.key && !(myResult?.foundKey && !revealed)}
      title="Dungeon · Fragerunde {round.roundNo}"
      {muted}
      offline={client.status !== 'open'}
      onMute={toggleMute}
      onMenu={() => (menuOpen = true)}
    />

    {#if !asking}
      <DungeonPhoneHeads {view} {round} {me} ids={heads} {revealed} canSkip={isHost && playing} onSkip={skip} size={heads.length > 8 ? 20 : 24} />
    {/if}

    {#if asking && round.myQuestion && myQuestionDoor}
      <!-- Frage hinter der eigenen Tür -->
      <div class="min-h-0 flex-1">
        {#key round.myQuestion.doorId}
          <DungeonQuestion {view} question={round.myQuestion} door={myQuestionDoor} />
        {/key}
      </div>
    {:else if inScene && mine}
      <!-- Szene im eigenen Raum -->
      <div class="relative min-h-0 flex-1">
        <DungeonScene {view} {round} roomIndex={myRoom} meId={me} interactive={canChoose} selected={myWalk?.doorId ?? null} onPick={pick} fill />
      </div>

      <div class="panel flex min-h-[8.25rem] shrink-0 flex-col justify-center rounded-2xl p-3">
        {#if round.stage === 'choosing' && canChoose}
          {#if selectedDoor}
            {@const tr = triesOf(selectedDoor)}
            <div class="mb-2.5 flex items-start gap-2.5" in:fade={{ duration: 150 }}>
              <span class="icon grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg">{doorIcon(selectedDoor)}</span>
              <div class="min-w-0 flex-1">
                <p class="flex items-baseline gap-2 text-[0.65rem] font-extrabold uppercase tracking-wider text-amber-300/80">
                  <span class="truncate">{doorFormat(selectedDoor)}</span>
                  {#if tr.bad > 0 || tr.ok > 0}
                    <span class="ml-auto shrink-0 normal-case tracking-normal text-amber-50/50" title="Spuren an der Tür">
                      {#if tr.ok > 0}<span class="text-emerald-300/90">✓{tr.ok}</span>{/if}
                      {#if tr.bad > 0}<span class="ml-1 text-rose-300/90">✗{tr.bad}</span>{/if}
                    </span>
                  {/if}
                </p>
                <p class="truncate text-[0.95rem] font-black leading-tight text-amber-50">{selectedDoor.title}</p>
                <p class="truncate text-[0.72rem] text-amber-50/55">
                  {selectedLocked ? 'Für dich verschlossen. Nur der Schlüssel öffnet sie.' : doorHint(selectedDoor)}
                </p>
              </div>
            </div>
            <div class="flex gap-2">
              {#if !selectedLocked}
                <button class="go min-w-0 flex-1 rounded-2xl px-3 py-3.5 text-[0.95rem] font-extrabold" disabled={!arrived} onclick={() => enter(false)}>
                  {arrived ? 'Durch die Tür gehen' : 'Unterwegs …'}
                </button>
              {/if}
              {#if mine.key}
                <button
                  class="key flex items-center justify-center gap-1.5 rounded-2xl px-3 py-3.5 text-[0.9rem] font-extrabold {selectedLocked ? 'flex-1' : 'shrink-0'}"
                  disabled={!arrived}
                  aria-label="Mit Schlüssel aufschließen"
                  onclick={() => enter(true)}
                >
                  <DungeonKeyIcon size={18} class="-rotate-45" />
                  {selectedLocked ? 'Mit Schlüssel aufschließen' : 'Aufschließen'}
                </button>
              {/if}
            </div>
            {#if mine.key && !keyTipSeen}
              <p class="mt-2 text-center text-[0.7rem] font-semibold text-amber-200/70">Der Schlüssel öffnet jede Tür ohne Frage, aber nur einmal.</p>
            {/if}
          {:else}
            <div class="flex h-full flex-col items-center justify-center gap-1 py-2 text-center">
              <p class="text-[1rem] font-black text-amber-50">Wähle eine Tür</p>
              <p class="text-[0.75rem] text-amber-50/55">
                {#if mine.key}
                  Du hast einen Schlüssel: er öffnet jede Tür ohne Frage, nur einmal.
                {:else if mine.locked.length > 0}
                  {openCount} von {myDoors.length} Türen sind für dich noch offen.
                {:else}
                  Tippe sie an. Auf dem Schild steht, was dahinter wartet.
                {/if}
              </p>
            </div>
          {/if}
        {:else if round.stage === 'choosing' && iSkip}
          {@render info('Du setzt diese Runde aus', 'Der Host ist ohne dich weitergegangen. Gleich bist du wieder dabei.')}
        {:else if round.stage === 'choosing'}
          {@render info(myWalk?.key ? 'Der Schlüssel steckt' : 'Du stehst in der Tür', waiting.length > 0 ? 'Es geht los, sobald alle gewählt haben.' : 'Gleich geht es los …', waiting)}
        {:else if round.stage === 'answering'}
          {#if iSkip}
            {@render info('Du setzt diese Runde aus', 'Warte auf die anderen …', waiting)}
          {:else if myWalk?.key}
            {@render info('Aufgeschlossen', 'Du kommst ohne Frage durch. Warte auf die anderen …', waiting)}
          {:else}
            <div class="flex flex-col items-center gap-1.5 py-1 text-center">
              <p class="text-[0.75rem] font-semibold text-amber-50/55">Deine Antwort liegt hinter der Tür …</p>
              <p class="answer max-w-full truncate rounded-xl px-3 py-1 text-[1rem] font-black text-amber-100">{round.myAnswer ?? '–'}</p>
              {@render stillBusy(waiting)}
            </div>
          {/if}
        {:else if round.stage === 'result'}
          {#if !revealed}
            <div class="flex flex-col items-center justify-center gap-1 py-3 text-center">
              <p class="suspense text-[1.05rem] font-black text-amber-100">Die Türen öffnen sich …</p>
            </div>
          {:else if myResult}
            <div class="mb-2 flex items-center gap-3" in:fade={{ duration: 220 }}>
              <span class="verdict grid h-11 w-11 shrink-0 place-items-center rounded-2xl {myResult.correct ? 'verdict-ok' : 'verdict-bad'}">
                {#if myResult.key}
                  <DungeonKeyIcon size={22} class="-rotate-45" />
                {:else if myResult.correct}
                  <svg viewBox="0 0 24 24" class="h-6 w-6" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>
                {:else}
                  <svg viewBox="0 0 24 24" class="h-6 w-6" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" /></svg>
                {/if}
              </span>
              <div class="min-w-0 flex-1">
                {#if myResult.correct}
                  <p class="text-[1.15rem] font-black leading-tight text-emerald-300">{myResult.key ? 'Aufgeschlossen!' : 'Richtig!'}</p>
                  <p class="text-[0.8rem] font-semibold text-amber-50/70">{mine.status === 'out' ? 'Du hast den Ausgang erreicht!' : `Weiter in Raum ${mine.room + 1} von ${rooms}`}</p>
                {:else if mine.status === 'eliminated'}
                  <p class="text-[1.15rem] font-black leading-tight text-rose-300">Falsch. Alle Türen zu.</p>
                  <p class="text-[0.8rem] font-semibold text-amber-50/70">Du bist ausgeschieden und schaust jetzt zu.</p>
                {:else if myResult.foundKey}
                  <p class="text-[1.15rem] font-black leading-tight text-rose-300">Falsch, Tür zu.</p>
                  <p class="flex items-center gap-1 text-[0.8rem] font-bold text-amber-300"><DungeonKeyIcon size={15} class="-rotate-45" /> Aber du hast einen Schlüssel gefunden!</p>
                {:else}
                  <p class="text-[1.15rem] font-black leading-tight text-rose-300">Falsch. Die Tür bleibt zu.</p>
                  <p class="text-[0.8rem] font-semibold text-amber-50/70">Noch {openCount} {openCount === 1 ? 'Tür' : 'Türen'} in Raum {mine.room + 1} offen.</p>
                {/if}
              </div>
            </div>
            <DungeonPhoneCountdown nextAt={round.nextAt} label={nextLabel} onNext={isHost && playing ? next : null} />
          {:else}
            <p class="mb-2 text-center text-[0.85rem] font-semibold text-amber-50/70">Du hast diese Runde ausgesetzt.</p>
            <DungeonPhoneCountdown nextAt={round.nextAt} label={nextLabel} onNext={isHost && playing ? next : null} />
          {/if}
        {/if}
      </div>
    {:else}
      <!-- Draußen, ausgeschieden, moderierender Host oder Zuschauer: alle Räume auf einen Blick -->
      {#if mine}
        <div class="panel flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5">
          {#if mine.status === 'out'}
            <span class="sun grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg">{place === 1 ? '👑' : place ? `${place}.` : '☀'}</span>
            <div class="min-w-0">
              <p class="text-[1rem] font-black leading-tight text-amber-200">Draußen!</p>
              <p class="text-[0.75rem] text-amber-50/60">Nach {mine.exitRound} Fragerunden{place ? `, im Moment Platz ${place}` : ''}. Schau den anderen zu.</p>
            </div>
          {:else}
            <span class="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/5 text-amber-50/60">
              <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true"><path d="M7 4v16M12 4v16M17 4v16M4 8h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
            </span>
            <div class="min-w-0">
              <p class="text-[1rem] font-black leading-tight text-amber-50">Ausgeschieden in Raum {mine.room + 1}</p>
              <p class="text-[0.75rem] text-amber-50/60">Alle Türen zu. Schau den anderen zu, die Lösungen gibt es am Ende.</p>
            </div>
          {/if}
        </div>
      {/if}
      <div class="min-h-0 flex-1">
        <DungeonPhoneOverview {view} {round} highlight={mine && mine.status !== 'out' ? mine.room : null} />
      </div>
      <div class="panel shrink-0 rounded-2xl px-3 py-2.5">
        {#if round.stage === 'result' && revealed}
          <DungeonPhoneCountdown nextAt={round.nextAt} label={nextLabel} onNext={isHost && playing ? next : null} />
        {:else}
          <div class="flex items-center gap-2">
            <p class="min-w-0 flex-1 truncate text-[0.85rem] font-bold text-amber-50/80">{stageText}</p>
            {#if isHost && playing && waiting.length > 0}
              <div class="flex shrink-0 gap-1.5">
                {#each waiting.slice(0, 2) as id (id)}
                  <button class="chip flex items-center gap-1 rounded-xl py-1.5 pl-1.5 pr-2.5 text-[0.72rem] font-extrabold" onclick={() => skip(id)}>
                    <PlayerHead {view} {id} size={16} />Ohne {playerName(view, id)}
                  </button>
                {/each}
                {#if waiting.length > 2}
                  <button class="chip rounded-xl px-2.5 py-1.5 text-[0.72rem] font-extrabold" onclick={() => (menuOpen = true)}>+{waiting.length - 2}</button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if menuOpen}
      <DungeonPhoneMenu {view} {muted} waiting={playing ? waiting : []} onMute={toggleMute} onSkip={(id) => { skip(id); menuOpen = false; }} onClose={() => (menuOpen = false)} />
    {/if}
  </div>
</div>

{#snippet info(title: string, sub: string, busy: string[] = [])}
  <div class="flex flex-col items-center justify-center gap-1 py-1 text-center">
    <p class="text-[1rem] font-black text-amber-50">{title}</p>
    <p class="text-[0.75rem] text-amber-50/55">{sub}</p>
    {@render stillBusy(busy)}
  </div>
{/snippet}

{#snippet stillBusy(ids: string[])}
  {#if ids.length > 0}
    <div class="mt-0.5 flex items-center justify-center gap-1.5 text-[0.7rem] font-semibold text-amber-50/45">
      <span>{round.stage === 'choosing' ? 'es wählen noch' : 'es antworten noch'}</span>
      {#each ids.slice(0, 6) as id (id)}<PlayerHead {view} {id} size={18} />{/each}
      {#if ids.length > 6}<span>+{ids.length - 6}</span>{/if}
    </div>
  {/if}
{/snippet}

<style>
  :global(html.dungeon-lock),
  :global(html.dungeon-lock body) {
    overflow: hidden;
    overscroll-behavior: none;
  }
  .dg-full {
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(120, 72, 24, 0.22), transparent 60%),
      linear-gradient(180deg, #14100c, #0b0907);
    -webkit-touch-callout: none;
  }
  .panel {
    background: linear-gradient(180deg, rgba(34, 27, 20, 0.92), rgba(22, 17, 12, 0.94));
    box-shadow:
      inset 0 1px 0 rgba(255, 226, 170, 0.1),
      inset 0 0 0 1px rgba(255, 226, 170, 0.08);
  }
  .icon {
    background: rgba(246, 196, 83, 0.12);
    color: #ffd36b;
    box-shadow: inset 0 0 0 1px rgba(246, 196, 83, 0.3);
  }
  .go {
    background: linear-gradient(180deg, #f7cd6a, #e09a2e);
    color: #2a1904;
    box-shadow:
      0 3px 0 #8a5512,
      inset 0 1px 0 rgba(255, 255, 255, 0.45);
    -webkit-tap-highlight-color: transparent;
    transition: transform 90ms ease, box-shadow 90ms ease;
  }
  .go:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  }
  .go:disabled {
    background: rgba(255, 236, 200, 0.08);
    color: rgba(255, 236, 200, 0.4);
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
  }
  .key {
    background: rgba(246, 196, 83, 0.1);
    color: #ffd36b;
    box-shadow:
      inset 0 0 0 1.5px rgba(246, 196, 83, 0.55),
      0 3px 0 rgba(0, 0, 0, 0.4);
    -webkit-tap-highlight-color: transparent;
  }
  .key:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: inset 0 0 0 1.5px rgba(246, 196, 83, 0.7);
  }
  .key:disabled {
    opacity: 0.45;
  }
  .answer {
    background: rgba(246, 196, 83, 0.1);
    box-shadow: inset 0 0 0 1px rgba(246, 196, 83, 0.3);
  }
  .verdict-ok {
    background: rgba(52, 211, 153, 0.14);
    color: #6ee7b7;
    box-shadow: inset 0 0 0 1px rgba(52, 211, 153, 0.4);
  }
  .verdict-bad {
    background: rgba(251, 113, 133, 0.12);
    color: #fda4af;
    box-shadow: inset 0 0 0 1px rgba(251, 113, 133, 0.4);
  }
  .sun {
    background: radial-gradient(circle at 50% 40%, #fff4c8, #f6c453 60%, #b8741f);
    color: #3a2604;
    font-weight: 900;
    box-shadow: 0 0 16px rgba(246, 196, 83, 0.4);
  }
  .chip {
    background: rgba(246, 196, 83, 0.12);
    color: #ffd36b;
    box-shadow: inset 0 0 0 1px rgba(246, 196, 83, 0.35);
  }
  .suspense {
    animation: breathe 1.1s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .suspense {
      animation: none;
    }
  }
</style>
