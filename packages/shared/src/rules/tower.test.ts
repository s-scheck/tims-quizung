import { describe, expect, test } from 'bun:test';
import { seededRandom } from './splash.ts';
import {
  formCells,
  formOutline,
  isTowerFrame,
  isTowerOptions,
  packFrame,
  specialFor,
  specialWeights,
  STONE_FALLING,
  TOWER_BASIC_FORMS,
  TOWER_BOULDER,
  TOWER_FRAME_MAX_STONES,
  TOWER_GOAL_HEIGHT,
  TOWER_SPECIAL_IDS,
  TOWER_SPECIALS,
  towerMarks,
  towerPiece,
  towerPoints,
  towerRanking,
  unpackStones,
  type TowerSpecial,
} from './tower.ts';

describe('Hochstapler: Formen', () => {
  test('sieben Grundformen aus vier Quadraten, der Brocken hat fünf', () => {
    for (let f = 0; f < TOWER_BASIC_FORMS; f++) expect(formCells(f)).toHaveLength(4);
    expect(formCells(TOWER_BOULDER)).toHaveLength(5);
  });

  test('Zellen sind um die Mitte zentriert und überlappen nicht', () => {
    for (let f = 0; f <= TOWER_BOULDER; f++) {
      const cells = formCells(f);
      const xs = cells.map((c) => c.x);
      const ys = cells.map((c) => c.y);
      expect(Math.min(...xs) - 0.5 + Math.max(...xs) + 0.5).toBeCloseTo(0);
      expect(Math.min(...ys) - 0.5 + Math.max(...ys) + 0.5).toBeCloseTo(0);
      expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(cells.length);
    }
  });

  test('Umriss: innere Kanten fallen weg', () => {
    // O: 2×2 hat acht Außenkanten, I: 1×4 hat zehn.
    expect(formOutline(1)).toHaveLength(8);
    expect(formOutline(0)).toHaveLength(10);
    // Jede Kante zeigt nach außen: Mittelpunkt plus halbe Normale liegt in keiner Zelle.
    for (const [x1, y1, x2, y2, nx, ny] of formOutline(2)) {
      const px = (x1 + x2) / 2 + nx * 0.5;
      const py = (y1 + y2) / 2 + ny * 0.5;
      expect(formCells(2).some((c) => Math.abs(c.x - px) < 0.01 && Math.abs(c.y - py) < 0.01)).toBe(false);
    }
  });
});

describe('Hochstapler: Steinstrom, Ziel und Marken', () => {
  test('deterministisch, jede Grundform einmal je Siebenerblock', () => {
    const a = Array.from({ length: 70 }, (_, i) => towerPiece(1234, i));
    const b = Array.from({ length: 70 }, (_, i) => towerPiece(1234, i));
    expect(a).toEqual(b);
    for (let block = 0; block < 10; block++) {
      const forms = a.slice(block * 7, block * 7 + 7).map((p) => p.form);
      expect([...forms].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
    expect(towerPiece(1234, 0).special).toBe(false);
    const other = Array.from({ length: 70 }, (_, i) => towerPiece(99, i).form);
    expect(other).not.toEqual(a.map((p) => p.form));
  });

  test('etwa jeder zwölfte Stein ist ein Spezialstein', () => {
    let specials = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) if (towerPiece(7, i).special) specials++;
    expect(specials / n).toBeGreaterThan(1 / 16);
    expect(specials / n).toBeLessThan(1 / 9);
  });

  test('Ziellinien und Höhenmarken', () => {
    expect(TOWER_GOAL_HEIGHT.low).toBeLessThan(TOWER_GOAL_HEIGHT.mid);
    expect(TOWER_GOAL_HEIGHT.mid).toBeLessThan(TOWER_GOAL_HEIGHT.high);
    expect(towerMarks(11)).toEqual([3, 6, 9]);
    expect(towerMarks(7)).toEqual([3, 6]);
    expect(isTowerOptions({ goal: 'low' })).toBe(true);
    expect(isTowerOptions({ goal: 'riesig' })).toBe(false);
    expect(isTowerOptions(null)).toBe(false);
  });
});

describe('Hochstapler: Aufholhilfe', () => {
  const share = (rank: number, n: number, pred: (s: TowerSpecial) => boolean) => {
    const w = specialWeights(rank, n);
    const total = TOWER_SPECIAL_IDS.reduce((s, id) => s + w[id], 0);
    return TOWER_SPECIAL_IDS.filter(pred).reduce((s, id) => s + w[id], 0) / total;
  };
  const value = (rank: number, n: number) => {
    const w = specialWeights(rank, n);
    const total = TOWER_SPECIAL_IDS.reduce((s, id) => s + w[id], 0);
    return TOWER_SPECIAL_IDS.reduce((s, id) => s + w[id] * TOWER_SPECIALS[id].value, 0) / total;
  };

  test('Rückstand bringt mehr Helfer und im Schnitt nützlichere Spezials', () => {
    const helper = (s: TowerSpecial) => TOWER_SPECIALS[s].group === 'helper';
    const sight = (s: TowerSpecial) => TOWER_SPECIALS[s].group === 'sight';
    for (let rank = 1; rank < 6; rank++) {
      expect(share(rank + 1, 6, helper)).toBeGreaterThan(share(rank, 6, helper));
      expect(share(rank + 1, 6, sight)).toBeLessThan(share(rank, 6, sight));
      expect(value(rank + 1, 6)).toBeGreaterThan(value(rank, 6));
    }
    expect(share(6, 6, helper)).toBeGreaterThan(0.6);
    expect(share(1, 6, helper)).toBeLessThan(0.3);
  });

  test('specialFor zieht nach Gewicht', () => {
    const rnd = seededRandom(5);
    const count = (rank: number) => {
      let helpers = 0;
      for (let i = 0; i < 4000; i++) if (TOWER_SPECIALS[specialFor(rank, 4, rnd)].group === 'helper') helpers++;
      return helpers / 4000;
    };
    expect(count(4)).toBeGreaterThan(count(1) + 0.3);
    expect(TOWER_SPECIAL_IDS).toContain(specialFor(1, 1, () => 0.999999));
    expect(specialFor(1, 3, () => 0)).toBe('glue');
  });
});

describe('Hochstapler: Rangliste', () => {
  test('Sieger nach Zeit vorne, Rest nach Höhe, gleich hoch teilt sich den Platz', () => {
    const ranking = towerRanking([
      { playerId: 'a', height: 5.04, finishedAt: null },
      { playerId: 'b', height: 11.2, finishedAt: 9000 },
      { playerId: 'c', height: 7.5, finishedAt: null },
      { playerId: 'd', height: 4.96, finishedAt: null },
      { playerId: 'e', height: 2, finishedAt: null },
    ]);
    expect(ranking.map((r) => [r.playerId, r.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
      ['d', 3],
      ['e', 5],
    ]);
    expect(towerPoints(ranking)).toEqual({ b: 5, c: 4, a: 3, d: 3, e: 1 });
  });

  test('mehrere Sieger nach Fertig-Zeit', () => {
    const ranking = towerRanking([
      { playerId: 'a', height: 12, finishedAt: 5000 },
      { playerId: 'b', height: 11, finishedAt: 4000 },
    ]);
    expect(ranking.map((r) => r.playerId)).toEqual(['b', 'a']);
    expect(ranking.map((r) => r.rank)).toEqual([1, 2]);
  });
});

describe('Hochstapler: Frame', () => {
  const stone = (id: number) => ({ id, form: id % 8, x: 1.23456, y: 3.98765, a: 0.123456, flags: id === 0 ? STONE_FALLING : 0 });

  test('packen und entpacken rundet und behält die Steine', () => {
    const frame = packFrame({ t: 1000.4, h: 4.567, fx: 3, hold: 0.5, next: 2, stones: [stone(0), stone(1)] });
    expect(isTowerFrame(frame)).toBe(true);
    expect(frame.s).toHaveLength(12);
    expect(unpackStones(frame.s)).toEqual([
      { id: 0, form: 0, x: 1.23, y: 3.99, a: 0.123, flags: STONE_FALLING },
      { id: 1, form: 1, x: 1.23, y: 3.99, a: 0.123, flags: 0 },
    ]);
    expect(frame.t).toBe(1000);
  });

  test('voller Frame bleibt unter 16 KB', () => {
    const many = Array.from({ length: TOWER_FRAME_MAX_STONES + 20 }, (_, i) => ({ id: 100000 + i, form: 7, x: -12.345, y: 55.555, a: -123.4567, flags: 31 }));
    const frame = packFrame({ t: 1_800_000_000_000, h: 55.55, fx: 63, hold: 1, next: 8, stones: many });
    expect(frame.s.length).toBe(TOWER_FRAME_MAX_STONES * 6);
    expect(isTowerFrame(frame)).toBe(true);
    expect(JSON.stringify({ type: 'tower_frame', frame }).length).toBeLessThan(16 * 1024);
  });

  test('ungültige Frames werden abgelehnt', () => {
    const ok = packFrame({ t: 1, h: 1, fx: 0, hold: 0, next: 0, stones: [stone(1)] });
    expect(isTowerFrame(ok)).toBe(true);
    expect(isTowerFrame({ ...ok, s: [1, 2, 3] })).toBe(false);
    expect(isTowerFrame({ ...ok, s: [1, 99, 0, 0, 0, 0] })).toBe(false);
    expect(isTowerFrame({ ...ok, s: [1, 0, Number.NaN, 0, 0, 0] })).toBe(false);
    expect(isTowerFrame({ ...ok, s: [1, 0, 0, 0, 0, 64] })).toBe(false);
    expect(isTowerFrame({ ...ok, s: new Array((TOWER_FRAME_MAX_STONES + 1) * 6).fill(0) })).toBe(false);
    expect(isTowerFrame({ ...ok, h: -1 })).toBe(false);
    expect(isTowerFrame({ ...ok, next: 9 })).toBe(false);
    expect(isTowerFrame({ ...ok, extra: 'x' })).toBe(false);
    expect(isTowerFrame([1, 2])).toBe(false);
  });
});
