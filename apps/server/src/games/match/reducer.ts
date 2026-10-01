import { shuffle, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { MatchCard, MatchRound, MatchTarget } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, scheduleTurnTimer, settleTurn } from '../common.ts';

export const RESOLVE_DELAY_MS = 2000;
export const APPLY_DELAY_MS = 1500;

export function matchRound(room: Room): MatchRound | null {
  return room.round?.game === 'match' ? room.round : null;
}

export function startMatchRound(room: Room, category: Category, opts: StartRoundOptions): Result {
  if (category.kind !== 'pairs') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  const lives = opts.lives ?? room.defaultLives;
  room.defaultLives = lives;

  // IDs erst nach dem Mischen vergeben, damit die Nummerierung nichts verrät.
  const pairs = shuffle(category.pairs, room.random);
  const cards: MatchCard[] = pairs.map((p, i) => ({ id: `k${i + 1}`, text: p.left }));
  const targetsRaw = [
    ...pairs.map((p, i) => ({ text: p.right, solutionCardId: cards[i]!.id })),
    ...category.decoys.map((text) => ({ text, solutionCardId: null })),
  ];
  const targets: MatchTarget[] = shuffle(targetsRaw, room.random).map((t, i) => ({ id: `t${i + 1}`, ...t }));

  room.round = {
    ...baseRound(category, turnOrder),
    game: 'match',
    category,
    cards,
    pool: shuffle(cards.map((c) => c.id), room.random),
    targets,
    matched: {},
    selection: {},
    attempt: null,
    lives: Object.fromEntries(turnOrder.map((id) => [id, lives])),
    maxLives: lives,
    hits: Object.fromEntries(turnOrder.map((id) => [id, 0])),
  };
  room.phase = 'playing';
  scheduleTurnTimer(room);
  return OK;
}

export function handleMatchMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'select':
      return select(room, playerId, msg.turnNo, msg.cardId, msg.targetId);
    case 'confirm':
      return confirm(room, playerId, msg.turnNo);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function activeRound(room: Room, playerId: string, turnNo: number): { round: MatchRound } | { error: Result } {
  const round = matchRound(room);
  if (room.phase !== 'playing' || !round) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  if (round.activePlayerId !== playerId) return { error: fail('not_your_turn', 'Du bist nicht dran') };
  if (round.turnNo !== turnNo) return { error: fail('invalid_action', 'Zug ist schon vorbei') };
  if (round.attempt) return { error: fail('invalid_action', 'Zuordnung läuft noch') };
  return { round };
}

function select(room: Room, playerId: string, turnNo: number, cardId?: string, targetId?: string): Result {
  const r = activeRound(room, playerId, turnNo);
  if ('error' in r) return r.error;
  const { round } = r;
  if (cardId !== undefined && !round.pool.includes(cardId)) return fail('invalid_action', 'Karte liegt nicht im Pool');
  if (targetId !== undefined) {
    if (!round.targets.some((t) => t.id === targetId)) return fail('invalid_action', 'Ziel existiert nicht');
    if (round.matched[targetId]) return fail('invalid_action', 'Ziel ist schon belegt');
  }
  round.selection = {
    ...(cardId !== undefined ? { cardId } : {}),
    ...(targetId !== undefined ? { targetId } : {}),
  };
  return OK;
}

function confirm(room: Room, playerId: string, turnNo: number): Result {
  const r = activeRound(room, playerId, turnNo);
  if ('error' in r) return r.error;
  const { round } = r;
  const { cardId, targetId } = round.selection;
  if (cardId === undefined || targetId === undefined) return fail('invalid_action', 'Erst Karte und Ziel wählen');
  const poolIndex = round.pool.indexOf(cardId);
  if (poolIndex === -1) return fail('invalid_action', 'Karte liegt nicht im Pool');
  if (!round.targets.some((t) => t.id === targetId) || round.matched[targetId]) return fail('invalid_action', 'Ziel ist nicht frei');

  round.pool.splice(poolIndex, 1);
  const now = room.now;
  round.attempt = {
    cardId,
    targetId,
    poolIndex,
    status: 'pending',
    by: playerId,
    resolveAt: now + RESOLVE_DELAY_MS,
    applyAt: now + RESOLVE_DELAY_MS + APPLY_DELAY_MS,
  };
  round.turnDeadline = null;
  room.cancelTimer('turn');
  room.timers.placement = room.scheduler.schedule(RESOLVE_DELAY_MS, () => resolveAttempt(room));
  return OK;
}

function resolveAttempt(room: Room): void {
  room.timers.placement = null;
  const round = matchRound(room);
  const attempt = round?.attempt;
  if (!round || !attempt || attempt.status !== 'pending') return;
  const target = round.targets.find((t) => t.id === attempt.targetId);
  attempt.status = target?.solutionCardId === attempt.cardId ? 'correct' : 'wrong';
  room.timers.placement = room.scheduler.schedule(APPLY_DELAY_MS, () => applyAttempt(room));
  room.emit();
}

function applyAttempt(room: Room): void {
  room.timers.placement = null;
  const round = matchRound(room);
  const attempt = round?.attempt;
  if (!round || !attempt || attempt.status === 'pending') return;
  if (attempt.status === 'correct') {
    round.matched[attempt.targetId] = { cardId: attempt.cardId, by: attempt.by };
    round.hits[attempt.by] = (round.hits[attempt.by] ?? 0) + 1;
  } else {
    round.pool.splice(Math.min(attempt.poolIndex, round.pool.length), 0, attempt.cardId);
    loseLife(round, attempt.by);
  }
  round.attempt = null;
  round.selection = {};
  settleTurn(room, {});
  room.emit();
}

function loseLife(round: MatchRound, playerId: string): void {
  const left = Math.max(0, (round.lives[playerId] ?? 0) - 1);
  round.lives[playerId] = left;
  if (left === 0 && round.turnOrder.includes(playerId) && !round.eliminated.includes(playerId)) {
    round.eliminated.push(playerId);
  }
}

// --------------------------------------------------------- Modul-Hooks

export function isBusy(room: Room): boolean {
  return matchRound(room)?.attempt !== null;
}

export function isRoundComplete(room: Room): boolean {
  const round = matchRound(room);
  return !!round && Object.keys(round.matched).length === round.cards.length;
}

export function penalizeActive(room: Room): void {
  const round = matchRound(room);
  if (!round) return;
  if (round.activePlayerId) loseLife(round, round.activePlayerId);
  round.selection = {};
}

export function clearTurn(room: Room): void {
  const round = matchRound(room);
  if (round) round.selection = {};
}

export function onReveal(room: Room): void {
  const round = matchRound(room);
  if (!round) return;
  round.attempt = null;
  round.selection = {};
}
