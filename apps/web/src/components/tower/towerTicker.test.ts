import { describe, expect, test } from 'bun:test';
import type { TowerEffectView } from '@quiz/shared';
import { TowerTickerState, type TickerInput } from './towerTicker.ts';

const base = (over: Partial<TickerInput> = {}): TickerInput => ({
  now: 0,
  goal: 16,
  players: ['a', 'b'],
  heights: { a: 0, b: 0 },
  holds: {},
  marks: {},
  effects: [],
  ...over,
});
const effect = (id: number, by = 'a', target = 'b'): TowerEffectView => ({ id, special: 'gust', by, target, at: 0, until: 3000 });

describe('Hochstapler-Ticker', () => {
  test('Bestehendes beim ersten Stand wird still übernommen, Neues angesagt', () => {
    const t = new TowerTickerState();
    expect(t.observe(base({ effects: [effect(1)], marks: { a: [3] }, heights: { a: 4, b: 1 } }))).toEqual([]);
    const items = t.observe(base({ now: 6000, effects: [effect(1), effect(2, 'b', 'a')], marks: { a: [3], b: [3, 6] }, heights: { a: 4, b: 6.2 } }));
    expect(items.map((i) => i.kind).sort()).toEqual(['effect', 'lead', 'mark']);
    expect(items.find((i) => i.kind === 'mark')).toMatchObject({ player: 'b', value: 6 });
    expect(items.find((i) => i.kind === 'effect')).toMatchObject({ player: 'b', target: 'a', special: 'gust' });
    expect(items.find((i) => i.kind === 'lead')).toMatchObject({ player: 'b' });
  });

  test('jeder neue Zauber kommt genau einmal', () => {
    const t = new TowerTickerState();
    t.observe(base());
    const items = t.observe(base({ now: 10, effects: [{ ...effect(3), special: 'mini' }] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'effect', player: 'a', target: 'b', special: 'mini' });
    expect(t.observe(base({ now: 20, effects: [{ ...effect(3), special: 'mini' }] }))).toEqual([]);
  });

  test('Führung flackert nicht: Vorsprung und Abklingzeit', () => {
    const t = new TowerTickerState();
    t.observe(base());
    expect(t.observe(base({ now: 100, heights: { a: 2, b: 0 } }))).toEqual([]); // erste Führung nur gemerkt
    expect(t.observe(base({ now: 200, heights: { a: 2, b: 2.2 } }))).toEqual([]); // zu knapp
    expect(t.observe(base({ now: 300, heights: { a: 2, b: 2.6 } }))).toEqual([]); // zu früh
    expect(t.observe(base({ now: 6000, heights: { a: 2, b: 2.6 } })).map((i) => i.kind)).toEqual(['lead']);
  });

  test('kurz vorm Ziel, Halten und Einsturz je einmal', () => {
    const t = new TowerTickerState();
    t.observe(base({ heights: { a: 5, b: 0 } }));
    expect(t.observe(base({ now: 10, heights: { a: 14.5, b: 0 } })).map((i) => i.kind)).toEqual(['close']);
    expect(t.observe(base({ now: 20, heights: { a: 15, b: 0 } }))).toEqual([]);
    expect(t.observe(base({ now: 30, heights: { a: 16.2, b: 0 }, holds: { a: 0.1 } })).map((i) => i.kind)).toEqual(['hold']);
    expect(t.observe(base({ now: 40, heights: { a: 16.2, b: 0 }, holds: { a: 0.4 } }))).toEqual([]);
    const drop = t.observe(base({ now: 50, heights: { a: 12, b: 0 } }));
    expect(drop).toHaveLength(1);
    expect(drop[0]).toMatchObject({ kind: 'drop', player: 'a' });
    // Nach dem Einsturz zählt die neue Höhe als Ausgang.
    expect(t.observe(base({ now: 60, heights: { a: 11, b: 0 } }))).toEqual([]);
  });
});
