import { describe, expect, test } from 'bun:test';
import { nextActivePlayer, remainingPlayers, rotateStartPlayer, rotateTo } from './turns.ts';

describe('nextActivePlayer', () => {
  const order = ['a', 'b', 'c', 'd'];

  test('reihum', () => {
    expect(nextActivePlayer(order, 'a', [])).toBe('b');
    expect(nextActivePlayer(order, 'd', [])).toBe('a');
  });

  test('überspringt Ausgeschiedene', () => {
    expect(nextActivePlayer(order, 'a', ['b', 'c'])).toBe('d');
    expect(nextActivePlayer(order, 'd', ['a'])).toBe('b');
  });

  test('einziger Übriger ist wieder selbst dran', () => {
    expect(nextActivePlayer(order, 'b', ['a', 'c', 'd'])).toBe('b');
  });

  test('niemand übrig', () => {
    expect(nextActivePlayer(order, 'a', order)).toBeNull();
    expect(nextActivePlayer([], null, [])).toBeNull();
  });

  test('aktiver Spieler nicht mehr in der Reihenfolge: vorn beginnen', () => {
    expect(nextActivePlayer(['b', 'c'], 'a', [])).toBe('b');
    expect(nextActivePlayer(order, null, ['a'])).toBe('b');
  });
});

describe('remainingPlayers', () => {
  test('filtert Ausgeschiedene in Zugreihenfolge', () => {
    expect(remainingPlayers(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
});

describe('rotateStartPlayer', () => {
  test('nächster nach dem vorigen Startspieler', () => {
    expect(rotateStartPlayer(['a', 'b', 'c'], null)).toBe('a');
    expect(rotateStartPlayer(['a', 'b', 'c'], 'a')).toBe('b');
    expect(rotateStartPlayer(['a', 'b', 'c'], 'c')).toBe('a');
    expect(rotateStartPlayer(['a', 'b', 'c'], 'x')).toBe('a');
    expect(rotateStartPlayer([], 'a')).toBeNull();
  });
});

describe('rotateTo', () => {
  test('dreht die Reihenfolge, bis der Startspieler vorn steht', () => {
    expect(rotateTo(['a', 'b', 'c'], 'b')).toEqual(['b', 'c', 'a']);
    expect(rotateTo(['a', 'b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
    expect(rotateTo(['a', 'b', 'c'], 'zz')).toEqual(['a', 'b', 'c']);
    expect(rotateTo(['a', 'b', 'c'], null)).toEqual(['a', 'b', 'c']);
  });
});
