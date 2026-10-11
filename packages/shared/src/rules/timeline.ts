/** Frühestes und spätestes Jahr auf dem Zeitstrahl. Negativ heißt v. Chr., ein Jahr 0 gibt es nicht. */
export const TIMELINE_MIN_YEAR = -4000;
export const TIMELINE_MAX_YEAR = 2030;

export function isTimelineYear(year: unknown): year is number {
  return Number.isInteger(year) && year !== 0 && (year as number) >= TIMELINE_MIN_YEAR && (year as number) <= TIMELINE_MAX_YEAR;
}

/** Lückenlose Achse ohne Jahr 0: 1 v. Chr. liegt bei 0, 1 n. Chr. bei 1. */
export function yearToAxis(year: number): number {
  return year < 0 ? year + 1 : year;
}

/** Gegenstück zu `yearToAxis`, rundet auf das nächste ganze Jahr. */
export function axisToYear(axis: number): number {
  const n = Math.round(axis);
  return n <= 0 ? n - 1 : n;
}

/** Verschiebt ein Jahr um `delta` Jahre und bleibt auf dem Zeitstrahl. */
export function shiftYear(year: number, delta: number): number {
  const axis = yearToAxis(year) + delta;
  return axisToYear(Math.min(yearToAxis(TIMELINE_MAX_YEAR), Math.max(yearToAxis(TIMELINE_MIN_YEAR), axis)));
}

/** Jahre zwischen zwei Jahreszahlen, ohne das nicht existierende Jahr 0 mitzuzählen. */
export function yearsBetween(a: number, b: number): number {
  return Math.abs(yearToAxis(a) - yearToAxis(b));
}

/** Abstand eines Tipps zum Ereignis: 0 innerhalb der Spanne, sonst zur näheren Grenze. */
export function yearDistance(year: number, from: number, to: number): number {
  if (year >= from && year <= to) return 0;
  return year < from ? yearsBetween(year, from) : yearsBetween(year, to);
}
