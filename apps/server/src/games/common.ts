import {
  isValidScore,
  nextActivePlayer,
  remainingPlayers,
  rotateStartPlayer,
  rotateTo,
  type ClientMsg,
  type RoundResult,
  type ShowRevealView,
} from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../rooms/room.ts';
import type { BaseRound } from '../rooms/state.ts';
import { fail, OK, type Result } from '../rooms/result.ts';

// ------------------------------------------------------------ Rundenstart

/**
 * Zugreihenfolge für eine neue Runde: alle Mitspieler ohne moderierenden Host, Startspieler rotiert.
 * Auch wer gerade nicht verbunden ist (andere App offen), bleibt dabei; den Zug überspringt bei Bedarf der Timer oder der Host.
 */
export function buildTurnOrder(room: Room): string[] {
  const allIds = room.playingPlayers().map((p) => p.id);
  if (allIds.length === 0) return [];
  const startPlayerId = pickStartPlayer(allIds, allIds, room.lastStartPlayerId);
  room.lastStartPlayerId = startPlayerId;
  return rotateTo(allIds, startPlayerId);
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

export function baseRound(category: BaseRound['category'], turnOrder: string[]): BaseRound {
  return {
    category,
    turnOrder,
    turnNo: 1,
    activePlayerId: turnOrder[0] ?? null,
    eliminated: [],
    turnDeadline: null,
    soloMode: turnOrder.length === 1,
    reveal: null,
  };
}

// ------------------------------------------- Ziel und Rundentimer (Karte, Zeitstrahl)

/**
 * Ziel einer Runde, in der alle gleichzeitig tippen. Der Moderator kennt das Ziel ohnehin und wählt es selbst,
 * sonst zieht der Server eins, das in dieser Liste noch nicht dran war. Ändert nichts am Raum, siehe `rememberTarget`.
 */
export function pickTarget<T extends { id: string }>(
  room: Room,
  categoryId: string,
  targets: readonly T[],
  targetId: string | undefined,
): { target: T } | { error: Result } {
  const played = room.playedTargets[categoryId] ?? [];
  let target: T;
  if (room.hostId !== null && room.isModerator(room.hostId)) {
    if (!targetId) return { error: fail('invalid_action', 'Bitte ein Ziel wählen') };
    const chosen = targets.find((t) => t.id === targetId);
    if (!chosen) return { error: fail('unknown_category', 'Ziel unbekannt') };
    target = chosen;
  } else {
    const fresh = targets.filter((t) => !played.includes(t.id));
    const pool = fresh.length > 0 ? fresh : targets;
    target = pool[Math.floor(room.random() * pool.length)]!;
  }
  return { target };
}

/** Merkt sich ein Ziel als gespielt, erst wenn die Runde wirklich startet. */
export function rememberTarget(room: Room, categoryId: string, targetId: string): void {
  const played = room.playedTargets[categoryId] ?? [];
  room.playedTargets[categoryId] = [...played.filter((id) => id !== targetId), targetId];
}

/** Bei gesetztem Zeitlimit gilt es für die ganze Runde, alle tippen ja gleichzeitig. */
export function scheduleRoundTimer(room: Room, onExpire: () => void): void {
  room.cancelTimer('turn');
  const round = room.round;
  if (!round || room.phase !== 'playing') return;
  const seconds = room.settings.timerSeconds;
  if (seconds <= 0) {
    round.turnDeadline = null;
    return;
  }
  round.turnDeadline = room.now + seconds * 1000;
  room.timers.turn = room.scheduler.schedule(seconds * 1000, () => {
    room.timers.turn = null;
    if (room.phase !== 'playing' || room.round !== round) return;
    onExpire();
    room.emit();
  });
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
  game.onPlayerRemoved?.(room, playerId);

  if (!game.turnBased) {
    if (round.turnOrder.length === 0) toReveal(room);
    return;
  }

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
    case 'end_round':
      // Die gleichzeitigen Spiele beenden ihre Runde selbst, hier nur das vorzeitige Ende der rundenbasierten.
      return room.game?.turnBased ? endRoundEarly(room, playerId) : undefined;
    case 'reveal_player':
      return revealPlayer(room, playerId, msg.playerId);
    case 'reveal_solution':
      return revealSolution(room, playerId);
    case 'reveal_all':
      return revealAll(room, playerId);
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
  if (!game.turnBased) return fail('invalid_action', 'Dieses Spiel hat keine Züge');
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
  if (room.phase !== 'host_decision' || !round || !game || !game.turnBased) return fail('invalid_action', 'Keine Entscheidung offen');
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

/** Der Host beendet eine rundenbasierte Kategorie vorzeitig: Auflösung mit allen Werten, Punkte wie gewohnt. */
function endRoundEarly(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Kategorie');
  if (room.phase !== 'playing' && room.phase !== 'host_decision') return fail('invalid_action', 'Gerade läuft keine Runde');
  if (!room.round) return fail('invalid_action', 'Gerade läuft keine Runde');
  toReveal(room);
  return OK;
}

function toScoring(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host trägt Punkte ein');
  if (room.phase !== 'reveal') return fail('invalid_action', 'Erst die Auflösung ansehen');
  if (!revealComplete(room)) return fail('invalid_action', 'Erst alles aufdecken');
  room.phase = 'scoring';
  return OK;
}

// ------------------------------------------------------- Show-Auflösung

/** Ist alles aufgedeckt? Ohne Show-Auflösung immer. Bei No Risk No Fun schließt die aufgedeckte Liste die Kategorie ab. */
export function revealComplete(room: Room): boolean {
  const round = room.round;
  const show = room.game?.showReveal;
  if (!round?.reveal || !show) return true;
  if (!show.solutionRequired && round.reveal.solution) return true;
  const everyone = round.turnOrder.every((id) => (round.reveal!.players[id] ?? 0) >= show.steps);
  return everyone && (!show.solutionRequired || round.reveal.solution);
}

/** Stand der Show-Auflösung für die Sicht, fehlt bei „alles auf einmal“. */
export function revealView(room: Room): ShowRevealView | undefined {
  const round = room.round;
  const show = room.game?.showReveal;
  if (!round?.reveal || !show) return undefined;
  return { players: { ...round.reveal.players }, steps: show.steps, solution: round.reveal.solution, complete: revealComplete(room) };
}

function showRound(room: Room, playerId: string): { reveal: NonNullable<BaseRound['reveal']>; steps: number; solutionRequired: boolean } | { error: Result } {
  if (!room.isHost(playerId)) return { error: fail('not_host', 'Nur der Host deckt auf') };
  const round = room.round;
  const show = room.game?.showReveal;
  if (room.phase !== 'reveal' || !round) return { error: fail('invalid_action', 'Aufdecken geht nur in der Auflösung') };
  if (!round.reveal || !show) return { error: fail('invalid_action', 'Diese Runde läuft ohne Show-Auflösung') };
  return { reveal: round.reveal, ...show };
}

function revealPlayer(room: Room, playerId: string, targetId: string): Result {
  const r = showRound(room, playerId);
  if ('error' in r) return r.error;
  if (!room.round!.turnOrder.includes(targetId)) return fail('invalid_action', 'Dieser Spieler ist nicht in der Runde');
  const step = r.reveal.players[targetId] ?? 0;
  if (step >= r.steps) return fail('invalid_action', 'Schon aufgedeckt');
  r.reveal.players[targetId] = step + 1;
  return OK;
}

function revealSolution(room: Room, playerId: string): Result {
  const r = showRound(room, playerId);
  if ('error' in r) return r.error;
  if (r.reveal.solution) return fail('invalid_action', 'Die Lösung ist schon aufgedeckt');
  r.reveal.solution = true;
  return OK;
}

/** Deckt alle Spieler auf. Die Lösung nur dort, wo sie ohnehin dazugehört; bei No Risk No Fun beendet sie die Kategorie und bleibt ein eigener Schritt. */
function revealAll(room: Room, playerId: string): Result {
  const r = showRound(room, playerId);
  if ('error' in r) return r.error;
  for (const id of room.round!.turnOrder) r.reveal.players[id] = r.steps;
  if (r.solutionRequired) r.reveal.solution = true;
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
