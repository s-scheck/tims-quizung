import { towerMarks, towerPoints, type RoundView, type TowerRoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { currentRanking, towerRound } from './reducer.ts';

/**
 * Sicht auf das Rennen. Höhen, Marken, Effekte und Sieger sind öffentlich (der Fernseher zeigt sie),
 * Steinstrom und Art des Vorrats sieht nur der Spieler selbst. Rangliste und Punktevorschlag ab der Auflösung.
 */
export function towerRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = towerRound(room);
  if (!r) return null;
  const mine = viewerId ? r.players[viewerId] : undefined;
  const view: TowerRoundView = {
    game: 'tower',
    category: { id: r.category.id, title: r.category.title, question: 'Wer stapelt am höchsten?' },
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    options: { ...r.options },
    startedAt: r.startedAt,
    goalHeight: r.goalHeight,
    marks: towerMarks(r.goalHeight),
    players: Object.fromEntries(
      Object.entries(r.players).map(([id, p]) => [
        id,
        { height: Math.round(p.height * 10) / 10, marks: [...p.marks], hasStock: p.stock !== null, finishedAt: p.finishedAt },
      ]),
    ),
    effects: revealed ? [] : r.effects.filter((e) => e.until > room.now).map((e) => ({ ...e })),
    winners: [...r.winners],
    ...(mine ? { my: { seed: mine.seed, stock: mine.stock } } : {}),
  };
  if (revealed) {
    const ranking = currentRanking(r);
    view.ranking = ranking;
    view.points = towerPoints(ranking);
  }
  return view;
}
