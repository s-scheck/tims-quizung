import {
  compactMorseText,
  MORSE_PLAY_LEAD_MS,
  MORSE_POINTS,
  MORSE_SPEEDS,
  MORSE_WORD_MAX,
  normalizeMorseText,
  toMorse,
  type ClientMsg,
} from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { MorseRound, PseudoCategory } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, toReveal } from '../common.ts';

export const MORSE_CATEGORY: PseudoCategory = { kind: 'none', id: 'morse', title: 'Morse' };

export function morseRound(room: Room): MorseRound | null {
  return room.round?.game === 'morse' ? room.round : null;
}

export function startMorseRound(room: Room, _category: unknown, opts: StartRoundOptions): Result {
  const word = normalizeMorseText(opts.word ?? '');
  if (word.length === 0) return fail('bad_message', 'Bitte ein Wort aus Buchstaben oder Ziffern eingeben');
  if (word.length > MORSE_WORD_MAX) return fail('bad_message', `Höchstens ${MORSE_WORD_MAX} Zeichen`);
  // Der Host kennt das Wort und bedient den Ton, also rät er nie mit.
  const turnOrder = buildTurnOrder(room).filter((id) => id !== room.hostId);
  if (turnOrder.length === 0) return fail('invalid_action', 'Morse braucht mindestens einen Mitspieler außer dem Host');

  room.round = {
    ...baseRound(MORSE_CATEGORY, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'morse',
    category: MORSE_CATEGORY,
    word,
    code: toMorse(word),
    startedAt: room.now,
    attempts: {},
    solved: {},
    plays: 0,
    playback: null,
    lightShown: false,
    codeShown: false,
    tableShown: false,
  };
  room.phase = 'playing';
  return OK;
}

export function handleMorseMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'morse_guess':
      return guess(room, playerId, msg.text);
    case 'morse_accept':
      return accept(room, playerId, msg.playerId, msg.index);
    case 'morse_play':
      return hostToggle(room, playerId, (r) => {
        r.plays++;
        r.playback = { id: r.plays, startAt: room.now + MORSE_PLAY_LEAD_MS, unitMs: MORSE_SPEEDS[msg.speed] };
      });
    case 'morse_stop':
      return hostToggle(room, playerId, (r) => void (r.playback = null));
    case 'morse_show_light':
      return hostToggle(room, playerId, (r) => void (r.lightShown = msg.shown));
    case 'morse_show_code':
      return hostToggle(room, playerId, (r) => void (r.codeShown = msg.shown));
    case 'morse_show_table':
      return hostToggle(room, playerId, (r) => void (r.tableShown = msg.shown));
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function playingRound(room: Room): MorseRound | null {
  const round = morseRound(room);
  return room.phase === 'playing' && round ? round : null;
}

function guess(room: Room, playerId: string, text: string): Result {
  const round = playingRound(room);
  if (!round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (!round.turnOrder.includes(playerId)) return fail('not_allowed', 'Du bist in dieser Runde nicht dabei');
  if (round.solved[playerId] !== undefined) return fail('invalid_action', 'Du hast das Wort schon');
  const normalized = normalizeMorseText(text);
  if (normalized.length === 0) return fail('bad_message', 'Bitte einen Tipp eingeben');
  const correct = compactMorseText(normalized) === compactMorseText(round.word);
  const at = room.now;
  (round.attempts[playerId] ??= []).push({ text: normalized, at, correct });
  if (correct) round.solved[playerId] = at;
  return OK;
}

/** Der Host zählt einen Fehlversuch nachträglich als richtig, die Zeit des Versuchs gilt. */
function accept(room: Room, byId: string, playerId: string, index: number): Result {
  if (!room.isHost(byId)) return fail('not_host', 'Nur der Host gibt Versuche frei');
  const round = playingRound(room);
  if (!round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  const attempt = round.attempts[playerId]?.[index];
  if (!attempt) return fail('invalid_action', 'Diesen Versuch gibt es nicht');
  if (round.solved[playerId] !== undefined) return fail('invalid_action', 'Der Spieler hat das Wort schon');
  attempt.correct = true;
  round.solved[playerId] = attempt.at;
  return OK;
}

function hostToggle(room: Room, byId: string, apply: (round: MorseRound) => void): Result {
  if (!room.isHost(byId)) return fail('not_host', 'Nur der Host steuert die Wiedergabe');
  const round = playingRound(room);
  if (!round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  apply(round);
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  if (!playingRound(room)) return fail('invalid_action', 'Gerade läuft keine Morse-Runde');
  toReveal(room);
  return OK;
}

/** Löser nach Zeit, Platz 1 zuerst. */
export function morseRanking(round: MorseRound): { playerId: string; at: number; rank: number }[] {
  return Object.entries(round.solved)
    .filter(([id]) => round.turnOrder.includes(id))
    .sort((a, b) => a[1] - b[1] || round.turnOrder.indexOf(a[0]) - round.turnOrder.indexOf(b[0]))
    .map(([playerId, at], i) => ({ playerId, at, rank: i + 1 }));
}

/** Spielpunkte 3/2/1 für die ersten drei Löser. */
export function morsePoints(round: MorseRound): Record<string, number> {
  const points: Record<string, number> = Object.fromEntries(round.turnOrder.map((id) => [id, 0]));
  for (const entry of morseRanking(round)) points[entry.playerId] = MORSE_POINTS[entry.rank - 1] ?? 0;
  return points;
}

// --------------------------------------------------------- Modul-Hooks

export function onReveal(room: Room): void {
  const round = morseRound(room);
  if (round) round.playback = null;
}

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = morseRound(room);
  if (!round) return;
  delete round.attempts[playerId];
  delete round.solved[playerId];
}
