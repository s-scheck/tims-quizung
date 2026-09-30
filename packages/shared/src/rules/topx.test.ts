import { describe, expect, test } from 'bun:test';
import { matchGuess, normalizeGuess } from './topx.ts';

describe('normalizeGuess', () => {
  test('Kleinschreibung, Akzente, Umlaute, Satzzeichen', () => {
    expect(normalizeGuess('Kylian Mbappé')).toBe('kylian mbappe');
    expect(normalizeGuess('  Gerd  MÜLLER ')).toBe('gerd mueller');
    expect(normalizeGuess('Weiß')).toBe('weiss');
    expect(normalizeGuess("Shaquille O'Neal")).toBe('shaquille o neal');
    expect(normalizeGuess('Avatar: The Way of Water!')).toBe('avatar the way of water');
    expect(normalizeGuess('')).toBe('');
  });
});

describe('matchGuess', () => {
  const cards = [
    { rank: 1, name: 'Kylian Mbappé', aliases: ['Mbappe'] },
    { rank: 2, name: 'Erling Haaland' },
    { rank: 3, name: 'Gerd Müller' },
    { rank: 4, name: 'Thomas Müller', aliases: ['Tommy'] },
    { rank: 5, name: 'Pedri' },
    { rank: 6, name: 'FC Bayern München', aliases: ['Bayern', 'FC Bayern'] },
  ];

  test('voller Name, egal wie geschrieben', () => {
    expect(matchGuess('kylian mbappe', cards)).toBe(1);
    expect(matchGuess('ERLING HAALAND', cards)).toBe(2);
    expect(matchGuess('Gerd Mueller', cards)).toBe(3);
    expect(matchGuess('Gerd Müller', cards)).toBe(3);
  });

  test('Alias', () => {
    expect(matchGuess('Mbappe', cards)).toBe(1);
    expect(matchGuess('tommy', cards)).toBe(4);
    expect(matchGuess('bayern', cards)).toBe(6);
  });

  test('eindeutiger Nachname trifft, mehrdeutiger nicht', () => {
    expect(matchGuess('Haaland', cards)).toBe(2);
    expect(matchGuess('Müller', cards)).toBeNull();
    expect(matchGuess('Mueller', cards)).toBeNull();
    expect(matchGuess('München', cards)).toBe(6);
  });

  test('einteilige Namen und kurze Tokens', () => {
    expect(matchGuess('Pedri', cards)).toBe(5);
    expect(matchGuess('FC', cards)).toBeNull();
  });

  test('keine Tippfehler-Toleranz, kein Teilstring', () => {
    expect(matchGuess('Halaand', cards)).toBeNull();
    expect(matchGuess('Erling', cards)).toBeNull();
    expect(matchGuess('Kylian Mbappé Lottin', cards)).toBeNull();
    expect(matchGuess('', cards)).toBeNull();
    expect(matchGuess('   ', cards)).toBeNull();
  });
});
