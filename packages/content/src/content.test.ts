import { describe, expect, test } from 'bun:test';
import { CategoryValidationError, loadCategories, MIN_ITEMS, MIN_ITEMS_TOPX, MIN_PAIRS, validateCategory } from './index.ts';

describe('Kategorien im Repo', () => {
  const categories = loadCategories();
  const ranked = categories.filter((c) => c.kind === 'ranked');
  const pairs = categories.filter((c) => c.kind === 'pairs');

  test('mindestens 15 Ranglisten, alle mit genug Einträgen', () => {
    expect(ranked.length).toBeGreaterThanOrEqual(15);
    for (const c of ranked) {
      expect(c.items.length).toBeGreaterThanOrEqual(c.games.includes('sort') ? MIN_ITEMS : MIN_ITEMS_TOPX);
    }
  });

  test('IDs sind eindeutig', () => {
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length);
  });

  test('Sortieren-Kategorien haben eindeutige Werte', () => {
    for (const c of ranked.filter((c) => c.games.includes('sort'))) {
      const values = c.items.map((i) => i.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test('mindestens 10 Top-X-Listen, jede mit Quelle', () => {
    const topx = ranked.filter((c) => c.games.includes('topx'));
    expect(topx.length).toBeGreaterThanOrEqual(10);
    for (const c of topx) expect(c.source).toBeTruthy();
  });

  test('Top-X-Listen sind in Rangfolge sortiert', () => {
    for (const c of ranked.filter((c) => c.games.includes('topx'))) {
      const values = c.items.map((i) => i.value);
      const sorted = [...values].sort((a, b) => (c.order === 'desc' ? b - a : a - b));
      expect(values).toEqual(sorted);
    }
  });

  test('mindestens 10 Paarlisten mit Ködern, Köder nie unter den Zielen', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    for (const c of pairs) {
      expect(c.pairs.length).toBeGreaterThanOrEqual(MIN_PAIRS);
      expect(c.decoys.length).toBeGreaterThanOrEqual(1);
      const rights = new Set(c.pairs.map((p) => p.right.toLowerCase()));
      for (const d of c.decoys) expect(rights.has(d.toLowerCase())).toBe(false);
      expect(c.games).toEqual(['match']);
    }
  });

  test('alle vier Themenbereiche sind vertreten', () => {
    const ids = categories.map((c) => c.id);
    expect(ids).toContain('staedte-einwohner');
    expect(ids).toContain('filme-einspielergebnis');
    expect(ids).toContain('stadien-kapazitaet');
    expect(ids).toContain('tiere-gewicht');
    expect(ids).toContain('match-hauptstaedte');
  });
});

describe('validateCategory (Rangliste)', () => {
  const base = {
    id: 'test',
    title: 'T',
    question: 'Q?',
    topLabel: 'oben',
    bottomLabel: 'unten',
    unit: 'x',
    order: 'desc',
    items: Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, value: i })),
  };

  test('akzeptiert eine gültige Kategorie', () => {
    const c = validateCategory(base, 'test.json');
    expect(c.kind).toBe('ranked');
    if (c.kind !== 'ranked') return;
    expect(c.items.length).toBe(10);
    expect(c.valueFormat).toBeUndefined();
    expect(c.games).toEqual(['sort']);
  });

  test('Top-X-Listen: games, aliases, kürzer, Gleichstand erlaubt', () => {
    const topx = {
      ...base,
      games: ['topx'],
      items: [
        { name: 'A', value: 5, aliases: ['Aa'] },
        { name: 'B', value: 5 },
        { name: 'C', value: 4 },
        { name: 'D', value: 3 },
        { name: 'E', value: 2 },
      ],
    };
    const c = validateCategory(topx, 'f');
    expect(c.games).toEqual(['topx']);
    if (c.kind !== 'ranked') throw new Error();
    expect(c.items[0]?.aliases).toEqual(['Aa']);
    expect(() => validateCategory({ ...topx, items: topx.items.slice(0, 4) }, 'f')).toThrow(/mindestens 5/);
    expect(() => validateCategory({ ...topx, games: ['chess'] }, 'f')).toThrow(/games/);
    expect(() => validateCategory({ ...topx, games: [] }, 'f')).toThrow(/games/);
    expect(() => validateCategory({ ...topx, games: ['match'] }, 'f')).toThrow(/pairs/);
    expect(() => validateCategory({ ...topx, items: [{ ...topx.items[0], aliases: 'x' }, ...topx.items.slice(1)] }, 'f')).toThrow(/aliases/);
    expect(() => validateCategory({ ...topx, games: ['sort', 'topx'] }, 'f')).toThrow(/mindestens 10/);
  });

  test('lehnt zu wenige Einträge, doppelte Namen, doppelte Werte und falsche Reihenfolge ab', () => {
    expect(() => validateCategory({ ...base, items: base.items.slice(0, 9) }, 'f')).toThrow(CategoryValidationError);
    expect(() => validateCategory({ ...base, items: [...base.items.slice(0, 9), { name: 'n0', value: 99 }] }, 'f')).toThrow(/doppelter Name/);
    expect(() => validateCategory({ ...base, items: [...base.items.slice(0, 9), { name: 'X', value: 0 }] }, 'f')).toThrow(/doppelter Wert/);
    expect(() => validateCategory({ ...base, order: 'up' }, 'f')).toThrow(/order/);
    expect(() => validateCategory({ ...base, valueFormat: 'bold' }, 'f')).toThrow(/valueFormat/);
    expect(() => validateCategory({ ...base, id: 'Groß' }, 'f')).toThrow(/id/);
  });
});

describe('validateCategory (Paarliste)', () => {
  const base = {
    id: 'match-test',
    title: 'Hauptstädte',
    question: 'Welche Hauptstadt gehört zu welchem Land?',
    leftLabel: 'Hauptstadt',
    rightLabel: 'Land',
    pairs: [
      { left: 'Paris', right: 'Frankreich' },
      { left: 'Lima', right: 'Peru' },
      { left: 'Oslo', right: 'Norwegen' },
      { left: 'Ankara', right: 'Türkei' },
    ],
    decoys: ['Lettland', 'Chile'],
  };

  test('akzeptiert eine gültige Paarliste, games ist standardmäßig match', () => {
    const c = validateCategory(base, 'f');
    expect(c.kind).toBe('pairs');
    if (c.kind !== 'pairs') return;
    expect(c.games).toEqual(['match']);
    expect(c.pairs.length).toBe(4);
    expect(c.decoys).toEqual(['Lettland', 'Chile']);
    expect(validateCategory({ ...base, decoys: undefined }, 'f')).toMatchObject({ decoys: [] });
  });

  test('lehnt Fehler in Paaren und Ködern ab', () => {
    expect(() => validateCategory({ ...base, pairs: base.pairs.slice(0, 3) }, 'f')).toThrow(/mindestens 4/);
    expect(() => validateCategory({ ...base, pairs: [...base.pairs, { left: 'paris', right: 'Spanien' }] }, 'f')).toThrow(/doppelte Karte/);
    expect(() => validateCategory({ ...base, pairs: [...base.pairs, { left: 'Madrid', right: 'peru' }] }, 'f')).toThrow(/doppeltes Ziel/);
    expect(() => validateCategory({ ...base, decoys: ['Peru'] }, 'f')).toThrow(/zugleich ein Ziel/);
    expect(() => validateCategory({ ...base, decoys: ['A', 'a'] }, 'f')).toThrow(/doppelter Köder/);
    expect(() => validateCategory({ ...base, decoys: ['1', '2', '3', '4', '5', '6'] }, 'f')).toThrow(/höchstens 5/);
    expect(() => validateCategory({ ...base, games: ['sort'] }, 'f')).toThrow(/match/);
    expect(() => validateCategory({ ...base, games: ['match', 'topx'] }, 'f')).toThrow(/nur für/);
    expect(() => validateCategory({ ...base, pairs: [...base.pairs.slice(0, 3), { left: 'X' }] }, 'f')).toThrow(/right/);
  });
});
