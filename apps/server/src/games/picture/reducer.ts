import { isValidGuess, normalizeGuess, type ClientMsg, type PictureMode } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { PictureRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, removePlayerFromRound, scheduleRoundTimer, scheduleTurnTimer, settleTurn, toReveal } from '../common.ts';

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
  const mode: PictureMode = opts.mode ?? 'turns';
  const all = mode === 'all';
  const lives = all ? 0 : (opts.lives ?? room.defaultLives);
  if (!all) room.defaultLives = lives;

  room.round = {
    ...baseRound(category, turnOrder),
    game: 'picture',
    category,
    mode,
    solved: {},
    lives: all ? {} : Object.fromEntries(turnOrder.map((id) => [id, lives])),
    maxLives: lives,
    hits: all ? {} : Object.fromEntries(turnOrder.map((id) => [id, 0])),
    wrongGuesses: [],
    guess: null,
    startedAt: room.now,
    answers: {},
    doneAt: {},
    verdicts: {},
    judgeIndex: 0,
    judgeShown: 0,
  };
  room.phase = 'playing';
  if (all) {
    // Niemand ist dran, alle füllen gleichzeitig aus; der Rundentimer beendet die Runde.
    room.round.activePlayerId = null;
    scheduleRoundTimer(room, () => toReveal(room));
  } else {
    scheduleTurnTimer(room);
  }
  return OK;
}

export function handlePictureMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'picture_guess':
      return guess(room, playerId, msg.turnNo, msg.fieldId, msg.text);
    case 'picture_judge':
      return judge(room, playerId, msg.turnNo, msg.correct);
    case 'picture_fill':
      return fill(room, playerId, msg.fieldId, msg.text);
    case 'picture_done':
      return done(room, playerId);
    case 'picture_step':
      return step(room, playerId, msg.index);
    case 'picture_verdict':
      return verdict(room, playerId, msg.playerId, msg.fieldId, msg.correct);
    case 'end_round':
      // Reihum beendet `games/common.ts`; hier landet nur „Alle gleichzeitig“.
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

// ------------------------------------------------------------------ Reihum

function guess(room: Room, playerId: string, turnNo: number, fieldId: string, text: string): Result {
  const round = pictureRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (round.mode === 'all') return fail('invalid_action', 'In dieser Runde füllen alle gleichzeitig aus');
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
  if (round.mode === 'all') return fail('invalid_action', 'In dieser Runde prüfst du erst am Ende');
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

// ------------------------------------------------------- Alle gleichzeitig

/** Laufende Runde im Modus „Alle gleichzeitig“, in der `playerId` noch ausfüllen darf. */
function fillingRound(room: Room, playerId: string): { round: PictureRound } | { error: Result } {
  const round = pictureRound(room);
  if (room.phase !== 'playing' || !round) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  if (round.mode !== 'all') return { error: fail('invalid_action', 'In dieser Runde ist immer einer dran') };
  if (!round.turnOrder.includes(playerId)) return { error: fail('invalid_action', 'Du bist in dieser Runde nicht dabei') };
  if (round.doneAt[playerId] !== undefined) return { error: fail('invalid_action', 'Du bist schon fertig') };
  return { round };
}

function fill(room: Room, playerId: string, fieldId: string, text: string): Result {
  const res = fillingRound(room, playerId);
  if ('error' in res) return res.error;
  const { round } = res;
  if (!round.category.fields.some((f) => f.id === fieldId)) return fail('invalid_action', 'Dieses Feld gibt es nicht');
  const trimmed = text.trim();
  const mine = (round.answers[playerId] ??= {});
  if (trimmed) mine[fieldId] = trimmed;
  else delete mine[fieldId];
  return OK;
}

function done(room: Room, playerId: string): Result {
  const res = fillingRound(room, playerId);
  if ('error' in res) return res.error;
  res.round.doneAt[playerId] = room.now;
  if (allDone(res.round)) toReveal(room);
  return OK;
}

function allDone(round: PictureRound): boolean {
  return round.turnOrder.every((id) => round.doneAt[id] !== undefined);
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  const round = pictureRound(room);
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade läuft keine Runde');
  toReveal(room);
  return OK;
}

/** Auflösung im Modus „Alle gleichzeitig“, in der der Host prüft. */
function judgingRound(room: Room, playerId: string): { round: PictureRound } | { error: Result } {
  if (!room.isHost(playerId)) return { error: fail('not_host', 'Nur der Host prüft') };
  const round = pictureRound(room);
  if (room.phase !== 'reveal' || !round) return { error: fail('invalid_action', 'Prüfen geht nur in der Auflösung') };
  if (round.mode !== 'all') return { error: fail('invalid_action', 'Diese Runde hat keine Prüfung am Ende') };
  return { round };
}

/** Der Host ruft ein Feld auf. Vorwärts geht nur Schritt für Schritt, zurück zu jedem schon aufgerufenen. */
function step(room: Room, playerId: string, index: number): Result {
  const res = judgingRound(room, playerId);
  if ('error' in res) return res.error;
  const { round } = res;
  if (index >= round.category.fields.length || index > round.judgeShown) return fail('invalid_action', 'Dieses Feld ist noch nicht dran');
  round.judgeIndex = index;
  round.judgeShown = Math.max(round.judgeShown, index + 1);
  return OK;
}

function verdict(room: Room, playerId: string, targetId: string, fieldId: string, correct: boolean): Result {
  const res = judgingRound(room, playerId);
  if ('error' in res) return res.error;
  const { round } = res;
  if (!round.turnOrder.includes(targetId)) return fail('invalid_action', 'Dieser Spieler ist nicht dabei');
  const idx = round.category.fields.findIndex((f) => f.id === fieldId);
  if (idx === -1) return fail('invalid_action', 'Dieses Feld gibt es nicht');
  if (idx >= round.judgeShown) return fail('invalid_action', 'Dieses Feld ist noch nicht aufgerufen');
  (round.verdicts[targetId] ??= {})[fieldId] = correct;
  return OK;
}

/** Vorbelegung der Urteile: Groß-/Kleinschreibung, Umlaute und Satzzeichen zählen nicht, leer ist falsch. */
function matches(text: string | undefined, answer: string): boolean {
  if (!text) return false;
  const g = normalizeGuess(text);
  return g.length > 0 && g === normalizeGuess(answer);
}

// --------------------------------------------------------- Modul-Hooks

export function isTurnBasedRound(room: Room): boolean {
  return pictureRound(room)?.mode !== 'all';
}

export function isBusy(room: Room): boolean {
  const round = pictureRound(room);
  return !!round && round.mode !== 'all' && round.guess !== null;
}

export function isRoundComplete(room: Room): boolean {
  const round = pictureRound(room);
  if (!round) return false;
  if (round.mode === 'all') return allDone(round);
  return round.category.fields.every((f) => round.solved[f.id] !== undefined);
}

/** Punkte erst, wenn der Host in „Alle gleichzeitig“ jedes Feld aufgerufen hat. */
export function isRevealComplete(room: Room): boolean {
  const round = pictureRound(room);
  return !round || round.mode !== 'all' || round.judgeShown >= round.category.fields.length;
}

export function penalizeActive(room: Room): void {
  const round = pictureRound(room);
  if (round?.activePlayerId) loseLife(round, round.activePlayerId);
}

export function clearTurn(): void {}

export function onReveal(room: Room): void {
  const round = pictureRound(room);
  if (!round) return;
  round.guess = null;
  if (round.mode !== 'all') return;
  round.verdicts = {};
  for (const id of round.turnOrder) {
    const mine = round.answers[id] ?? {};
    round.verdicts[id] = Object.fromEntries(round.category.fields.map((f) => [f.id, matches(mine[f.id], f.answer)]));
  }
  round.judgeIndex = 0;
  round.judgeShown = Math.min(1, round.category.fields.length);
}

/** Ein Teilnehmer ist weg: Seine Antworten verfallen. Sind die übrigen schon fertig, geht es zur Auflösung. */
export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = pictureRound(room);
  if (!round) return;
  delete round.answers[playerId];
  delete round.doneAt[playerId];
  delete round.verdicts[playerId];
  if (round.mode === 'all' && room.phase === 'playing' && round.turnOrder.length > 0 && allDone(round)) toReveal(room);
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
