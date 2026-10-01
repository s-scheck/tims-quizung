import type { MatchTargetView, RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { matchRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Lösung und Köder sieht nur der moderierende Host (`privileged`)
 * oder jeder ab der Auflösung.
 */
export function matchRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = matchRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const showSolution = revealed || privileged;
  const { pairs: _pairs, decoys: _decoys, games: _games, kind: _kind, ...category } = r.category;

  const targets: MatchTargetView[] = r.targets.map((t) => {
    const m = r.matched[t.id];
    return {
      id: t.id,
      text: t.text,
      matchedCardId: m?.cardId ?? null,
      ...(m ? { matchedBy: m.by } : {}),
      ...(showSolution ? { solutionCardId: t.solutionCardId, decoy: t.solutionCardId === null } : {}),
    };
  });

  return {
    game: 'match',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: r.activePlayerId,
    eliminated: [...r.eliminated],
    turnDeadline: r.turnDeadline,
    soloMode: r.soloMode,
    cards: r.cards.map((c) => ({ ...c })),
    pool: [...r.pool],
    targets,
    selection: { ...r.selection },
    attempt: r.attempt
      ? {
          cardId: r.attempt.cardId,
          targetId: r.attempt.targetId,
          status: r.attempt.status,
          by: r.attempt.by,
          resolveAt: r.attempt.resolveAt,
          applyAt: r.attempt.applyAt,
        }
      : null,
    lives: { ...r.lives },
    maxLives: r.maxLives,
    hits: { ...r.hits },
    ...(privileged ? { privileged: true } : {}),
  };
}
