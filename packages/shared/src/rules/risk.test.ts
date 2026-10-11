import { describe, expect, test } from 'bun:test';
import { scoreRiskPass } from './risk.ts';

describe('No Risk No Fun: Punkte', () => {
  const players = ['a', 'b', 'c', 'd'];

  test('Platz gibt Punkte, Fehltipp und kein Tipp die Fehltipp-Punkte', () => {
    expect(scoreRiskPass(players, { a: 1, b: 35, c: null }, { duplicates: 'both', missPoints: 0 })).toEqual({ a: 1, b: 35, c: 0, d: 0 });
    expect(scoreRiskPass(players, { a: 1, b: 35, c: null }, { duplicates: 'both', missPoints: -10 })).toEqual({ a: 1, b: 35, c: -10, d: -10 });
  });

  test('gleicher Treffer: beide punkten oder beide gehen leer aus', () => {
    const ranks = { a: 12, b: 12, c: 40, d: null };
    expect(scoreRiskPass(players, ranks, { duplicates: 'both', missPoints: 0 })).toEqual({ a: 12, b: 12, c: 40, d: 0 });
    expect(scoreRiskPass(players, ranks, { duplicates: 'none', missPoints: -10 })).toEqual({ a: 0, b: 0, c: 40, d: -10 });
  });
});
