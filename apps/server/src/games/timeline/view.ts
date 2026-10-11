import { yearDistance, type RoundView, type TimelineGuessView, type TimelineRoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { timelineRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Die Lösung nur für den Moderator oder ab der Auflösung,
 * fremde Tipps nur ab der Auflösung, der eigene Tipp immer.
 */
export function timelineRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = timelineRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const { events: _events, games: _games, kind: _kind, ...category } = r.category;

  const view: TimelineRoundView = {
    game: 'timeline',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    eventName: r.target.name,
    confirmed: Object.entries(r.guesses)
      .filter(([, guess]) => guess.confirmed)
      .map(([id]) => id),
  };

  if (revealed || privileged) view.target = { from: r.target.from, to: r.target.to };
  if (privileged) view.privileged = true;

  const mine = viewerId !== null ? r.guesses[viewerId] : undefined;
  if (mine) view.myGuess = { ...mine };

  if (revealed) {
    const guesses: TimelineGuessView[] = r.turnOrder
      .filter((id) => r.guesses[id]?.confirmed)
      .map((id) => {
        const year = r.guesses[id]!.year;
        return { playerId: id, year, distanceYears: yearDistance(year, r.target.from, r.target.to) };
      });
    const ranked = [...guesses]
      .sort((a, b) => a.distanceYears - b.distanceYears)
      .map((g) => ({ playerId: g.playerId, distanceYears: g.distanceYears }));
    const missing = r.turnOrder.filter((id) => !r.guesses[id]?.confirmed).map((id) => ({ playerId: id, distanceYears: null }));
    view.guesses = guesses;
    view.ranking = [...ranked, ...missing];
  }

  return view;
}
