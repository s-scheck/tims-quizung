import { describe, expect, test } from 'bun:test';
import type { DungeonDoorTry, DungeonPlayerView, DungeonRoundView } from '@quiz/shared';
import { dungeonTicker } from './dungeonTicker.ts';

const player = (id: string, over: Partial<DungeonPlayerView> = {}): DungeonPlayerView => ({
  playerId: id,
  status: 'in',
  room: 0,
  exitRound: null,
  wrong: 0,
  locked: [],
  ...over,
});

function round(over: Partial<DungeonRoundView> = {}, tries: Record<string, DungeonDoorTry[]> = {}): DungeonRoundView {
  const door = (id: string, title: string) => ({ id, categoryId: id, title, kind: 'choice' as const, tolerance: null, tries: tries[id] ?? [] });
  return {
    game: 'dungeon',
    category: { id: 'dungeon', title: 'Dungeon' },
    turnOrder: ['a', 'b', 'c'],
    turnNo: 1,
    activePlayerId: null,
    eliminated: [],
    turnDeadline: null,
    soloMode: false,
    options: { rooms: 2, doors: 2, formats: ['questions'] },
    stage: 'answering',
    roundNo: 1,
    rooms: [
      [door('d1', 'Popkultur'), door('d2', 'Geografie')],
      [door('d3', 'Sport'), door('d4', 'Musik')],
    ],
    players: { a: player('a'), b: player('b'), c: player('c') },
    walk: {},
    answered: [],
    skipped: [],
    resultAt: null,
    ranking: [],
    ...over,
  } as DungeonRoundView;
}

const kinds = (xs: { event: { kind: string } }[]) => xs.map((x) => x.event.kind).sort();

describe('Dungeon-Ticker', () => {
  test('ohne alten Stand (Neuladen) kommt nichts', () => {
    expect(dungeonTicker(null, round({ stage: 'result', results: { a: { doorId: 'd1', room: 0, correct: true } } }))).toEqual([]);
  });

  test('Ergebnis: berüchtigte Tür, als Erster im neuen Raum', () => {
    const prev = round({ players: { a: player('a'), b: player('b', { wrong: 1 }), c: player('c', { wrong: 1 }) } });
    const next = round(
      {
        stage: 'result',
        resultAt: 0,
        results: { a: { doorId: 'd2', room: 0, correct: true }, b: { doorId: 'd1', room: 0, correct: false }, c: { doorId: 'd1', room: 0, correct: false } },
        players: { a: player('a', { room: 1 }), b: player('b', { wrong: 2, locked: ['d1'] }), c: player('c', { wrong: 2, locked: ['d1'] }) },
      },
      { d1: [{ playerId: 'b', correct: false }, { playerId: 'c', correct: false }], d2: [{ playerId: 'a', correct: true }] },
    );
    const items = dungeonTicker(prev, next);
    expect(kinds(items)).toEqual(['doorFails', 'first']);
    expect(items.every((x) => x.result)).toBe(true);
    expect(items.find((x) => x.event.kind === 'doorFails')!.event).toEqual({ kind: 'doorFails', door: 'Popkultur', fails: 2 });
    expect(items.find((x) => x.event.kind === 'first')!.event).toEqual({ kind: 'first', player: 'a', room: 1 });
    // Derselbe Stand noch einmal: nichts Neues.
    expect(dungeonTicker(next, next)).toEqual([]);
  });

  test('draußen mit Platz, ausgeschieden, alle falsch', () => {
    const prev = round({ players: { a: player('a', { room: 1 }), b: player('b', { room: 1 }), c: player('c', { room: 1 }) } });
    const next = round({
      stage: 'result',
      results: { a: { doorId: 'd3', room: 1, correct: true }, b: { doorId: 'd4', room: 1, correct: true }, c: { doorId: 'd3', room: 1, correct: false } },
      players: {
        a: player('a', { room: 2, status: 'out', exitRound: 1 }),
        b: player('b', { room: 2, status: 'out', exitRound: 1 }),
        c: player('c', { room: 1, status: 'eliminated' }),
      },
      ranking: [
        { playerId: 'a', place: 1, points: 3, status: 'out', room: 2, exitRound: 1, wrong: 0 },
        { playerId: 'b', place: 1, points: 3, status: 'out', room: 2, exitRound: 1, wrong: 0 },
        { playerId: 'c', place: 3, points: 1, status: 'eliminated', room: 1, exitRound: null, wrong: 1 },
      ],
    });
    const items = dungeonTicker(prev, next);
    expect(kinds(items)).toEqual(['eliminated', 'exit', 'exit']);

    const wrong = round({
      stage: 'result',
      results: { a: { doorId: 'd1', room: 0, correct: false }, b: { doorId: 'd2', room: 0, correct: false } },
    });
    expect(kinds(dungeonTicker(round(), wrong))).toEqual(['allWrong']);
  });

  test('Türwahl: wer sich an eine Tür mit zwei Gescheiterten wagt, einmal', () => {
    const tries = { d1: [{ playerId: 'b', correct: false }, { playerId: 'c', correct: false }] };
    const prev = round({ stage: 'choosing', roundNo: 2, walk: { a: { doorId: 'd1', confirmed: false } } }, tries);
    const next = round({ stage: 'choosing', roundNo: 2, walk: { a: { doorId: 'd1', confirmed: true } } }, tries);
    const items = dungeonTicker(prev, next);
    expect(items).toEqual([{ event: { kind: 'dare', player: 'a', door: 'Popkultur', fails: 2 }, result: false }]);
    expect(dungeonTicker(next, next)).toEqual([]);
  });
});
