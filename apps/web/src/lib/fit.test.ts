import { describe, expect, test } from 'bun:test';
import { FIT_DEFAULTS, fitSearch, type FitState } from './fit.ts';

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
  test('passt alles, bleibt alles wie heute', () => {
    const { fits, calls } = page({ text: 300, list: 300, image: 300, height: 1000 });
    expect(fitSearch(fits)).toEqual({ font: 16, cols: 1, media: 1 });
    expect(calls).toHaveLength(1);
  });

  test('erst schrumpft das Bild, Schrift und Spalten bleiben', () => {
    const { fits } = page({ text: 400, image: 800, height: 1000 });
    const s = fitSearch(fits);
    expect(s.font).toBe(16);
    expect(s.cols).toBe(1);
    expect(s.media).toBeLessThan(1);
    expect(s.media).toBeGreaterThanOrEqual(0.7);
    expect(fits(s)).toBe(true);
  });

  test('reicht das kleinste Bild nicht, kommen Spalten vor kleinerer Schrift', () => {
    const { fits } = page({ text: 200, list: 1500, height: 1000 });
    const s = fitSearch(fits);
    expect(s).toEqual({ font: 16, cols: 2, media: 1 });
  });

  test('reichen auch vier Spalten nicht, sinkt die Schrift auf den größten passenden Wert', () => {
    const { fits } = page({ text: 900, list: 800, height: 1000 });
    const s = fitSearch(fits);
    expect(s.cols).toBe(4);
    expect(s.font).toBeLessThan(16);
    expect(s.font).toBeGreaterThanOrEqual(FIT_DEFAULTS.minFont);
    expect(fits(s)).toBe(true);
    expect(fits({ ...s, font: s.font + 0.5 })).toBe(false);
  });

  test('unter der Mindestschrift geht es weiter, damit nichts abgeschnitten wird', () => {
    const { fits } = page({ text: 1600, height: 1000 });
    const s = fitSearch(fits);
    expect(s.font).toBeLessThan(FIT_DEFAULTS.minFont);
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
