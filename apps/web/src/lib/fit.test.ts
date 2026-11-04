import { describe, expect, test } from 'bun:test';
import { FIT_DEFAULTS, columnsFor, fitSearch, type FitState } from './fit.ts';

/**
 * Modell einer Seite: Text wächst mit der Schrift, eine Liste teilt sich auf Spalten auf,
 * ein Bild hat eine feste Höhe mal Faktor. Passt, wenn die Summe in die Höhe passt.
 */
function page(opts: { text: number; list?: number; image?: number; height: number }) {
  const calls: FitState[] = [];
  const fits = (s: FitState) => {
    calls.push(s);
    const scale = s.font / 16;
    const listHeight = ((opts.list ?? 0) * scale) / s.cols;
    return opts.text * scale + listHeight + (opts.image ?? 0) * s.media <= opts.height;
  };
  return { fits, calls };
}

describe('Fernsehansicht einpassen', () => {
  test('viel Platz: die Schrift wächst bis zum Höchstwert', () => {
    const { fits } = page({ text: 300, height: 1000 });
    expect(fitSearch(fits)).toEqual({ font: FIT_DEFAULTS.maxFont, cols: 1, media: 1 });
  });

  test('etwas Platz: die Schrift wächst, das Bild gibt dafür höchstens bis growMinMedia nach', () => {
    const { fits } = page({ text: 400, image: 300, height: 1000 });
    expect(fitSearch(fits)).toEqual({ font: FIT_DEFAULTS.maxFont, cols: 1, media: 1 });
    const tight = page({ text: 500, image: 600, height: 1000 });
    const t = fitSearch(tight.fits);
    expect(t.font).toBeGreaterThan(16);
    expect(t.media).toBeGreaterThanOrEqual(FIT_DEFAULTS.growMinMedia);
    expect(tight.fits(t)).toBe(true);
    expect(tight.fits({ ...t, font: t.font + 0.5, media: FIT_DEFAULTS.growMinMedia })).toBe(false);
  });

  test('Spalten erlauben größere Schrift', () => {
    const { fits } = page({ text: 100, list: 2000, height: 1000 });
    const s = fitSearch(fits);
    expect(s.cols).toBeGreaterThan(1);
    expect(s.font).toBeGreaterThan(16);
    expect(fits(s)).toBe(true);
  });

  test('passt es bei Grundschrift nicht, schrumpft zuerst das Bild', () => {
    const { fits } = page({ text: 600, image: 800, height: 1000 });
    const s = fitSearch(fits);
    expect(s.font).toBe(16);
    expect(s.cols).toBe(1);
    expect(s.media).toBeLessThan(FIT_DEFAULTS.growMinMedia);
    expect(s.media).toBeGreaterThanOrEqual(0.45);
  });

  test('reicht das kleinste Bild nicht, sinkt die Schrift auf den größten passenden Wert', () => {
    const { fits } = page({ text: 900, image: 500, height: 1000 });
    const s = fitSearch(fits);
    expect(s.font).toBeLessThan(16);
    expect(s.font).toBeGreaterThanOrEqual(FIT_DEFAULTS.minFont);
    expect(fits(s)).toBe(true);
    expect(fits({ ...s, font: s.font + 0.5 })).toBe(false);
  });

  test('unter der Mindestschrift geht es weiter, damit nichts abgeschnitten wird', () => {
    const { fits } = page({ text: 1600, height: 1000 });
    const s = fitSearch(fits);
    expect(s.font).toBe(10);
    expect(fits(s)).toBe(true);
  });

  test('passt gar nichts, bleibt es bei der Notfallgrenze', () => {
    const { fits } = page({ text: 10_000, height: 1000 });
    expect(fitSearch(fits)).toEqual({ font: FIT_DEFAULTS.floorFont, cols: FIT_DEFAULTS.maxCols, media: FIT_DEFAULTS.minMedia });
  });

  test('ohne Listen und Bilder wird nur die Schrift gesucht', () => {
    const { fits, calls } = page({ text: 1100, height: 1000 });
    fitSearch(fits, { ...FIT_DEFAULTS, maxCols: 1, minMedia: 1 });
    expect(calls.every((c) => c.cols === 1 && c.media === 1)).toBe(true);
  });
});

describe('Spalten mit Mindestbreite', () => {
  test('nie mehr Spalten, als mit Mindestbreite passen', () => {
    expect(columnsFor(1000, 300, 16, 4)).toBe(3);
    expect(columnsFor(1000, 300, 16, 2)).toBe(2);
    expect(columnsFor(200, 300, 16, 4)).toBe(1);
    expect(columnsFor(632, 300, 16, 4)).toBe(2);
  });
});
