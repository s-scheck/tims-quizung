import { normalizeGuess } from './topx.ts';

/**
 * Vergleichsschlüssel für Songtitel und Interpreten: ohne Klammerzusätze, „- Remastered …“, „feat. …“,
 * mit „&“, „and“ und „und“ gleichwertig, ohne führendes „The“ und ohne Leerzeichen.
 */
export function songKey(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s[-–]\s.*\b(remaster(ed)?|version|edit|mix|live|mono|stereo)\b.*$/i, ' ')
    .replace(/\s(feat\.?|ft\.?|featuring|with)\s.*$/i, ' ')
    .replace(/&|\+/g, ' and ')
    .replace(/\bund\b/g, ' and ');
  return normalizeGuess(s)
    .replace(/^the\s+/, '')
    .replace(/\s+/g, '');
}

/** Levenshtein-Abstand, abgebrochen sobald er `max` übersteigt. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

/** Erlaubte Tippfehler je nach Länge: kurze Wörter exakt, ab 5 Zeichen einer, ab 10 zwei. */
function tolerance(key: string): number {
  return key.length >= 10 ? 2 : key.length >= 5 ? 1 : 0;
}

function matchesAny(guess: string, candidates: readonly string[]): boolean {
  const g = songKey(guess);
  if (!g) return false;
  return candidates.some((c) => {
    const k = songKey(c);
    return k.length > 0 && distance(g, k, tolerance(k)) <= tolerance(k);
  });
}

/** Titel samt Aliassen; ein Klammerzusatz („Blue (Da Ba Dee)“) zählt auch für sich. */
export function matchSongTitle(guess: string, title: string, aliases: readonly string[] = []): boolean {
  const inner = [...title.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!);
  return matchesAny(guess, [title, ...aliases, ...inner]);
}

/** Interpret samt Aliassen; bei „A feat. B“ oder „A, B“ zählt auch jeder Name einzeln. */
export function matchSongArtist(guess: string, artist: string, aliases: readonly string[] = []): boolean {
  const parts = artist.split(/\s(?:feat\.?|ft\.?|featuring|with|x)\s|,\s*/i).map((p) => p.trim()).filter(Boolean);
  return matchesAny(guess, [artist, ...aliases, ...parts]);
}
