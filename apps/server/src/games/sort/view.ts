import { sortCards, type CardView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { sortRound } from './reducer.ts';

/** Sicht auf die Runde. Werte und Lösung gibt es nur mit `revealed`. Alle Empfänger sehen dasselbe. */
export function sortRoundView(room: Room, revealed: boolean): RoundView | null {
  const r = sortRound(room);
  if (!r) return null;
  const { items: _items, games: _games, kind: _kind, ...category } = r.category;
  const cards: CardView[] = r.cards.map((c) =>
    revealed ? { id: c.id, name: c.name, value: c.value, ...(c.label !== undefined ? { label: c.label } : {}) } : { id: c.id, name: c.name },
  );
  return {
    game: 'sort',
    category,
    cards,
    chain: [...r.chain],
    pool: [...r.pool],
    startCardId: r.startCardId,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: r.activePlayerId,
    eliminated: [...r.eliminated],
    selection: { ...r.selection },
    placement: r.placement
      ? {
          cardId: r.placement.cardId,
          gapIndex: r.placement.gapIndex,
          status: r.placement.status,
          by: r.placement.by,
          resolveAt: r.placement.resolveAt,
          applyAt: r.placement.applyAt,
        }
      : null,
    turnDeadline: r.turnDeadline,
    soloMode: r.soloMode,
    ...(revealed ? { solution: sortCards(r.cards, r.category.order).map((c) => c.id) } : {}),
  };
}
