import { editDistance } from './songs.ts';
import { normalizeGuess, SURNAME_MIN_LENGTH } from './topx.ts';

const key = (text: string) => normalizeGuess(text).replace(/\s+/g, '');

/** Erlaubte Tippfehler je nach Länge: kurze Namen exakt, ab 5 Zeichen einer, ab 10 zwei. */
function tolerance(k: string): number {
  return k.length >= 10 ? 2 : k.length >= 5 ? 1 : 0;
}

/**
 * Automatische Prüfung bei Wer ist das?: Name, Alias oder Nachname, kleine Tippfehler verziehen.
 * Der Nachname zählt erst ab drei Buchstaben und nur exakt, damit „Mann“ nicht für „Manuel Neuer“ durchgeht.
 */
export function matchPersonName(guess: string, name: string, aliases: readonly string[] = []): boolean {
  const g = key(guess);
  if (!g) return false;
  for (const candidate of [name, ...aliases]) {
    const k = key(candidate);
    if (k && editDistance(g, k, tolerance(k)) <= tolerance(k)) return true;
  }
  const tokens = normalizeGuess(name).split(' ');
  const last = tokens[tokens.length - 1] ?? '';
  return tokens.length > 1 && last.length >= SURNAME_MIN_LENGTH && last === g;
}

/** Kachelreihenfolge im automatischen Modus, auf allen Geräten gleich (Fisher-Yates mit mulberry32). */
export function autoTileOrder(total: number, seed: number): number[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: total }, (_, i) => i);
  for (let i = total - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** Offene Kacheln bei Stärke `level` (100 = alles zu, 0 = alles offen). */
export function autoRevealedTiles(total: number, seed: number, level: number): number[] {
  const open = Math.round((total * (100 - level)) / 100);
  return autoTileOrder(total, seed).slice(0, open).sort((a, b) => a - b);
}
