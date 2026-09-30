import {
  isValidScore,
  nextActivePlayer,
  remainingPlayers,
  rotateStartPlayer,
  rotateTo,
  type ClientMsg,
  type RoundResult,
} from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../rooms/room.ts';
import type { BaseRound } from '../rooms/state.ts';
import { fail, OK, type Result } from '../rooms/result.ts';

// ------------------------------------------------------------ Rundenstart

/** Zugreihenfolge für eine neue Runde: verbundene Mitspieler ohne moderierenden Host, Startspieler rotiert. */
export function buildTurnOrder(room: Room): string[] {
  const playing = room.playingPlayers();
  const allIds = playing.map((p) => p.id);
  const connectedIds = playing.filter((p) => p.connected).map((p) => p.id);
  const eligible = connectedIds.length > 0 ? connectedIds : allIds;
  if (eligible.length === 0) return [];
  const startPlayerId = pickStartPlayer(allIds, eligible, room.lastStartPlayerId);
  room.lastStartPlayerId = startPlayerId;
  return rotateTo(eligible, startPlayerId);
}

/** Startspieler rotiert über alle Mitspieler; ist der Kandidat nicht spielbereit, rückt der nächste nach. */
function pickStartPlayer(allIds: string[], eligible: string[], last: string | null): string | null {
  if (eligible.length === 0) return null;
  let candidate = rotateStartPlayer(allIds, last);
  for (let i = 0; i < allIds.length && candidate !== null; i++) {
    if (eligible.includes(candidate)) return candidate;
    candidate = rotateStartPlayer(allIds, candidate);
  }
  return eligible[0] ?? null;
}

export function baseRound(category: Category, turnOrder: string[]): BaseRound {
  return {
    category,
    turnOrder,
    turnNo: 1,
    activePlayerId: turnOrder[0] ?? null,
    eliminated: [],
    turnDeadline: null,
    soloMode: turnOrder.length === 1,
  };
}

// ------------------------------------------------------------------ Timer

export function scheduleTurnTimer(room: Room): void {
  room.cancelTimer('turn');
  const round = room.round;
  if (!round || room.phase !== 'playing') return;
  const seconds = room.settings.timerSeconds;
  if (seconds <= 0 || round.activePlayerId === null) {
    round.turnDeadline = null;
    return;
  }
  const turnNo = round.turnNo;
  round.turnDeadline = room.now + seconds * 1000;
  room.timers.turn = room.scheduler.schedule(seconds * 1000, () => timerExpired(room, turnNo));
}

function timerExpired(room: Room, turnNo: number): void {
  room.timers.turn = null;
  const round = room.round;
  const game = room.game;
  if (room.phase !== 'playing' || !round || !game || round.turnNo !== turnNo || game.isBusy(room)) return;
  game.penalizeActive(room);
  settleTurn(room, {});
  room.emit();
}

// ------------------------------------------------------------- Zugwechsel

/**
 * Nach einem abgeschlossenen Zug: Runde beenden, Host fragen oder weitergeben.
 * `forcedNext` überschreibt die Berechnung des nächsten Spielers (Spieler hat den Raum verlassen).
 */
export function settleTurn(room: Room, opts: { forcedNext?: string | null }): void {
  const round = room.round;
  const game = room.game;
  if (!round || !game) return;
  round.turnNo++;
  if (game.isRoundComplete(room)) return toReveal(room);
  const remaining = remainingPlayers(round.turnOrder, round.eliminated);
  if (remaining.length === 0) return toReveal(room);
  if (remaining.length === 1 && !round.soloMode) return askHost(room, remaining[0]!);
  round.activePlayerId =
    opts.forcedNext !== undefined ? opts.forcedNext : nextActivePlayer(round.turnOrder, round.activePlayerId, round.eliminated);
  scheduleTurnTimer(room);
}

function askHost(room: Room, lastPlayerId: string): void {
  const round = room.round;
  if (!round) return;
  room.cancelTimer('turn');
  room.phase = 'host_decision';
  round.activePlayerId = lastPlayerId;
  round.turnDeadline = null;
}

export function toReveal(room: Room): void {
  room.cancelAllTimers();
  const round = room.round;
  room.phase = 'reveal';
  if (!round) return;
  round.activePlayerId = null;
  round.turnDeadline = null;
  room.game?.onReveal(room);
}

/** Ein Spieler ist aus dem Raum verschwunden: aus der Runde nehmen und den Ablauf reparieren. */
export function removePlayerFromRound(room: Room, playerId: string): void {
  const round = room.round;
  const game = room.game;
  if (!round || !game) return;
  if (room.phase !== 'playing' && room.phase !== 'host_decision') return;
  if (!round.turnOrder.includes(playerId)) return;

  const wasActive = round.activePlayerId === playerId;
  const successor = nextActivePlayer(round.turnOrder, playerId, [...round.eliminated, playerId]);
  round.turnOrder = round.turnOrder.filter((id) => id !== playerId);
  round.eliminated = round.eliminated.filter((id) => id !== playerId);

  if (room.phase === 'host_decision') {
    if (remainingPlayers(round.turnOrder, round.eliminated).length === 0) toReveal(room);
    return;
  }
  // Eine laufende Auflösung räumt danach selbst auf.
  if (game.isBusy(room)) return;
  if (wasActive) {
    room.cancelTimer('turn');
    game.clearTurn(room);
    settleTurn(room, { forcedNext: successor });
    return;
  }
  const remaining = remainingPlayers(round.turnOrder, round.eliminated);
  if (remaining.length === 0) toReveal(room);
  else if (remaining.length === 1 && !round.soloMode) askHost(room, remaining[0]!);
}

// ------------------------------------------------------- gemeinsame Aktionen

/** Behandelt spielunabhängige Nachrichten. Gibt `undefined` zurück, wenn die Nachricht nicht gemeinsam ist. */
export function handleCommon(room: Room, playerId: string, msg: ClientMsg): Result | undefined {
  switch (msg.type) {
    case 'skip_turn':
      return skipTurn(room, playerId, msg.turnNo);
    case 'host_decision':
      return hostDecision(room, playerId, msg.continue);
    case 'to_scoring':
      return toScoring(room, playerId);
    case 'submit_scores':
      return submitScores(room, playerId, msg.scores);
    case 'next_round':
      return nextRound(room, playerId);
    case 'end_game':
      return endGame(room, playerId);
    default:
      return undefined;
  }
}

function skipTurn(room: Room, playerId: string, turnNo: number): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host darf einen Zug überspringen');
  const round = room.round;
  const game = room.game;
  if (room.phase !== 'playing' || !round || !game) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (round.turnNo !== turnNo) return fail('invalid_action', 'Zug ist schon vorbei');
  if (game.isBusy(room)) return fail('invalid_action', 'Auflösung läuft noch');
  room.cancelTimer('turn');
  game.penalizeActive(room);
  settleTurn(room, {});
  return OK;
}

function hostDecision(room: Room, playerId: string, cont: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host entscheidet');
  const round = room.round;
  const game = room.game;
  if (room.phase !== 'host_decision' || !round || !game) return fail('invalid_action', 'Keine Entscheidung offen');
  if (!cont) {
    toReveal(room);
    return OK;
  }
  const remaining = remainingPlayers(round.turnOrder, round.eliminated);
  if (remaining.length === 0 || game.isRoundComplete(room)) {
    toReveal(room);
    return OK;
  }
  round.soloMode = true;
  room.phase = 'playing';
  round.activePlayerId = remaining[0]!;
  round.turnNo++;
  game.clearTurn(room);
  scheduleTurnTimer(room);
  return OK;
}

function toScoring(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host trägt Punkte ein');
  if (room.phase !== 'reveal') return fail('invalid_action', 'Erst die Auflösung ansehen');
  room.phase = 'scoring';
  return OK;
}

function submitScores(room: Room, playerId: string, scores: Record<string, number>): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host trägt Punkte ein');
  const round = room.round;
  if (room.phase !== 'scoring' || !round || !room.gameId) return fail('invalid_action', 'Gerade keine Punkteeingabe');
  const deltas: Record<string, number> = {};
  for (const p of room.playingPlayers()) {
    const raw = scores[p.id];
    if (raw !== undefined && !isValidScore(raw)) return fail('bad_message', 'Punkte müssen ganze Zahlen sein');
    const delta = raw ?? 0;
    deltas[p.id] = delta;
    room.scores[p.id] = (room.scores[p.id] ?? 0) + delta;
  }
  const result: RoundResult = {
    gameId: room.gameId,
    categoryId: round.category.id,
    categoryTitle: round.category.title,
    survivors: remainingPlayers(round.turnOrder, round.eliminated),
    eliminatedOrder: [...round.eliminated],
    scores: deltas,
  };
  room.rounds.push(result);
  room.phase = 'scoreboard';
  return OK;
}

function nextRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host startet die nächste Runde');
  if (room.phase !== 'scoreboard') return fail('invalid_action', 'Erst Punkte eintragen');
  room.round = null;
  room.phase = 'choosing_category';
  return OK;
}

function endGame(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet das Spiel');
  if (room.phase !== 'scoreboard' && room.phase !== 'choosing_category') {
    return fail('invalid_action', 'Beenden geht nach der Punkteeingabe oder vor einer Runde');
  }
  room.cancelAllTimers();
  room.round = null;
  room.phase = 'finished';
  return OK;
}
