import { describe, expect, test } from 'bun:test';
import { axisToYear, isTimelineYear, shiftYear, TIMELINE_MAX_YEAR, TIMELINE_MIN_YEAR, yearDistance, yearsBetween, yearToAxis } from './timeline.ts';

describe('Zeitstrahl-Regeln', () => {
  test('gültige Jahre: ganzzahlig, im Bereich, ohne Jahr 0', () => {
    expect(isTimelineYear(1789)).toBe(true);
    expect(isTimelineYear(-44)).toBe(true);
    expect(isTimelineYear(0)).toBe(false);
    expect(isTimelineYear(1789.5)).toBe(false);
    expect(isTimelineYear(-5000)).toBe(false);
    expect(isTimelineYear(3000)).toBe(false);
    expect(isTimelineYear('1789')).toBe(false);
  });

  test('über die Zeitenwende fehlt das Jahr 0', () => {
    expect(yearsBetween(-1, 1)).toBe(1);
    expect(yearsBetween(-44, 14)).toBe(57);
    expect(yearsBetween(1900, 1950)).toBe(50);
  });

  test('Achse ohne Lücke, Verschieben über die Zeitenwende und an den Rändern', () => {
    expect(yearToAxis(-1)).toBe(0);
    expect(yearToAxis(1)).toBe(1);
    expect(axisToYear(0)).toBe(-1);
    expect(axisToYear(0.6)).toBe(1);
    expect(axisToYear(-43.2)).toBe(-44);
    for (const y of [-44, -1, 1, 1789]) expect(axisToYear(yearToAxis(y))).toBe(y);
    expect(shiftYear(-1, 1)).toBe(1);
    expect(shiftYear(1, -1)).toBe(-1);
    expect(shiftYear(-5, 10)).toBe(6);
    expect(shiftYear(TIMELINE_MAX_YEAR - 3, 10)).toBe(TIMELINE_MAX_YEAR);
    expect(shiftYear(TIMELINE_MIN_YEAR + 3, -10)).toBe(TIMELINE_MIN_YEAR);
  });

  test('Abstand ist 0 innerhalb der Spanne, sonst zur näheren Grenze', () => {
    expect(yearDistance(1942, 1939, 1945)).toBe(0);
    expect(yearDistance(1939, 1939, 1945)).toBe(0);
    expect(yearDistance(1930, 1939, 1945)).toBe(9);
    expect(yearDistance(1950, 1939, 1945)).toBe(5);
    expect(yearDistance(1789, 1789, 1789)).toBe(0);
    expect(yearDistance(-10, 5, 5)).toBe(14);
  });
});
