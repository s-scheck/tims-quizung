import { describe, expect, test } from 'bun:test';
import { MORSE_SUGGESTIONS, MORSE_TABLE, compactMorseText, morseDurationMs, morseSchedule, normalizeMorseText, toMorse } from './morse.ts';

describe('normalizeMorseText', () => {
  test('Großschreibung, Umlaute, Sonderzeichen, Leerzeichen', () => {
    expect(normalizeMorseText('  hallo   Welt! ')).toBe('HALLO WELT');
    expect(normalizeMorseText('Käse-Brötchen süß')).toBe('KAESE BROETCHEN SUESS');
    expect(normalizeMorseText('Crème brûlée')).toBe('CREME BRULEE');
    expect(normalizeMorseText('R2-D2')).toBe('R2 D2');
    expect(normalizeMorseText('!!!')).toBe('');
  });

  test('compactMorseText vergleicht ohne Leerzeichen', () => {
    expect(compactMorseText('star wars')).toBe('STARWARS');
    expect(compactMorseText('Starwars')).toBe(compactMorseText('STAR WARS'));
  });
});

describe('toMorse', () => {
  test('bekannte Codes', () => {
    expect(toMorse('SOS')).toBe('... --- ...');
    expect(toMorse('Hallo Welt')).toBe('.... .- .-.. .-.. --- / .-- . .-.. -');
    expect(toMorse('e')).toBe('.');
    expect(toMorse('42')).toBe('....- ..---');
  });

  test('Tabelle ist vollständig und eindeutig', () => {
    expect(Object.keys(MORSE_TABLE).length).toBe(36);
    expect(new Set(Object.values(MORSE_TABLE)).size).toBe(36);
    expect(Object.values(MORSE_TABLE).every((c) => /^[.-]+$/.test(c))).toBe(true);
  });
});

describe('morseSchedule', () => {
  test('Punkt, Strich und Pausen', () => {
    // A = .- : Punkt 1, Pause 1, Strich 3
    expect(morseSchedule('.-', 100)).toEqual([
      { at: 0, duration: 100 },
      { at: 200, duration: 300 },
    ]);
  });

  test('Zeichen- und Wortpausen', () => {
    // "E E / E": Punkt, 3 Pause, Punkt, 7 Pause, Punkt
    expect(morseSchedule('. . / .', 10)).toEqual([
      { at: 0, duration: 10 },
      { at: 40, duration: 10 },
      { at: 120, duration: 10 },
    ]);
    expect(morseDurationMs('. . / .', 10)).toBe(130);
    expect(morseDurationMs('', 10)).toBe(0);
  });
});

describe('MORSE_SUGGESTIONS', () => {
  test('alle Vorschläge sind normalisiert und morsbar', () => {
    expect(MORSE_SUGGESTIONS.length).toBeGreaterThanOrEqual(50);
    for (const w of MORSE_SUGGESTIONS) {
      expect(normalizeMorseText(w)).toBe(w);
      expect(toMorse(w).length).toBeGreaterThan(0);
      expect(w.length).toBeLessThanOrEqual(30);
    }
  });
});
