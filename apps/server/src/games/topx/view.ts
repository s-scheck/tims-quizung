import type { RoundView, TopXSlotView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { hostJudges, topxRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Verdeckte Karten haben nur einen Rang, außer für den moderierenden Host
 * (`privileged`) oder ab der Auflösung. Der Treffer-Vorschlag ist nur für den Host sichtbar.
 */
export function topxRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = topxRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const showAll = revealed || privileged;
  const { items: _items, games: _games, kind: _kind, ...category } = r.category;

  const slots: TopXSlotView[] = r.cards.map((c) => {
    const by = r.revealed[c.rank];
    const isRevealed = by !== undefined;
    if (!isRevealed && !showAll) return { rank: c.rank, revealed: false };
    return {
      rank: c.rank,
      revealed: isRevealed,
      name: c.name,
      value: c.value,
      ...(c.label !== undefined ? { label: c.label } : {}),
      ...(isRevealed ? { revealedBy: by } : {}),
    };
  });

  const g = r.guess;
  return {
    game: 'topx',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: r.activePlayerId,
    eliminated: [...r.eliminated],
    turnDeadline: r.turnDeadline,
    soloMode: r.soloMode,
    slots,
    lives: { ...r.lives },
    maxLives: r.maxLives,
    hits: { ...r.hits },
    wrongGuesses: r.wrongGuesses.map((w) => ({ ...w })),
    guess: g
      ? {
          by: g.by,
          text: g.text,
          status: g.status,
          matchRank: privileged || g.status === 'correct' ? g.matchRank : null,
          resolveAt: g.resolveAt,
          applyAt: g.applyAt,
        }
      : null,
    hostJudges: hostJudges(room),
    ...(privileged ? { privileged: true } : {}),
  };
}
