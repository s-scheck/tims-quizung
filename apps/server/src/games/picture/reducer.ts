import { isValidGuess, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { PictureRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, removePlayerFromRound, scheduleTurnTimer, settleTurn } from '../common.ts';

/** Anzeige des Ergebnisses, bis der Zug wechselt. */
export const RESULT_MS = 1500;

export function pictureRound(room: Room): PictureRound | null {
  return room.round?.game === 'picture' ? room.round : null;
}

export function startPictureRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'picture') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  // Der Host kennt die Antworten und prüft jeden Tipp, also rät er nie mit, auch wenn er laut Lobby mitspielt.
  const turnOrder = buildTurnOrder(room).filter((id) => id !== room.hostId);
  if (turnOrder.length === 0) return fail('invalid_action', 'Bilderrätsel braucht mindestens einen Mitspieler außer dem Host');
  const lives = opts.lives ?? room.defaultLives;
  room.defaultLives = lives;

  room.round = {
    ...baseRound(category, turnOrder),
    game: 'picture',
    category,
    solved: {},
    lives: Object.fromEntries(turnOrder.map((id) => [id, lives])),
    maxLives: lives,
    hits: Object.fromEntries(turnOrder.map((id) => [id, 0])),
    wrongGuesses: [],
    guess: null,
  };
  room.phase = 'playing';
  scheduleTurnTimer(room);
  return OK;
}

export function handlePictureMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'picture_guess':
      return guess(room, playerId, msg.turnNo, msg.fieldId, msg.text);
    case 'picture_judge':
      return judge(room, playerId, msg.turnNo, msg.correct);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function guess(room: Room, playerId: string, turnNo: number, fieldId: string, text: string): Result {
  const round = pictureRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (round.activePlayerId !== playerId) return fail('not_your_turn', 'Du bist nicht dran');
  if (round.turnNo !== turnNo) return fail('invalid_action', 'Zug ist schon vorbei');
  if (round.guess) return fail('invalid_action', 'Ein Tipp wird gerade geprüft');
  if (!round.category.fields.some((f) => f.id === fieldId)) return fail('invalid_action', 'Dieses Feld gibt es nicht');
  if (round.solved[fieldId] !== undefined) return fail('invalid_action', 'Dieses Feld ist schon gelöst');
  const trimmed = text.trim();
  if (!isValidGuess(trimmed)) return fail('bad_message', 'Tipp muss 1 bis 60 Zeichen haben');

  round.turnDeadline = null;
  room.cancelTimer('turn');
  round.guess = { by: playerId, fieldId, text: trimmed, status: 'judging', resolveAt: null, applyAt: null };
  return OK;
}

function judge(room: Room, playerId: string, turnNo: number, correct: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host prüft Tipps');
  const round = pictureRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  const g = round.guess;
  if (!g || g.status !== 'judging') return fail('invalid_action', 'Kein Tipp zu prüfen');
  if (round.turnNo !== turnNo) return fail('invalid_action', 'Zug ist schon vorbei');
  if (correct) {
    round.solved[g.fieldId] = g.by;
    round.hits[g.by] = (round.hits[g.by] ?? 0) + 1;
    g.status = 'correct';
  } else {
    round.wrongGuesses.push({ by: g.by, fieldId: g.fieldId, text: g.text });
    loseLife(round, g.by);
    g.status = 'wrong';
  }
  g.resolveAt = room.now;
  g.applyAt = room.now + RESULT_MS;
  room.cancelTimer('placement');
  room.timers.placement = room.scheduler.schedule(RESULT_MS, () => applyGuess(room));
  return OK;
}

function applyGuess(room: Room): void {
  room.timers.placement = null;
  const round = pictureRound(room);
  const g = round?.guess;
  if (!round || !g || g.status === 'judging') return;
  round.guess = null;
  settleTurn(room, {});
  room.emit();
}

function loseLife(round: PictureRound, playerId: string): void {
  const left = Math.max(0, (round.lives[playerId] ?? 0) - 1);
  round.lives[playerId] = left;
  if (left === 0 && round.turnOrder.includes(playerId) && !round.eliminated.includes(playerId)) {
    round.eliminated.push(playerId);
  }
}

// --------------------------------------------------------- Modul-Hooks

export function isBusy(room: Room): boolean {
  return pictureRound(room)?.guess !== null;
}

export function isRoundComplete(room: Room): boolean {
  const round = pictureRound(room);
  return !!round && round.category.fields.every((f) => round.solved[f.id] !== undefined);
}

export function penalizeActive(room: Room): void {
  const round = pictureRound(room);
  if (round?.activePlayerId) loseLife(round, round.activePlayerId);
}

export function clearTurn(): void {}

export function onReveal(room: Room): void {
  const round = pictureRound(room);
  if (round) round.guess = null;
}

/** Der neue Host prüft ab jetzt: Er fliegt aus der Reihenfolge, ein offener Tipp von ihm verfällt. */
export function onHostChanged(room: Room): void {
  const round = pictureRound(room);
  const host = room.hostId;
  if (!round || host === null || !round.turnOrder.includes(host)) return;
  if (round.guess?.by === host) {
    room.cancelTimer('placement');
    round.guess = null;
  }
  removePlayerFromRound(room, host);
}
