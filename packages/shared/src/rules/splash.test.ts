import { describe, expect, test } from 'bun:test';
import {
  aimBarValue,
  aimToTarget,
  blobFor,
  CANNON,
  coverage,
  emptyGrid,
  isSplashOptions,
  obstaclesAt,
  paintGrid,
  polygonArea,
  simulateShot,
  SPLASH_AREA_JITTER,
  SPLASH_BASE_AREA,
  SPLASH_DEFAULTS,
  SPLASH_FLIGHT_MS,
} from './splash.ts';

describe('Splash-Regeln', () => {
  test('Zielbalken läuft hin und her zwischen 0 und 1', () => {
    expect(aimBarValue(0, 'medium')).toBe(0);
    expect(aimBarValue(1200, 'medium')).toBeCloseTo(1);
    expect(aimBarValue(1800, 'medium')).toBeCloseTo(0.5);
    expect(aimBarValue(2400, 'medium')).toBeCloseTo(0);
  });

  test('Zielen: geradeaus nach oben, links, rechts, volle Kraft fliegt über den Rand', () => {
    const mid = aimToTarget(0.5, 0.5);
    expect(mid.x).toBeCloseTo(0.5);
    expect(mid.y).toBeLessThan(CANNON.y);
    expect(aimToTarget(0.5, 0).x).toBeLessThan(0.5);
    expect(aimToTarget(0.5, 1).x).toBeGreaterThan(0.5);
    const far = simulateShot({ power: 1, aim: 0.5, wind: null, obstacles: 0, firedAt: 0 });
    expect(far.onField).toBe(false);
    const near = simulateShot({ power: 0.5, aim: 0.5, wind: null, obstacles: 0, firedAt: 0 });
    expect(near.onField).toBe(true);
    expect(near.durationMs).toBe(SPLASH_FLIGHT_MS);
  });

  test('Wind verschiebt die Landung', () => {
    const calm = simulateShot({ power: 0.5, aim: 0.5, wind: null, obstacles: 0, firedAt: 0 });
    const windy = simulateShot({ power: 0.5, aim: 0.5, wind: { x: 0.15, y: 0 }, obstacles: 0, firedAt: 0 });
    expect(windy.landing.x).toBeGreaterThan(calm.landing.x + 0.05);
    expect(windy.landing.y).toBeCloseTo(calm.landing.y);
  });

  test('Ein Balken in der Bahn lässt die Kugel abprallen', () => {
    // Zeitpunkt suchen, zu dem der einzelne Balken mittig steht, wenn die Kugel seine Höhe kreuzt.
    const target = aimToTarget(0.6, 0.5);
    const s = (0.5 - CANNON.y) / (target.y - CANNON.y);
    let firedAt = 0;
    for (let t = 0; t < 4000; t += 5) {
      if (Math.abs(obstaclesAt(1, t + s * SPLASH_FLIGHT_MS)[0]!.x - 0.5) < 0.01) {
        firedAt = t;
        break;
      }
    }
    const shot = simulateShot({ power: 0.6, aim: 0.5, wind: null, obstacles: 1, firedAt });
    expect(shot.path.length).toBe(3);
    expect(shot.bounceAt).not.toBeNull();
    expect(shot.landing.y).toBeGreaterThan(0.5);
    // Ohne Hindernis fliegt derselbe Schuss weiter.
    expect(simulateShot({ power: 0.6, aim: 0.5, wind: null, obstacles: 0, firedAt }).path.length).toBe(2);
  });

  test('Fleck: gleiche Eingabe gleiche Form, Fläche in ±5 %, Form nicht rund', () => {
    const a = blobFor(1234, { x: 0.5, y: 0.5 });
    expect(blobFor(1234, { x: 0.5, y: 0.5 })).toEqual(a);
    for (let seed = 1; seed < 60; seed++) {
      const b = blobFor(seed, { x: 0.5, y: 0.5 });
      const area = b.polygons.reduce((acc, p) => acc + polygonArea(p), 0);
      expect(area / SPLASH_BASE_AREA).toBeGreaterThanOrEqual(1 - SPLASH_AREA_JITTER - 1e-9);
      expect(area / SPLASH_BASE_AREA).toBeLessThanOrEqual(1 + SPLASH_AREA_JITTER + 1e-9);
      expect(b.polygons.length).toBeGreaterThanOrEqual(4);
    }
    const radii = a.polygons[0]!.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5));
    expect(Math.max(...radii) / Math.min(...radii)).toBeGreaterThan(1.15);
  });

  test('Zählen: Raster passt zur Fläche, späterer Fleck übermalt, außerhalb zählt nicht', () => {
    const grid = emptyGrid();
    paintGrid(grid, blobFor(7, { x: 0.5, y: 0.5 }), 1);
    const one = coverage(grid)[1]!;
    expect(Math.abs(one - blobFor(7, { x: 0.5, y: 0.5 }).area * 100)).toBeLessThan(0.3);
    paintGrid(grid, blobFor(8, { x: 0.52, y: 0.5 }), 2);
    const both = coverage(grid);
    expect(both[1]!).toBeLessThan(one);
    expect(both[2]!).toBeGreaterThan(2.5);
    // Halb über den Rand: nur der Teil auf dem Feld zählt.
    const edge = emptyGrid();
    paintGrid(edge, blobFor(9, { x: 0, y: 0.5 }), 3);
    expect(coverage(edge)[3]!).toBeLessThan(2.2);
    const outside = emptyGrid();
    paintGrid(outside, blobFor(9, { x: 1.6, y: 0.5 }), 4);
    expect(coverage(outside)[4]).toBeUndefined();
  });

  test('Optionen prüfen', () => {
    expect(isSplashOptions(SPLASH_DEFAULTS)).toBe(true);
    expect(isSplashOptions({ ...SPLASH_DEFAULTS, obstacles: 4 })).toBe(false);
    expect(isSplashOptions({ ...SPLASH_DEFAULTS, answerSeconds: 15 })).toBe(false);
    expect(isSplashOptions({ ...SPLASH_DEFAULTS, count: 0 })).toBe(false);
    expect(isSplashOptions({ ...SPLASH_DEFAULTS, mode: 'egal' })).toBe(false);
  });
});
