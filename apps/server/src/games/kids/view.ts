import { matchGuess, type FaceAttemptView, type KidsRoundView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { KidsItem, KidsRound } from '../../rooms/state.ts';
import { imageUrl } from '../picture/view.ts';
import { currentItem, kidsPoints, kidsRanking, kidsRound } from './reducer.ts';

/**
 * Sicht auf die Runde. Das Foto sieht der Host immer, alle anderen ab „Zeigen“; den Namen der Host immer,
 * alle anderen ab der Auflösung des Promis. Fremde Tipps sieht nur der Host, wer richtig liegt, sehen alle.
 */
export function kidsRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = kidsRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && viewerId === room.hostId;
  const { faces: _faces, games: _games, kind: _kind, ...category } = r.category;
  const item = currentItem(r);
  const stage = item?.stage ?? 'solved';
  const { points, hits, misses } = kidsPoints(r);
  // Abgeschlossene Promis vor dem aktuellen; in der Auflösung alle gezeigten.
  const done = (revealed ? r.items : r.items.slice(0, r.index)).filter((i) => i.stage !== 'hidden');

  const view: KidsRoundView = {
    game: 'kids',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: r.turnDeadline,
    soloMode: false,
    mode: r.mode,
    thinkSeconds: r.thinkSeconds,
    penalty: r.penalty,
    total: r.items.length,
    index: r.index,
    stage,
    shownAt: item?.shownAt ?? null,
    solved: item ? kidsRanking(r, item) : [],
    points,
    hits,
    misses,
    history: done.map((i) => itemView(r, i)),
  };
  if (privileged) view.privileged = true;
  if (!item) return view;

  if (privileged || stage !== 'hidden') view.image = imageUrl(item.face.image);
  if (privileged || stage === 'solved' || revealed) view.name = item.face.name;
  if (r.mode === 'type') {
    const matchable = [{ rank: 1, name: item.face.name, aliases: item.face.aliases ?? [] }];
    const toView = (a: { text: string; at: number; status: FaceAttemptView['status'] }, withSuggestion: boolean): FaceAttemptView => ({
      text: a.text,
      at: a.at,
      status: a.status,
      ...(withSuggestion ? { suggested: matchGuess(a.text, matchable) !== null } : {}),
    });
    const mine = viewerId !== null ? item.attempts[viewerId] : undefined;
    if (mine) view.myAttempts = mine.map((a) => toView(a, false));
    if (privileged) view.attempts = Object.fromEntries(r.turnOrder.map((id) => [id, (item.attempts[id] ?? []).map((a) => toView(a, true))]));
  } else {
    view.buzzer = { holder: item.holder, deadline: r.turnDeadline, used: [...item.used] };
  }
  return view;
}

function itemView(round: KidsRound, item: KidsItem) {
  return { id: item.face.id, name: item.face.name, image: imageUrl(item.face.image), shownAt: item.shownAt, winners: kidsRanking(round, item) };
}
