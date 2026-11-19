import { describe, expect, test } from 'bun:test';
import { dungeonRanking, isDungeonOptions, judgeFree, judgeMap, judgeTopX, judgeYear, toleranceFor, DUNGEON_DEFAULTS, type DungeonStanding } from './dungeon.ts';

describe('Dungeon-Regeln', () => {
  test('Grenzen werden von Raum zu Raum strenger', () => {
    expect([0, 1, 2, 3, 4].map((i) => toleranceFor('map', i, 5))).toEqual([500, 400, 350, 250, 150]);
    expect([0, 1, 2, 3, 4].map((i) => toleranceFor('timeline', i, 5))).toEqual([10, 8, 6, 4, 2]);
    expect(toleranceFor('topx', 0, 5)).toBe(20);
    expect(toleranceFor('topx', 4, 5)).toBe(5);
    expect(toleranceFor('topx', 2, 3)).toBe(5);
  });

  test('Prüfen: frei, Karte, Jahr, Top X', () => {
    expect(judgeFree('goethe', 'Johann Wolfgang von Goethe')).toBe(true);
    expect(judgeFree('Acht', '8', ['acht'])).toBe(true);
    expect(judgeFree('Schiller', 'Goethe')).toBe(false);
    const berlin = { lat: 52.52, lng: 13.405 };
    expect(judgeMap({ lat: 52.4, lng: 13.06 }, berlin, 150).correct).toBe(true);
    expect(judgeMap({ lat: 48.86, lng: 2.35 }, berlin, 500).correct).toBe(false);
    expect(judgeYear(1792, 1789, 1799, 0)).toEqual({ correct: true, off: 0 });
    expect(judgeYear(1802, 1789, 1799, 2).correct).toBe(false);
    expect(judgeYear(1801, 1789, 1799, 2).correct).toBe(true);
    const items = [{ name: 'Russland' }, { name: 'Kanada' }, { name: 'USA', aliases: ['Vereinigte Staaten'] }];
    expect(judgeTopX('vereinigte staaten', items, 3)).toBe(3);
    expect(judgeTopX('USA', items, 2)).toBeNull();
  });

  test('Optionen werden geprüft', () => {
    expect(isDungeonOptions(DUNGEON_DEFAULTS)).toBe(true);
    expect(isDungeonOptions({ ...DUNGEON_DEFAULTS, rooms: 8 })).toBe(false);
    expect(isDungeonOptions({ ...DUNGEON_DEFAULTS, doors: 2 })).toBe(false);
    expect(isDungeonOptions({ ...DUNGEON_DEFAULTS, formats: [] })).toBe(false);
    expect(isDungeonOptions({ ...DUNGEON_DEFAULTS, formats: ['map', 'map'] })).toBe(false);
    expect(isDungeonOptions({ ...DUNGEON_DEFAULTS, formats: ['songs'] })).toBe(false);
  });

  test('Rangliste: Ausgang nach Runden, dann Raum, Ausgeschiedene hinten, geteilte Plätze', () => {
    const s = (playerId: string, status: DungeonStanding['status'], room: number, exitRound: number | null, wrong: number): DungeonStanding => ({ playerId, status, room, exitRound, wrong });
    const ranking = dungeonRanking([
      s('raus7', 'out', 5, 7, 2),
      s('raus6a', 'out', 5, 6, 1),
      s('raus6b', 'out', 5, 6, 1),
      s('raum3', 'in', 3, null, 0),
      s('raum3weg', 'eliminated', 3, null, 0),
      s('raum4', 'in', 4, null, 5),
    ]);
    expect(ranking.map((r) => [r.playerId, r.place, r.points])).toEqual([
      ['raus6a', 1, 6],
      ['raus6b', 1, 6],
      ['raus7', 3, 4],
      ['raum4', 4, 3],
      ['raum3', 5, 2],
      ['raum3weg', 6, 1],
    ]);
  });
});
