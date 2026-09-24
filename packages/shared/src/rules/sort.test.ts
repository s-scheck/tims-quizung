import { describe, expect, test } from 'bun:test';
import { findCorrectGap, isValidPlacement, shuffle, sortCards } from './sort.ts';

describe('isValidPlacement (desc)', () => {
  const chain = [1_500_000, 550_000, 200_000];

  test('über der ersten Karte, wenn größer', () => {
    expect(isValidPlacement(chain, 3_000_000, 0, 'desc')).toBe(true);
    expect(isValidPlacement(chain, 1_000_000, 0, 'desc')).toBe(false);
  });

  test('zwischen zwei Karten', () => {
    expect(isValidPlacement(chain, 1_000_000, 1, 'desc')).toBe(true);
    expect(isValidPlacement(chain, 300_000, 1, 'desc')).toBe(false);
    expect(isValidPlacement(chain, 300_000, 2, 'desc')).toBe(true);
  });

  test('unter der letzten Karte, wenn kleiner', () => {
    expect(isValidPlacement(chain, 100_000, 3, 'desc')).toBe(true);
    expect(isValidPlacement(chain, 250_000, 3, 'desc')).toBe(false);
  });

  test('Gleichstand ist gültig, auf beiden Seiten', () => {
    expect(isValidPlacement(chain, 550_000, 1, 'desc')).toBe(true);
    expect(isValidPlacement(chain, 550_000, 2, 'desc')).toBe(true);
  });

  test('Lücke außerhalb ist ungültig', () => {
    expect(isValidPlacement(chain, 1, -1, 'desc')).toBe(false);
    expect(isValidPlacement(chain, 1, 4, 'desc')).toBe(false);
    expect(isValidPlacement(chain, 1, 1.5, 'desc')).toBe(false);
  });

  test('Kette mit nur einer Karte: über oder unter', () => {
    expect(isValidPlacement([500], 900, 0, 'desc')).toBe(true);
    expect(isValidPlacement([500], 900, 1, 'desc')).toBe(false);
    expect(isValidPlacement([500], 100, 1, 'desc')).toBe(true);
  });
});

describe('isValidPlacement (asc)', () => {
  const chain = [120, 130, 145];
  test('oben steht der kleinste Wert', () => {
    expect(isValidPlacement(chain, 110, 0, 'asc')).toBe(true);
    expect(isValidPlacement(chain, 125, 1, 'asc')).toBe(true);
    expect(isValidPlacement(chain, 125, 2, 'asc')).toBe(false);
    expect(isValidPlacement(chain, 200, 3, 'asc')).toBe(true);
  });
});

describe('findCorrectGap', () => {
  test('findet die passende Lücke', () => {
    const chain = [1000, 500, 100];
    expect(findCorrectGap(chain, 2000, 'desc')).toBe(0);
    expect(findCorrectGap(chain, 700, 'desc')).toBe(1);
    expect(findCorrectGap(chain, 300, 'desc')).toBe(2);
    expect(findCorrectGap(chain, 50, 'desc')).toBe(3);
    expect(findCorrectGap([], 50, 'desc')).toBe(0);
  });
});

describe('sortCards', () => {
  const cards = [
    { name: 'B', value: 2 },
    { name: 'A', value: 5 },
    { name: 'C', value: 2 },
  ];
  test('desc: größter Wert zuerst, Gleichstand nach Name', () => {
    expect(sortCards(cards, 'desc').map((c) => c.name)).toEqual(['A', 'B', 'C']);
  });
  test('asc: kleinster Wert zuerst', () => {
    expect(sortCards(cards, 'asc').map((c) => c.name)).toEqual(['B', 'C', 'A']);
  });
  test('verändert das Original nicht', () => {
    sortCards(cards, 'desc');
    expect(cards[0]!.name).toBe('B');
  });
});

describe('shuffle', () => {
  test('behält alle Elemente', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = shuffle(items, () => 0.42);
    expect([...out].sort()).toEqual([...items].sort());
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
