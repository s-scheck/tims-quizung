import { describe, expect, test } from 'bun:test';
import { CategoryValidationError, loadCategories, MIN_ITEMS, validateCategory } from './index.ts';

describe('Kategorien im Repo', () => {
  const categories = loadCategories();

  test('mindestens 15 Kategorien, alle mit genug Einträgen', () => {
    expect(categories.length).toBeGreaterThanOrEqual(15);
    for (const c of categories) expect(c.items.length).toBeGreaterThanOrEqual(MIN_ITEMS);
  });

  test('IDs sind eindeutig', () => {
    expect(new Set(categories.map((c) => c.id)).size).toBe(categories.length);
  });

  test('Werte sind innerhalb einer Kategorie eindeutig und sortierbar', () => {
    for (const c of categories) {
      const values = c.items.map((i) => i.value);
      expect(new Set(values).size).toBe(values.length);
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
