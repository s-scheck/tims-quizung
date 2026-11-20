import type { DungeonRoundView } from '@quiz/shared';
import { dungeonSound, isAudioMuted, setAudioMuted, wakeAudio } from './dungeonAudio.ts';
import { dungeonHaptics, setDungeonHaptics } from './dungeonHaptics.ts';
import { dungeonAnimationStart, dungeonRevealAt, dungeonRevealOrder } from './dungeonTiming.ts';

/**
 * Dungeon: Klang und Vibration. Eine Stelle für alle Zuordnungen; das Handy reicht nur den aktuellen Stand durch.
 * Wechsel erkennt `dungeonRoundFeedback` selbst (vorheriger Stand gemerkt), die Ergebnis-Klänge laufen im selben
 * Takt wie die Szene (`dungeonTiming.ts`): erst Herzschlag, dann je Spieler gestaffelt Glocke oder Schlag.
 */

/** Spannungsmoment vor dem Ergebnis: so lange bleiben alle Türen zu, erst dann zeigen Szene und Handy richtig/falsch. */
export const DUNGEON_SUSPENSE_MS = 1700;
/** Abstand, mit dem sich die Türen danach nacheinander öffnen. */
export const DUNGEON_STAGGER_MS = 420;

setDungeonHaptics(!isAudioMuted());

export function isDungeonMuted(): boolean {
  return isAudioMuted();
}

/** Ton und Vibration zusammen stumm schalten (wird gemerkt). */
export function setDungeonMuted(on: boolean): void {
  setAudioMuted(on);
  setDungeonHaptics(!on);
}

/** Audio nach einer Berührung entsperren (iOS). */
export function wakeDungeonAudio(): void {
  wakeAudio();
}

// ------------------------------------------------------------ Stand merken

interface Snapshot {
  roundNo: number;
  stage: DungeonRoundView['stage'];
  myDoor: string | null;
  myConfirmed: boolean;
  /** Türen der anderen im eigenen Raum, um fremde Schritte zu hören. */
  others: string;
}

let prev: Snapshot | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];
let lastTap: Partial<Record<'door' | 'enter' | 'key' | 'answer', number>> = {};

function later(ms: number, fn: () => void): void {
  if (ms <= 0) fn();
  else timers.push(setTimeout(fn, ms));
}

function clearLater(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
}

const tappedRecently = (kind: keyof typeof lastTap, ms = 1500) => Date.now() - (lastTap[kind] ?? 0) < ms;

/** Bei jedem neuen Stand aufrufen: erkennt Wechsel (Laufen, Bestätigen, Ergebnis, Schlüssel) und spielt passend. */
export function dungeonRoundFeedback(round: DungeonRoundView, me: string | null): void {
  const mine = me ? round.players[me] : undefined;
  const myRoom = me && round.results?.[me] ? round.results[me]!.room : (mine?.room ?? -1);
  const myWalk = me ? round.walk[me] : undefined;
  const others = round.turnOrder
    .filter((id) => id !== me && round.players[id]?.room === myRoom && round.players[id]?.status === 'in')
    .map((id) => `${id}:${round.walk[id]?.doorId ?? ''}`)
    .join('|');
  const snap: Snapshot = { roundNo: round.roundNo, stage: round.stage, myDoor: myWalk?.doorId ?? null, myConfirmed: !!myWalk?.confirmed, others };
  const before = prev;
  prev = snap;
  if (!before) {
    // Erster Stand nach dem Laden: nur ein frisch begonnenes Ergebnis wird noch gespielt.
    if (round.stage === 'result') playResult(round, me, false);
    return;
  }
  const stageChanged = before.stage !== snap.stage || before.roundNo !== snap.roundNo;
  if (stageChanged) clearLater();

  if (round.stage === 'result') {
    if (stageChanged) playResult(round, me, before.roundNo === snap.roundNo);
    return;
  }
  if (round.stage === 'choosing') {
    if (stageChanged && before.stage === 'result') dungeonSound.newRound();
    if (snap.myDoor && snap.myDoor !== before.myDoor && !tappedRecently('door')) dungeonSound.steps(4, 0.07);
    else if (snap.others !== before.others && before.roundNo === snap.roundNo) dungeonSound.steps(3, 0.03);
    if (snap.myConfirmed && !before.myConfirmed && !tappedRecently('enter') && !tappedRecently('key')) {
      dungeonSound.creak();
      dungeonHaptics.enter();
    }
  }
}

/** Ergebnis: Herzschlag in der Spannung, dann gestaffelt je Spieler im eigenen Raum, im Takt der Szene. */
function playResult(round: DungeonRoundView, me: string | null, live: boolean): void {
  const start = dungeonAnimationStart(round, live);
  const myRes = me ? round.results?.[me] : undefined;
  const room = myRes?.room ?? (me ? round.players[me]?.room : undefined);
  if (room === undefined) return;
  const order = dungeonRevealOrder(round, room, me);
  if (order.length === 0) return;
  // Ohne Animation (Neuladen, weniger Bewegung): nur das eigene Ergebnis knapp bestätigen.
  const offset = start === null ? null : Date.now() - start;
  if (offset === null) return;
  const suspenseLeft = dungeonRevealAt(0) - offset;
  if (suspenseLeft > 300) {
    dungeonSound.suspense(suspenseLeft);
    dungeonHaptics.heartbeat();
  }
  order.forEach((id, k) => {
    const res = round.results![id]!;
    const own = id === me;
    const gain = own ? 1 : 0.45;
    later(dungeonRevealAt(k) - offset, () => {
      if (res.key) dungeonSound.key(true);
      if (res.correct) {
        dungeonSound.correct(gain);
        if (own) dungeonHaptics.correct();
      } else {
        dungeonSound.wrong(gain);
        if (own) dungeonHaptics.wrong();
      }
    });
    if (own && res.foundKey) {
      later(dungeonRevealAt(k) - offset + 750, () => {
        dungeonSound.key(false);
        dungeonHaptics.key();
      });
    }
    if (own && res.correct && round.players[id]?.status === 'out') later(dungeonRevealAt(k) - offset + 900, () => {
      dungeonSound.exit();
      dungeonHaptics.exit();
    });
  });
}

/** Eigene Handlungen sofort hörbar machen, ohne auf den Server zu warten. */
export function dungeonTapFeedback(kind: 'door' | 'enter' | 'key' | 'answer'): void {
  wakeAudio();
  lastTap = { ...lastTap, [kind]: Date.now() };
  switch (kind) {
    case 'door':
      dungeonSound.steps(4, 0.07);
      dungeonHaptics.tap();
      break;
    case 'enter':
      dungeonSound.creak();
      dungeonHaptics.enter();
      break;
    case 'key':
      dungeonSound.key(true);
      dungeonHaptics.key();
      break;
    case 'answer':
      dungeonSound.answer();
      dungeonHaptics.tap();
      break;
  }
}
