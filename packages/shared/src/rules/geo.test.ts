import { describe, expect, test } from 'bun:test';
import { haversineKm, isValidLatLng, normalizeLng } from './geo.ts';

describe('haversineKm', () => {
  test('Berlin nach Paris etwa 878 km', () => {
    const d = haversineKm({ lat: 52.52, lng: 13.405 }, { lat: 48.8566, lng: 2.3522 });
    expect(d).toBeGreaterThan(870);
    expect(d).toBeLessThan(885);
  });

  test('gleicher Punkt ist 0, Antipoden etwa 20015 km', () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Math.round(d)).toBe(20015);
  });

  test('ist symmetrisch und über die Datumsgrenze korrekt', () => {
    const a = { lat: 35.6762, lng: 139.6503 };
    const b = { lat: 37.7749, lng: -122.4194 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
    expect(haversineKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeLessThan(120);
  });
});

describe('Koordinaten', () => {
  test('isValidLatLng', () => {
    expect(isValidLatLng(0, 0)).toBe(true);
    expect(isValidLatLng(-90, 180)).toBe(true);
    expect(isValidLatLng(90.1, 0)).toBe(false);
    expect(isValidLatLng(0, -180.1)).toBe(false);
    expect(isValidLatLng(Number.NaN, 0)).toBe(false);
    expect(isValidLatLng('0', 0)).toBe(false);
  });

  test('normalizeLng bringt Weltkopien zurück', () => {
    expect(normalizeLng(190)).toBe(-170);
    expect(normalizeLng(-190)).toBe(170);
    expect(normalizeLng(540)).toBe(180);
    expect(normalizeLng(13.4)).toBeCloseTo(13.4, 9);
    expect(normalizeLng(-180)).toBe(-180);
  });
});
