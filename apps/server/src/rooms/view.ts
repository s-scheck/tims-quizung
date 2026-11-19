import { AVATAR_PARTS, type Phase, type RoomView } from '@quiz/shared';
import type { Room } from './room.ts';
import { listGames } from '../games/registry.ts';
import { jokerView } from '../games/joker.ts';

const REVEALED_PHASES: ReadonlySet<Phase> = new Set(['reveal', 'scoring', 'scoreboard', 'finished']);

/**
 * Die einzige Stelle, an der versteckte Informationen entfernt werden.
 * `viewerId` ist der Empfänger (null für Bildschirme); nur ein moderierender Host sieht bei Top X mehr.
 */
export function toView(room: Room, viewerId: string | null): RoomView {
  const revealed = REVEALED_PHASES.has(room.phase);
  const round = room.game?.roundView(room, revealed, viewerId) ?? null;
  if (round) Object.assign(round, jokerView(room, revealed, viewerId));
  const view: RoomView = {
    code: room.code,
    hostId: room.hostId,
    players: room.playersByOrder().map((p) => {
      const avatar = room.avatars.get(p.id);
      return {
        id: p.id,
        name: p.name,
        order: p.order,
        connected: p.connected,
        avatarReady: !!avatar,
        // Fremde Figuren bleiben bis zum Spielstart geheim; die eigene kennt das Handy selbst.
        ...(avatar && room.phase !== 'lobby' ? { avatar: { v: avatar.v, shape: avatar.shape, parts: AVATAR_PARTS.filter((part) => avatar.parts[part]) } } : {}),
      };
    }),
    settings: { ...room.settings },
    scores: { ...room.scores },
    phase: room.phase,
    gameId: room.gameId,
    round,
    rounds: room.rounds.map((r) => ({ ...r, scores: { ...r.scores } })),
    defaultLives: room.defaultLives,
    mapBorders: room.mapBorders,
    riskRules: { ...room.riskRules },
    splashOptions: { ...room.splashOptions },
    dungeonOptions: { ...room.dungeonOptions, formats: [...room.dungeonOptions.formats] },
    towerOptions: { ...room.towerOptions },
    revealMode: room.revealMode,
    ...(room.devLock ? { devLock: { ...room.devLock } } : {}),
    jokersUsed: [...room.jokersUsed],
  };
  if (room.phase === 'finished' && room.finale) view.finale = { shown: room.finale.shown, total: room.finaleTotal() };
  if (room.phase === 'choosing_category') {
    view.games = listGames().map((g) => ({ id: g.id, name: g.name, description: g.description }));
    const summaries: NonNullable<RoomView['categories']> = room.categories.list().map((c) => {
      const summary: NonNullable<RoomView['categories']>[number] = {
        id: c.id,
        title: c.title,
        question: c.question,
        count:
          c.kind === 'pairs'
            ? c.pairs.length
            : c.kind === 'places'
              ? c.places.length
              : c.kind === 'events'
                ? c.events.length
                : c.kind === 'prompts'
                  ? c.prompts.length
                  : c.kind === 'picture'
                    ? c.fields.length
                    : c.kind === 'faces'
                      ? c.faces.length
                      : c.kind === 'stills'
                        ? c.stills.length
                        : c.kind === 'songs'
                          ? c.songs.length
                          : c.kind === 'questions'
                            ? c.questions.length
                            : c.items.length,
        played: room.playedCategoryIds.includes(c.id),
        games: [...c.games],
      };
      // Die Zielliste sieht nur der Host, damit Mitspieler nicht vorab wissen, was zur Wahl steht.
      const targets = c.kind === 'places' ? c.places : c.kind === 'events' ? c.events : c.kind === 'prompts' ? c.prompts : c.kind === 'faces' ? c.faces : null;
      if (targets && viewerId !== null && viewerId === room.hostId) {
        const played = room.playedTargets[c.id] ?? [];
        summary.targets = targets.map((t) => ({ id: t.id, name: t.name, played: played.includes(t.id) }));
      }
      return summary;
    });
    // Entwürfe aus dem Editor sieht der Host ausgegraut, damit klar ist, warum eine Liste fehlt.
    if (viewerId !== null && viewerId === room.hostId) {
      for (const d of room.categories.drafts()) {
        summaries.push({ id: d.id, title: d.title, question: d.question, count: d.count, played: false, games: [...d.games], draft: d.error });
      }
    }
    view.categories = summaries;
  }
  return view;
}
