/**
 * Dungeon: Regeln für Grenzen je Raum, das Prüfen der Antworten aller Formate und die Rangliste.
 * Rein, damit Server und Tests dasselbe rechnen.
 */

import { haversineKm, type LatLng } from './geo.ts';
import { yearDistance } from './timeline.ts';
import { matchGuess } from './topx.ts';

/** Woher die Türen kommen: Fragenlisten (a/b/c/d oder frei), Orte, Ereignisse, Ranglisten. */
export type DungeonFormat = 'questions' | 'map' | 'timeline' | 'topx';
export const DUNGEON_FORMATS: readonly DungeonFormat[] = ['questions', 'map', 'timeline', 'topx'];
/** Was auf der Tür steht: Fragen-Türen zeigen, ob es a/b/c/d oder eine freie Antwort ist. */
export type DungeonDoorKind = 'choice' | 'free' | 'map' | 'timeline' | 'topx';

/** Aus welchen Spielen die Listen je Format stammen. */
export const DUNGEON_SOURCES: Record<DungeonFormat, readonly string[]> = {
  questions: ['splash'],
  map: ['map'],
  timeline: ['timeline'],
  topx: ['topx', 'risk'],
};

/** Listen je Format aus einer Übersicht (`games` je Liste), für Picker und Aufbau. */
export function dungeonListsByFormat<T extends { games: readonly string[] }>(lists: readonly T[], formats: readonly DungeonFormat[]): Record<DungeonFormat, T[]> {
  const out = { questions: [], map: [], timeline: [], topx: [] } as Record<DungeonFormat, T[]>;
  for (const f of formats) out[f] = lists.filter((l) => l.games.some((g) => DUNGEON_SOURCES[f].includes(g)));
  return out;
}

export const DUNGEON_ROOMS_MIN = 3;
export const DUNGEON_ROOMS_MAX = 7;
export const DUNGEON_DOORS_MIN = 3;
export const DUNGEON_DOORS_MAX = 5;

export interface DungeonOptions {
  rooms: number;
  doors: number;
  formats: DungeonFormat[];
}

/** So lange steht das Ergebnis einer Fragerunde, dann geht es von selbst zur nächsten Türwahl (der Host kann früher). */
export const DUNGEON_RESULT_MS = 9000;
/** Beim wievielten Fehlversuch man einen Schlüssel findet (einmal je Dungeon, Aufholhilfe). */
export const DUNGEON_KEY_AT_WRONG = 2;

export const DUNGEON_DEFAULTS: DungeonOptions = { rooms: 5, doors: 4, formats: [...DUNGEON_FORMATS] };

export function isDungeonOptions(x: unknown): x is DungeonOptions {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    Number.isInteger(o.rooms) &&
    (o.rooms as number) >= DUNGEON_ROOMS_MIN &&
    (o.rooms as number) <= DUNGEON_ROOMS_MAX &&
    Number.isInteger(o.doors) &&
    (o.doors as number) >= DUNGEON_DOORS_MIN &&
    (o.doors as number) <= DUNGEON_DOORS_MAX &&
    Array.isArray(o.formats) &&
    o.formats.length > 0 &&
    o.formats.length <= DUNGEON_FORMATS.length &&
    o.formats.every((f) => DUNGEON_FORMATS.includes(f as DungeonFormat)) &&
    new Set(o.formats).size === o.formats.length
  );
}

// ---------------------------------------------------------------- Grenzen

/** Grenze im ersten und im letzten Raum, dazwischen linear: tiefer wird strenger. */
const TOLERANCE: Record<'map' | 'timeline' | 'topx', { first: number; last: number; step: number }> = {
  map: { first: 500, last: 150, step: 50 },
  timeline: { first: 10, last: 2, step: 1 },
  topx: { first: 20, last: 5, step: 1 },
};

/** Kilometer (Karte), Jahre (Zeitstrahl) oder Plätze (Top X) im Raum `roomIndex` (ab 0) von `rooms`. */
export function toleranceFor(format: 'map' | 'timeline' | 'topx', roomIndex: number, rooms: number): number {
  const t = rooms <= 1 ? 0 : Math.min(1, Math.max(0, roomIndex / (rooms - 1)));
  const { first, last, step } = TOLERANCE[format];
  return Math.round((first + (last - first) * t) / step) * step;
}

// ------------------------------------------------------------------ Prüfen

export function judgeChoice(choice: number, correctChoice: number): boolean {
  return choice === correctChoice;
}

/** Freie Antwort: Name, Alias oder eindeutiger Nachname, Tippfehler wie bei Top X. */
export function judgeFree(text: string, answer: string, aliases: readonly string[] = []): boolean {
  return matchGuess(text, [{ rank: 1, name: answer, aliases }]) !== null;
}

/** Karte: Pin höchstens `km` vom Ort entfernt. Liefert auch die Entfernung für die Auswertung. */
export function judgeMap(pin: LatLng, target: LatLng, km: number): { correct: boolean; distanceKm: number } {
  const distanceKm = haversineKm(pin, target);
  return { correct: distanceKm <= km, distanceKm };
}

/** Zeitstrahl: höchstens `years` neben dem Jahr bzw. der Spanne. */
export function judgeYear(year: number, from: number, to: number, years: number): { correct: boolean; off: number } {
  const off = yearDistance(year, from, to);
  return { correct: off <= years, off };
}

/** Top X: ein Treffer unter den ersten `n` Einträgen. Liefert den Platz oder null. */
export function judgeTopX(text: string, items: readonly { name: string; aliases?: readonly string[] }[], n: number): number | null {
  return matchGuess(
    text,
    items.slice(0, n).map((item, i) => ({ rank: i + 1, name: item.name, ...(item.aliases ? { aliases: item.aliases } : {}) })),
  );
}

// -------------------------------------------------------------- Rangliste

export type DungeonStatus = 'in' | 'out' | 'eliminated';

export interface DungeonStanding {
  playerId: string;
  status: DungeonStatus;
  /** Erreichter Raum ab 0; wer draußen ist, steht auf `rooms`. */
  room: number;
  /** Fragerunde, in der er herauskam. */
  exitRound: number | null;
  wrong: number;
}

export interface DungeonRankEntry extends DungeonStanding {
  place: number;
  points: number;
}

/**
 * Erst die Rausgekommenen nach Fragerunde, dann alle übrigen nach erreichtem Raum, Ausgeschiedene hinter
 * Gleichweiten, danach weniger Fehlversuche. Wer in allem gleich ist, teilt sich den Platz.
 * Punktevorschlag: Spielerzahl minus Platz plus eins.
 */
export function dungeonRanking(standings: readonly DungeonStanding[]): DungeonRankEntry[] {
  const key = (s: DungeonStanding): number[] =>
    s.status === 'out' ? [0, s.exitRound ?? 0, s.wrong] : [1, -s.room, s.status === 'eliminated' ? 1 : 0, s.wrong];
  const cmp = (a: DungeonStanding, b: DungeonStanding): number => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (ka[i] ?? 0) - (kb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  };
  const sorted = [...standings].sort(cmp);
  const n = sorted.length;
  const out: DungeonRankEntry[] = [];
  sorted.forEach((s, i) => {
    const prev = out[i - 1];
    const place = prev && cmp(sorted[i - 1]!, s) === 0 ? prev.place : i + 1;
    out.push({ ...s, place, points: n - place + 1 });
  });
  return out;
}
