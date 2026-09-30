import { isValidPlacement, shuffle, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { SortCard, SortRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import { baseRound, buildTurnOrder, scheduleTurnTimer, settleTurn } from '../common.ts';

export const RESOLVE_DELAY_MS = 2000;
export const APPLY_DELAY_MS = 1500;

export function sortRound(room: Room): SortRound | null {
  return room.round?.game === 'sort' ? room.round : null;
}

export function startSortRound(room: Room, category: Category): Result {
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');

  const cards: SortCard[] = shuffle(category.items, room.random).map((item, i) => ({
    id: `c${i + 1}`,
    name: item.name,
    value: item.value,
    ...(item.label !== undefined ? { label: item.label } : {}),
  }));
  const startCard = cards[Math.floor(room.random() * cards.length)]!;

  room.round = {
    ...baseRound(category, turnOrder),
    game: 'sort',
    cards,
    startCardId: startCard.id,
    chain: [startCard.id],
    pool: cards.filter((c) => c.id !== startCard.id).map((c) => c.id),
    selection: {},
    placement: null,
  };
  room.phase = 'playing';
  scheduleTurnTimer(room);
  return OK;
}

export function handleSortMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'select':
      return select(room, playerId, msg.turnNo, msg.cardId, msg.gapIndex);
    case 'confirm':
      return confirm(room, playerId, msg.turnNo);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function activeRound(room: Room, playerId: string, turnNo: number): { round: SortRound } | { error: Result } {
  const round = sortRound(room);
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
  const round = sortRound(room);
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
  const round = sortRound(room);
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

// --------------------------------------------------------- Modul-Hooks

export function isBusy(room: Room): boolean {
  return sortRound(room)?.placement !== null;
}

export function isRoundComplete(room: Room): boolean {
  const round = sortRound(room);
  return !!round && round.pool.length === 0;
}

export function penalizeActive(room: Room): void {
  const round = sortRound(room);
  if (!round) return;
  if (round.activePlayerId) eliminate(round, round.activePlayerId);
  round.selection = {};
}

export function clearTurn(room: Room): void {
  const round = sortRound(room);
  if (round) round.selection = {};
}

export function onReveal(room: Room): void {
  const round = sortRound(room);
  if (!round) return;
  round.placement = null;
  round.selection = {};
}
