import type { Phase, RoomView } from '@quiz/shared';
import type { Room } from './room.ts';
import { listGames } from '../games/registry.ts';

const REVEALED_PHASES: ReadonlySet<Phase> = new Set(['reveal', 'scoring', 'scoreboard', 'finished']);

/**
 * Die einzige Stelle, an der versteckte Informationen entfernt werden.
 * `viewerId` ist der Empfänger (null für Bildschirme); nur ein moderierender Host sieht bei Top X mehr.
 */
export function toView(room: Room, viewerId: string | null): RoomView {
  const revealed = REVEALED_PHASES.has(room.phase);
  const view: RoomView = {
    code: room.code,
    hostId: room.hostId,
    players: room.playersByOrder().map((p) => ({ id: p.id, name: p.name, order: p.order, connected: p.connected })),
    settings: { ...room.settings },
    scores: { ...room.scores },
    phase: room.phase,
    gameId: room.gameId,
    round: room.game?.roundView(room, revealed, viewerId) ?? null,
    rounds: room.rounds.map((r) => ({ ...r, scores: { ...r.scores } })),
    defaultLives: room.defaultLives,
    mapBorders: room.mapBorders,
  };
  if (room.phase === 'choosing_category') {
    view.games = listGames().map((g) => ({ id: g.id, name: g.name, description: g.description }));
    view.categories = room.categories.list().map((c) => {
      const summary: NonNullable<RoomView['categories']>[number] = {
        id: c.id,
        title: c.title,
        question: c.question,
        count: c.kind === 'pairs' ? c.pairs.length : c.kind === 'places' ? c.places.length : c.items.length,
        played: room.playedCategoryIds.includes(c.id),
        games: [...c.games],
      };
      // Die Zielliste sieht nur der Host, damit Mitspieler nicht vorab wissen, was zur Wahl steht.
      if (c.kind === 'places' && viewerId !== null && viewerId === room.hostId) {
        const played = room.playedPlaces[c.id] ?? [];
        summary.targets = c.places.map((p) => ({ id: p.id, name: p.name, played: played.includes(p.id) }));
      }
      return summary;
    });
  }
  return view;
}
