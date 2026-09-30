/**
 * Namensabgleich für Top X. Keine Tippfehler-Toleranz: nach Normalisierung muss der Tipp
 * einem Namen, einem Alias oder einem unter allen Karten eindeutigen letzten Namensbestandteil entsprechen.
 */
export interface MatchableCard {
  rank: number;
  name: string;
  aliases?: readonly string[];
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Kleinschreibung, Umlaute ausgeschrieben, Akzente entfernt, alles außer a-z0-9 wird zu Leerzeichen. */
export function normalizeGuess(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const SURNAME_MIN_LENGTH = 3;

function lastToken(normalized: string): string {
  const parts = normalized.split(' ');
  return parts[parts.length - 1] ?? '';
}

/** Rang der getroffenen Karte oder null. Prüft alle Karten, auch schon aufgedeckte. */
export function matchGuess(text: string, cards: readonly MatchableCard[]): number | null {
  const guess = normalizeGuess(text);
  if (!guess) return null;

  for (const card of cards) {
    if (normalizeGuess(card.name) === guess) return card.rank;
    for (const alias of card.aliases ?? []) {
      if (normalizeGuess(alias) === guess) return card.rank;
    }
  }

  const bySurname = cards.filter((card) => {
    const token = lastToken(normalizeGuess(card.name));
    return token.length >= SURNAME_MIN_LENGTH && token === guess;
  });
  const surnameIsUnique =
    bySurname.length === 1 &&
    cards.filter((card) => lastToken(normalizeGuess(card.name)) === guess).length === 1;
  return surnameIsUnique ? bySurname[0]!.rank : null;
}
