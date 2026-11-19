import { dungeonRanking, type DungeonQuestionView, type DungeonRoundView, type DungeonSolutionView, type RoundView } from '@quiz/shared';
import type { Room } from '../../rooms/room.ts';
import type { DungeonDoor, DungeonRound } from '../../rooms/state.ts';
import { doorOf, dungeonRound, yearLabel } from './reducer.ts';

function questionOf(door: DungeonDoor): DungeonQuestionView {
  const p = door.payload;
  switch (p.kind) {
    case 'choice':
      return { doorId: door.id, kind: 'choice', prompt: p.question.q, choices: [...p.choices] };
    case 'free':
      return { doorId: door.id, kind: 'free', prompt: p.question.q };
    case 'map':
      return { doorId: door.id, kind: 'map', prompt: p.prompt, name: p.place.name, km: door.tolerance ?? 0, ...(p.bounds ? { bounds: p.bounds } : {}) };
    case 'timeline':
      return { doorId: door.id, kind: 'timeline', prompt: p.prompt, name: p.event.name, years: door.tolerance ?? 0 };
    case 'topx':
      return { doorId: door.id, kind: 'topx', prompt: p.prompt, title: door.title, n: door.tolerance ?? p.items.length };
  }
}

function solutionOf(door: DungeonDoor): DungeonSolutionView {
  const p = door.payload;
  switch (p.kind) {
    case 'choice':
    case 'free':
      return { prompt: p.question.q, solution: p.question.answer };
    case 'map':
      return { prompt: `${p.prompt} ${p.place.name} (bis ${door.tolerance} km)`, solution: `${p.place.lat.toFixed(2)}°, ${p.place.lng.toFixed(2)}°` };
    case 'timeline': {
      const span = p.event.from === p.event.to ? yearLabel(p.event.from) : `${yearLabel(p.event.from)}–${yearLabel(p.event.to)}`;
      return { prompt: `${p.prompt} ${p.event.name} (±${door.tolerance} Jahre)`, solution: span };
    }
    case 'topx':
      return { prompt: p.prompt, solution: p.items.map((it, i) => `${i + 1}. ${it.name}`).join(', ') };
  }
}

export function rankingOf(r: DungeonRound) {
  return dungeonRanking(
    r.turnOrder
      .filter((id) => r.players[id])
      .map((id) => {
        const p = r.players[id]!;
        return { playerId: id, status: p.status, room: p.room, exitRound: p.exitRound, wrong: p.wrong };
      }),
  );
}

/**
 * Sicht auf den Dungeon. Türen, Wege und Bestätigungen sind für alle live. Die Frage hinter der eigenen Tür sieht
 * nur der Spieler selbst; nach jeder Runde gibt es nur richtig oder falsch. Fragen, Antworten und Lösungen aller
 * Türen kommen erst in der Auflösung, auch für den Host.
 */
export function dungeonRoundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null {
  const r = dungeonRound(room);
  if (!r) return null;
  const mine = viewerId ? r.walk[viewerId] : undefined;
  const myDoor = r.stage !== 'choosing' && mine?.confirmed && mine.doorId ? doorOf(r, mine.doorId) : undefined;
  const myAnswer = viewerId ? r.answers[viewerId] : undefined;

  const view: DungeonRoundView = {
    game: 'dungeon',
    category: { id: r.category.id, title: r.category.title },
    turnOrder: [...r.turnOrder],
    turnNo: r.turnNo,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    options: { ...r.options, formats: [...r.options.formats] },
    stage: r.stage,
    roundNo: r.roundNo,
    rooms: r.rooms.map((doors) => doors.map((d) => ({ id: d.id, categoryId: d.categoryId, title: d.title, kind: d.kind, tolerance: d.tolerance }))),
    players: Object.fromEntries(Object.entries(r.players).map(([id, p]) => [id, { playerId: id, ...p, locked: [...p.locked] }])),
    walk: Object.fromEntries(Object.entries(r.walk).map(([id, w]) => [id, { ...w }])),
    answered: Object.keys(r.answers),
    skipped: [...r.skipped],
    ...(r.stage === 'result' ? { results: Object.fromEntries(Object.entries(r.results).map(([id, x]) => [id, { ...x }])) } : {}),
    ...(myDoor && !revealed ? { myQuestion: questionOf(myDoor) } : {}),
    ...(myAnswer && !revealed ? { myAnswer: myAnswer.text } : {}),
    ranking: rankingOf(r),
    ...(revealed
      ? {
          attempts: r.attempts.map((a) => ({
            roundNo: a.roundNo,
            room: a.room,
            doorId: a.doorId,
            playerId: a.playerId,
            answer: a.text,
            correct: a.correct,
            ...(a.detail !== undefined ? { detail: a.detail } : {}),
          })),
          solutions: Object.fromEntries(r.rooms.flat().map((d) => [d.id, solutionOf(d)])),
        }
      : {}),
  };
  return view;
}
