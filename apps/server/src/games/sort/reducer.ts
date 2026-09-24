import {
  isValidPlacement,
  isValidScore,
  nextActivePlayer,
  remainingPlayers,
  rotateStartPlayer,
  rotateTo,
  shuffle,
  type ClientMsg,
  type RoundResult,
} from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { Placement, SortCard, SortRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';

export const RESOLVE_DELAY_MS = 2000;
export const APPLY_DELAY_MS = 1500;

export function startSortGame(room: Room): void {
  room.cancelAllTimers();
  room.phase = 'choosing_category';
  room.round = null;
}

export function handleSortMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'choose_category':
      return chooseCategory(room, playerId, msg.categoryId);
    case 'select':
      return select(room, playerId, msg.turnNo, msg.cardId, msg.gapIndex);
    case 'confirm':
      return confirm(room, playerId, msg.turnNo);
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
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

// ------------------------------------------------------------------ Runde

function chooseCategory(room: Room, playerId: string, categoryId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host wählt die Kategorie');
  if (room.phase !== 'choosing_category') return fail('invalid_action', 'Gerade keine Kategoriewahl');
  const category = room.categories.get(categoryId);
  if (!category) return fail('unknown_category', 'Kategorie unbekannt');

  const cards: SortCard[] = shuffle(category.items, room.random).map((item, i) => ({
    id: `c${i + 1}`,
    name: item.name,
    value: item.value,
    ...(item.label !== undefined ? { label: item.label } : {}),
  }));
  const startCard = cards[Math.floor(room.random() * cards.length)]!;

  const allIds = room.playersByOrder().map((p) => p.id);
  const connectedIds = room.playersByOrder().filter((p) => p.connected).map((p) => p.id);
  const eligible = connectedIds.length > 0 ? connectedIds : allIds;
  const startPlayerId = pickStartPlayer(allIds, eligible, room.lastStartPlayerId);
  const turnOrder = rotateTo(eligible, startPlayerId);
  room.lastStartPlayerId = startPlayerId;

  room.round = {
    category,
    cards,
    startCardId: startCard.id,
    chain: [startCard.id],
    pool: cards.filter((c) => c.id !== startCard.id).map((c) => c.id),
    turnOrder,
    turnNo: 1,
    activePlayerId: turnOrder[0] ?? null,
    eliminated: [],
    selection: {},
    placement: null,
    turnDeadline: null,
    soloMode: turnOrder.length === 1,
  };
  if (!room.playedCategoryIds.includes(category.id)) room.playedCategoryIds.push(category.id);
  room.phase = 'playing';
  scheduleTurnTimer(room);
  return OK;
}

/** Startspieler rotiert über alle Spieler; ist der Kandidat nicht spielbereit, rückt der nächste nach. */
function pickStartPlayer(allIds: string[], eligible: string[], last: string | null): string | null {
  if (eligible.length === 0) return null;
  let candidate = rotateStartPlayer(allIds, last);
  for (let i = 0; i < allIds.length && candidate !== null; i++) {
    if (eligible.includes(candidate)) return candidate;
    candidate = rotateStartPlayer(allIds, candidate);
  }
  return eligible[0] ?? null;
}

function activeRound(room: Room, playerId: string, turnNo: number): { round: SortRound } | { error: Result } {
  const round = room.round;
  if (room.phase !== 'playing' || !round) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  if (round.activePlayerId !== playerId) return { error: fail('not_your_turn', 'Du bist nicht dran') };
  if (round.turnNo !== turnNo) return { error: fail('invalid_action', 'Zug ist schon vorbei') };
  if (round.placement) return { error: fail('invalid_action', 'Platzierung läuft noch') };
  return { round };
}

function select(room: Room, playerId: string, turnNo: number, cardId?: string, gapIndex?: number): Result {
  const r = activeRound(room, playerId, turnNo);
  if ('error' in r) return r.error;
  const { round } = r;
  if (cardId !== undefined && !round.pool.includes(cardId)) return fail('invalid_action', 'Karte liegt nicht im Pool');
  if (gapIndex !== undefined && (gapIndex < 0 || gapIndex > round.chain.length)) {
    return fail('invalid_action', 'Lücke existiert nicht');
  }
  round.selection = {
    ...(cardId !== undefined ? { cardId } : {}),
    ...(gapIndex !== undefined ? { gapIndex } : {}),
  };
  return OK;
}

function confirm(room: Room, playerId: string, turnNo: number): Result {
  const r = activeRound(room, playerId, turnNo);
  if ('error' in r) return r.error;
  const { round } = r;
  const { cardId, gapIndex } = round.selection;
  if (cardId === undefined || gapIndex === undefined) return fail('invalid_action', 'Erst Karte und Lücke wählen');
  const poolIndex = round.pool.indexOf(cardId);
  if (poolIndex === -1) return fail('invalid_action', 'Karte liegt nicht im Pool');
  if (gapIndex < 0 || gapIndex > round.chain.length) return fail('invalid_action', 'Lücke existiert nicht');

  round.pool.splice(poolIndex, 1);
  round.chain.splice(gapIndex, 0, cardId);
  const now = room.now;
  round.placement = {
    cardId,
    gapIndex,
    poolIndex,
    status: 'pending',
    by: playerId,
    resolveAt: now + RESOLVE_DELAY_MS,
    applyAt: now + RESOLVE_DELAY_MS + APPLY_DELAY_MS,
  };
  round.turnDeadline = null;
  room.cancelTimer('turn');
  room.timers.placement = room.scheduler.schedule(RESOLVE_DELAY_MS, () => resolvePlacement(room));
  return OK;
}

function resolvePlacement(room: Room): void {
  room.timers.placement = null;
  const round = room.round;
  const placement = round?.placement;
  if (!round || !placement || placement.status !== 'pending') return;
  const card = round.cards.find((c) => c.id === placement.cardId)!;
  const chainValues = round.chain
    .filter((id) => id !== placement.cardId)
    .map((id) => round.cards.find((c) => c.id === id)!.value);
  const valid = isValidPlacement(chainValues, card.value, placement.gapIndex, round.category.order);
  placement.status = valid ? 'correct' : 'wrong';
  room.timers.placement = room.scheduler.schedule(APPLY_DELAY_MS, () => applyPlacement(room));
  room.emit();
}

function applyPlacement(room: Room): void {
  room.timers.placement = null;
  const round = room.round;
  const placement = round?.placement;
  if (!round || !placement || placement.status === 'pending') return;
  if (placement.status === 'wrong') {
    round.chain = round.chain.filter((id) => id !== placement.cardId);
    round.pool.splice(Math.min(placement.poolIndex, round.pool.length), 0, placement.cardId);
    eliminate(round, placement.by);
  }
  round.placement = null;
  round.selection = {};
  settleTurn(room, {});
  room.emit();
}

function eliminate(round: SortRound, playerId: string): void {
  if (round.turnOrder.includes(playerId) && !round.eliminated.includes(playerId)) {
    round.eliminated.push(playerId);
  }
}

/**
 * Nach einem abgeschlossenen Zug: Runde beenden, Host fragen oder weitergeben.
 * `forcedNext` überschreibt die Berechnung des nächsten Spielers (Spieler hat den Raum verlassen).
 */
function settleTurn(room: Room, opts: { forcedNext?: string | null }): void {
  const round = room.round;
  if (!round) return;
  round.turnNo++;
  if (round.pool.length === 0) return toReveal(room);
  const remaining = remainingPlayers(round.turnOrder, round.eliminated);
  if (remaining.length === 0) return toReveal(room);
  if (remaining.length === 1 && !round.soloMode) {
    room.cancelTimer('turn');
    room.phase = 'host_decision';
    round.activePlayerId = remaining[0]!;
    round.turnDeadline = null;
    return;
  }
  round.activePlayerId =
    opts.forcedNext !== undefined ? opts.forcedNext : nextActivePlayer(round.turnOrder, round.activePlayerId, round.eliminated);
  scheduleTurnTimer(room);
}

function scheduleTurnTimer(room: Room): void {
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
  if (room.phase !== 'playing' || !round || round.turnNo !== turnNo || round.placement) return;
  if (round.activePlayerId) eliminate(round, round.activePlayerId);
  round.selection = {};
  settleTurn(room, {});
  room.emit();
}

function skipTurn(room: Room, playerId: string, turnNo: number): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host darf einen Zug überspringen');
  const round = room.round;
  if (room.phase !== 'playing' || !round) return fail('invalid_action', 'Gerade wird nicht gespielt');
  if (round.turnNo !== turnNo) return fail('invalid_action', 'Zug ist schon vorbei');
  if (round.placement) return fail('invalid_action', 'Platzierung läuft noch');
  room.cancelTimer('turn');
  if (round.activePlayerId) eliminate(round, round.activePlayerId);
  round.selection = {};
  settleTurn(room, {});
  return OK;
}

function hostDecision(room: Room, playerId: string, cont: boolean): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host entscheidet');
  const round = room.round;
  if (room.phase !== 'host_decision' || !round) return fail('invalid_action', 'Keine Entscheidung offen');
  if (!cont) {
    toReveal(room);
    return OK;
  }
  const remaining = remainingPlayers(round.turnOrder, round.eliminated);
  if (remaining.length === 0 || round.pool.length === 0) {
    toReveal(room);
    return OK;
  }
  round.soloMode = true;
  room.phase = 'playing';
  round.activePlayerId = remaining[0]!;
  round.turnNo++;
  round.selection = {};
  scheduleTurnTimer(room);
  return OK;
}

function toReveal(room: Room): void {
  room.cancelAllTimers();
  const round = room.round;
  room.phase = 'reveal';
  if (!round) return;
  round.activePlayerId = null;
  round.turnDeadline = null;
  round.placement = null;
  round.selection = {};
}

// ---------------------------------------------------------------- Punkte

function toScoring(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host trägt Punkte ein');
  if (room.phase !== 'reveal') return fail('invalid_action', 'Erst die Auflösung ansehen');
  room.phase = 'scoring';
  return OK;
}

function submitScores(room: Room, playerId: string, scores: Record<string, number>): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host trägt Punkte ein');
  const round = room.round;
  if (room.phase !== 'scoring' || !round) return fail('invalid_action', 'Gerade keine Punkteeingabe');
  const deltas: Record<string, number> = {};
  for (const p of room.players) {
    const raw = scores[p.id];
    if (raw !== undefined && !isValidScore(raw)) return fail('bad_message', 'Punkte müssen ganze Zahlen sein');
    const delta = raw ?? 0;
    deltas[p.id] = delta;
    room.scores[p.id] = (room.scores[p.id] ?? 0) + delta;
  }
  const result: RoundResult = {
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

// --------------------------------------------------------- Spieler weg

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = room.round;
  if (!round) return;
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
  if (round.placement) {
    // Die laufende Platzierung löst sich normal auf, applyPlacement räumt danach auf.
    return;
  }
  if (wasActive) {
    room.cancelTimer('turn');
    round.selection = {};
    settleTurn(room, { forcedNext: successor });
    return;
  }
  // Ein Nichtaktiver ist weg: prüfen, ob dadurch die Host-Entscheidung fällig ist.
  const remaining = remainingPlayers(round.turnOrder, round.eliminated);
  if (remaining.length === 0) toReveal(room);
  else if (remaining.length === 1 && !round.soloMode) {
    room.cancelTimer('turn');
    room.phase = 'host_decision';
    round.activePlayerId = remaining[0]!;
    round.turnDeadline = null;
  }
}

export type { Placement };
