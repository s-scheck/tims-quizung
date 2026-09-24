import type { Phase, RoomView } from '@quiz/shared';
import type { Room } from './room.ts';

const REVEALED_PHASES: ReadonlySet<Phase> = new Set(['reveal', 'scoring', 'scoreboard', 'finished']);

/** Die einzige Stelle, an der versteckte Informationen entfernt werden. */
export function toView(room: Room): RoomView {
  const revealed = REVEALED_PHASES.has(room.phase);
  const view: RoomView = {
    code: room.code,
    hostId: room.hostId,
    players: room.playersByOrder().map((p) => ({ id: p.id, name: p.name, order: p.order, connected: p.connected })),
    settings: { ...room.settings },
    scores: { ...room.scores },
    phase: room.phase,
    gameId: room.gameId,
    round: room.game?.roundView(room, revealed) ?? null,
    rounds: room.rounds.map((r) => ({ ...r, scores: { ...r.scores } })),
  };
  if (room.phase === 'choosing_category') {
    view.categories = room.categories.list().map((c) => ({
      id: c.id,
      title: c.title,
      question: c.question,
      count: c.items.length,
      played: room.playedCategoryIds.includes(c.id),
    }));
  }
  return view;
}
