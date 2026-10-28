import { matchGuess, type FaceAttemptView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { imageUrl } from '../picture/view.ts';
import { facesPoints, facesRanking, facesRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Den Namen und alle Versuche sieht nur der Host (`privileged`) oder alle ab der Auflösung.
 * Spieler sehen ihre eigenen Versuche und die geprüften Fehltipps aller.
 */
export function facesRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = facesRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && viewerId === room.hostId;
  const showAll = revealed || privileged;
  const { faces: _faces, games: _games, kind: _kind, ...category } = r.category;
  const matchable = [{ rank: 1, name: r.target.name, aliases: r.target.aliases ?? [] }];

  const wrongGuesses = r.turnOrder
    .flatMap((id) => (r.attempts[id] ?? []).filter((a) => a.status === 'wrong').map((a) => ({ by: id, text: a.text, at: a.at })))
    .sort((a, b) => a.at - b.at)
    .map(({ by, text }) => ({ by, text }));

  const toView = (a: { text: string; at: number; status: FaceAttemptView['status'] }, withSuggestion: boolean): FaceAttemptView => ({
    text: a.text,
    at: a.at,
    status: a.status,
    ...(withSuggestion ? { suggested: matchGuess(a.text, matchable) !== null } : {}),
  });

  const view: RoundView = {
    game: 'faces',
    category,
    image: imageUrl(r.target.image),
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    startedAt: r.startedAt,
    effect: { ...r.effect, revealed: [...r.effect.revealed] },
    solved: facesRanking(r),
    wrongGuesses,
  };
  if (showAll) view.name = r.target.name;
  if (privileged) view.privileged = true;
  const mine = viewerId !== null ? r.attempts[viewerId] : undefined;
  if (mine) view.myAttempts = mine.map((a) => toView(a, false));
  if (showAll) {
    view.attempts = Object.fromEntries(r.turnOrder.map((id) => [id, (r.attempts[id] ?? []).map((a) => toView(a, privileged))]));
    view.points = facesPoints(r);
  }
  return view;
}
