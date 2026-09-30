import { describe, expect, test } from 'bun:test';
import { CategoryValidationError, loadCategories, MIN_ITEMS, MIN_ITEMS_TOPX, validateCategory } from './index.ts';

describe('Kategorien im Repo', () => {
  const categories = loadCategories();

  test('mindestens 15 Kategorien, alle mit genug Einträgen', () => {
    expect(categories.length).toBeGreaterThanOrEqual(15);
    for (const c of categories) {
      expect(c.items.length).toBeGreaterThanOrEqual(c.games.includes('sort') ? MIN_ITEMS : MIN_ITEMS_TOPX);
    }
  });

  test('IDs sind eindeutig', () => {
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length);
  });

  test('Sortieren-Kategorien haben eindeutige Werte', () => {
    for (const c of categories.filter((c) => c.games.includes('sort'))) {
      const values = c.items.map((i) => i.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  test('mindestens 10 Top-X-Listen, jede mit Quelle', () => {
    const topx = categories.filter((c) => c.games.includes('topx'));
    expect(topx.length).toBeGreaterThanOrEqual(10);
    for (const c of topx) expect(c.source).toBeTruthy();
  });

  test('Top-X-Listen sind in Rangfolge sortiert', () => {
    for (const c of categories.filter((c) => c.games.includes('topx'))) {
      const values = c.items.map((i) => i.value);
      const sorted = [...values].sort((a, b) => (c.order === 'desc' ? b - a : a - b));
      expect(values).toEqual(sorted);
    }
  });

  test('alle vier Themenbereiche sind vertreten', () => {
    const ids = categories.map((c) => c.id);
    expect(ids).toContain('staedte-einwohner');
    expect(ids).toContain('filme-einspielergebnis');
    expect(ids).toContain('stadien-kapazitaet');
    expect(ids).toContain('tiere-gewicht');
  });
});

describe('validateCategory', () => {
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
    expect(c.items[0]?.aliases).toEqual(['Aa']);
    expect(() => validateCategory({ ...topx, items: topx.items.slice(0, 4) }, 'f')).toThrow(/mindestens 5/);
    expect(() => validateCategory({ ...topx, games: ['chess'] }, 'f')).toThrow(/games/);
    expect(() => validateCategory({ ...topx, games: [] }, 'f')).toThrow(/games/);
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
