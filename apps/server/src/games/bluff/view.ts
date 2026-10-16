import type { BluffEntryView, BluffRoundView, RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import { bluffPoints, bluffRound, entryText } from './reducer.ts';

/**
 * Sicht auf die Runde. Autoren, Wahrheit und Punkte nur für den Moderator oder ab der Auflösung,
 * Stimmen ab der Stimmenanzeige, der eigene Text und die eigene Stimme immer.
 */
export function bluffRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = bluffRound(room);
  if (!r) return null;
  const privileged = viewerId !== null && room.isModerator(viewerId);
  const showAll = revealed || privileged;
  const { prompts: _prompts, games: _games, kind: _kind, ...category } = r.category;

  const view: BluffRoundView = {
    game: 'bluff',
    category,
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    prompt: r.prompt.name,
    stage: r.stage,
    submitted: r.turnOrder.filter((id) => r.texts[id] !== undefined),
    voted: r.turnOrder.filter((id) => r.votes[id] !== undefined),
  };
  if (viewerId !== null && r.texts[viewerId] !== undefined) view.myText = r.texts[viewerId];
  if (viewerId !== null && r.votes[viewerId] !== undefined) view.myVote = r.votes[viewerId];
  if (showAll) view.truth = r.prompt.answer;
  if (privileged) view.privileged = true;

  const votersOf = (entryId: string) => r.turnOrder.filter((id) => r.votes[id] === entryId);

  if (r.stage === 'writing') {
    if (showAll) {
      view.entries = r.turnOrder
        .filter((id) => r.texts[id] !== undefined)
        .map((id) => ({ id, text: r.texts[id]!, authorId: id }));
    }
  } else {
    const showVotes = r.stage === 'votes_shown' || showAll;
    view.entries = r.entries.map((e) => {
      const entry: BluffEntryView = { id: e.id, text: entryText(r, e) };
      if (viewerId !== null && e.authorId === viewerId) entry.mine = true;
      if (showVotes) entry.votes = votersOf(e.id);
      if (showAll) {
        entry.authorId = e.authorId;
        entry.isTruth = e.authorId === null;
        if (e.authorId !== null) entry.points = votersOf(e.id).length;
      }
      return entry;
    });
  }
  if (showAll && r.stage !== 'writing') view.points = bluffPoints(r);
  return view;
}
