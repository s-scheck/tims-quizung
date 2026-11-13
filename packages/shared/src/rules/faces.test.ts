import { describe, expect, test } from 'bun:test';
import { autoRevealedTiles, autoTileOrder, matchPersonName } from './faces.ts';

describe('matchPersonName', () => {
  test('Name, Alias, Nachname und kleine Tippfehler', () => {
    expect(matchPersonName('Angela Merkel', 'Angela Merkel')).toBe(true);
    expect(matchPersonName('angela merkl', 'Angela Merkel')).toBe(true);
    expect(matchPersonName('merkel', 'Angela Merkel')).toBe(true);
    expect(matchPersonName('Mutti', 'Angela Merkel', ['Mutti'])).toBe(true);
    expect(matchPersonName('Beyonce', 'Beyoncé')).toBe(true);
    expect(matchPersonName('Leonardo DiCaprio', 'Leonardo DiCaprio')).toBe(true);
    expect(matchPersonName('Leonardo di caprio', 'Leonardo DiCaprio')).toBe(true);
  });

  test('Vorname allein, falsche Personen und kurze Tippfehler zählen nicht', () => {
    expect(matchPersonName('Angela', 'Angela Merkel')).toBe(false);
    expect(matchPersonName('Merkl', 'Angela Merkel')).toBe(false);
    expect(matchPersonName('Olaf Scholz', 'Angela Merkel')).toBe(false);
    expect(matchPersonName('Pink', 'Pitt')).toBe(false);
    expect(matchPersonName('', 'Angela Merkel')).toBe(false);
  });
});

describe('Kacheln im automatischen Modus', () => {
  test('gleiche Reihenfolge je Seed, Anteil folgt der Stärke', () => {
    expect(autoTileOrder(20, 42)).toEqual(autoTileOrder(20, 42));
    expect([...autoTileOrder(20, 42)].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(autoRevealedTiles(20, 7, 100)).toEqual([]);
    expect(autoRevealedTiles(20, 7, 90)).toHaveLength(2);
    expect(autoRevealedTiles(20, 7, 0)).toHaveLength(20);
    expect(autoRevealedTiles(20, 7, 80)).toEqual(expect.arrayContaining(autoRevealedTiles(20, 7, 90)));
  });
});
