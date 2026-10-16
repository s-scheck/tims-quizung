import { morseSchedule, type MorseRoundView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { morsePoints, morseRanking, morseRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Der Host ist bei Morse immer privilegiert, weil er das Wort getippt hat.
 * Spieler sehen Struktur, Löser-Leiste und eigene Versuche; Wort, fremde Versuche und Punkte erst in der Auflösung.
 */
export function morseRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = morseRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && viewerId === room.hostId;
  const showAll = revealed || privileged;

  const view: MorseRoundView = {
    game: 'morse',
    category: { id: r.category.id, title: r.category.title, question: 'Was wird gemorst?' },
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    startedAt: r.startedAt,
    lengths: r.word.split(' ').map((w) => w.length),
    codeShown: r.codeShown,
    tableShown: r.tableShown,
    plays: r.plays,
    lightShown: r.lightShown,
    // Die Blinkzeiten gehen an alle, sie sind das Licht. Der Code-Text bleibt bis zur Freigabe beim Host.
    playback: r.playback ? { ...r.playback, beeps: morseSchedule(r.code, r.playback.unitMs) } : null,
    solved: morseRanking(r),
  };
  if (showAll || r.codeShown) view.code = r.code;
  if (showAll) {
    view.word = r.word;
    view.attempts = Object.fromEntries(r.turnOrder.map((id) => [id, (r.attempts[id] ?? []).map((a) => ({ ...a }))]));
    view.points = morsePoints(r);
  }
  if (privileged) view.privileged = true;
  const mine = viewerId !== null ? r.attempts[viewerId] : undefined;
  if (mine) view.myAttempts = mine.map((a) => ({ ...a }));
  return view;
}
