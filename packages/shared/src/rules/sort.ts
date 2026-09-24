import type { SortOrder } from '../types.ts';

/**
 * Liegt `value` in Lücke `gapIndex` einer Kette, deren Werte bereits in Spielreihenfolge liegen?
 * Lücke 0 ist über der ersten Karte, Lücke `chainValues.length` unter der letzten.
 * Gleichstand mit einem Nachbarn gilt als gültig.
 */
export function isValidPlacement(
  chainValues: readonly number[],
  value: number,
  gapIndex: number,
  order: SortOrder,
): boolean {
  if (!Number.isInteger(gapIndex) || gapIndex < 0 || gapIndex > chainValues.length) return false;
  const above = chainValues[gapIndex - 1];
  const below = chainValues[gapIndex];
  const fitsAbove = above === undefined || (order === 'desc' ? above >= value : above <= value);
  const fitsBelow = below === undefined || (order === 'desc' ? value >= below : value <= below);
  return fitsAbove && fitsBelow;
}

/** Erste gültige Lücke für `value`, für die Auflösung nicht gelegter Karten. */
export function findCorrectGap(chainValues: readonly number[], value: number, order: SortOrder): number {
  for (let gap = 0; gap <= chainValues.length; gap++) {
    if (isValidPlacement(chainValues, value, gap, order)) return gap;
  }
  return chainValues.length;
}

/** Stabile Sortierung in Spielreihenfolge: oben steht bei `desc` der größte, bei `asc` der kleinste Wert. */
export function sortCards<T extends { value: number; name: string }>(cards: readonly T[], order: SortOrder): T[] {
  const sign = order === 'desc' ? -1 : 1;
  return [...cards].sort((a, b) => {
    if (a.value !== b.value) return sign * (a.value - b.value);
    return a.name.localeCompare(b.name, 'de');
  });
}

/** Fisher-Yates mit injizierbarem Zufall. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
