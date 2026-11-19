/**
 * Hochstapler: gemeinsame Regeln für das Turmbau-Rennen. Rein und deterministisch.
 * Einheiten: ein Steinquadrat ist 1 breit, die Oberkante des Sockels liegt bei y = 0, y wächst nach oben.
 * Die Physik läuft auf jedem Handy, hier stehen nur Formen, Steinstrom, Spezials, Rangliste und das Frame-Format.
 */

import { seededRandom } from './splash.ts';

// ---------------------------------------------------------------- Optionen

export type TowerGoal = 'low' | 'mid' | 'high';
export const TOWER_GOALS: readonly TowerGoal[] = ['low', 'mid', 'high'];

/** Vom Host vor der Runde gewählt; der Raum merkt sich die letzte Wahl. */
export interface TowerOptions {
  goal: TowerGoal;
}

export const TOWER_DEFAULTS: TowerOptions = { goal: 'mid' };

export function isTowerOptions(x: unknown): x is TowerOptions {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  return TOWER_GOALS.includes((x as Record<string, unknown>).goal as TowerGoal);
}

/** Höhe der Ziellinie über dem Sockel je Stufe. */
export const TOWER_GOAL_HEIGHT: Record<TowerGoal, number> = { low: 10, mid: 16, high: 24 };
export const TOWER_GOAL_LABELS: Record<TowerGoal, string> = { low: 'Niedrig', mid: 'Mittel', high: 'Hoch' };

/** Abstand der Höhenmarken; wer eine Marke zum ersten Mal überbaut, bekommt ein Spezial. */
export const TOWER_MARK_STEP = 3;

/** Höhenmarken unterhalb der Ziellinie. */
export function towerMarks(goalHeight: number): number[] {
  const marks: number[] = [];
  for (let m = TOWER_MARK_STEP; m < goalHeight - 0.5; m += TOWER_MARK_STEP) marks.push(m);
  return marks;
}

/** So lange muss der Turm ruhig über der Ziellinie stehen. */
export const TOWER_HOLD_MS = 3000;
/** Halbe Breite des Sockels. */
export const TOWER_BASE_HALF = 2.5;
/** So weit nach links und rechts lässt sich ein Stein schieben (Mitte). */
export const TOWER_FIELD_HALF = 5.5;
/** Höchste plausible Turmhöhe, darüber gilt eine Meldung als Unsinn. */
export const TOWER_MAX_HEIGHT = 60;

// ------------------------------------------------------------------ Formen

/** Zellen je Form (ganzzahlig, linke untere Ecke). 0–6 sind die Grundformen aus vier Quadraten. */
const RAW_FORMS: readonly (readonly (readonly [number, number])[])[] = [
  // I
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  // O
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  // T
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  // S
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  // Z
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  // L
  [[0, 0], [1, 0], [2, 0], [2, 1]],
  // J
  [[0, 0], [1, 0], [2, 0], [0, 1]],
  // Brocken: sperrige Treppe aus fünf Quadraten
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]],
];

export const TOWER_BASIC_FORMS = 7;
/** Form des Brocken-Spezials. */
export const TOWER_BOULDER = 7;
/** Kein Stein, sondern der Stützbalken (nur im Frame). */
export const TOWER_BEAM = 8;
export const TOWER_FORM_COUNT = 9;
export const TOWER_FORM_NAMES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J', 'Brocken', 'Balken'] as const;
/** Maße des Stützbalkens (halbe Breite und halbe Höhe). */
export const TOWER_BEAM_HALF = { w: 3.2, h: 0.2 } as const;

export interface CellPoint {
  x: number;
  y: number;
}

/** Zellmitten einer Form, um die Mitte des umgebenden Rechtecks zentriert. */
export function formCells(form: number): CellPoint[] {
  const raw = RAW_FORMS[form];
  if (!raw) return [];
  const w = Math.max(...raw.map((c) => c[0])) + 1;
  const h = Math.max(...raw.map((c) => c[1])) + 1;
  return raw.map(([x, y]) => ({ x: x + 0.5 - w / 2, y: y + 0.5 - h / 2 }));
}

/** Umriss einer Form als Kantenliste (x1, y1, x2, y2, nx, ny) mit Normalen nach außen, Mitte wie `formCells`. */
export function formOutline(form: number): [number, number, number, number, number, number][] {
  const cells = formCells(form);
  const key = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const edges: [number, number, number, number, number, number][] = [];
  for (const c of cells) {
    const l = c.x - 0.5;
    const r = c.x + 0.5;
    const b = c.y - 0.5;
    const t = c.y + 0.5;
    if (!set.has(key(c.x, c.y + 1))) edges.push([l, t, r, t, 0, 1]);
    if (!set.has(key(c.x, c.y - 1))) edges.push([r, b, l, b, 0, -1]);
    if (!set.has(key(c.x - 1, c.y))) edges.push([l, b, l, t, -1, 0]);
    if (!set.has(key(c.x + 1, c.y))) edges.push([r, t, r, b, 1, 0]);
  }
  return edges;
}

// --------------------------------------------------------------- Steinstrom

/** Ungefähr jeder zwölfte Stein ist ein Spezialstein. */
export const TOWER_SPECIAL_STONE_CHANCE = 1 / 12;

function mix(a: number, b: number): number {
  let h = (a ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = (h + Math.imul(b + 1, 0x27d4eb2d)) >>> 0;
  return Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
}

/**
 * Stein Nummer `index` (ab 0) im Strom eines Spielers. In jedem Siebenerblock kommt jede Grundform genau einmal,
 * so gibt es keine langen Durststrecken. Der erste Stein ist nie ein Spezialstein.
 */
export function towerPiece(seed: number, index: number): { form: number; special: boolean } {
  const block = Math.floor(index / TOWER_BASIC_FORMS);
  const rnd = seededRandom(mix(seed, block));
  const bag = Array.from({ length: TOWER_BASIC_FORMS }, (_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const special = index > 0 && seededRandom(mix(seed ^ 0x5bd1e995, index))() < TOWER_SPECIAL_STONE_CHANCE;
  return { form: bag[index % TOWER_BASIC_FORMS]!, special };
}

// ----------------------------------------------------------------- Spezials

export type TowerSpecial = 'glue' | 'shrink' | 'beam' | 'boulder' | 'ice' | 'gust' | 'fog' | 'turbo';
export const TOWER_SPECIAL_IDS: readonly TowerSpecial[] = ['glue', 'shrink', 'beam', 'boulder', 'ice', 'gust', 'fog', 'turbo'];
/** Helfer wirken auf den eigenen Turm, Störer sowie Sicht und Tempo auf ein Ziel. */
export type TowerSpecialGroup = 'helper' | 'attack' | 'sight';

export interface TowerSpecialInfo {
  name: string;
  group: TowerSpecialGroup;
  /** Wirkdauer; 0 heißt einmalig. */
  durationMs: number;
  hint: string;
  /** Wie viel es dem Nutzer bringt, 1 bis 3. Grundlage der Aufholhilfe. */
  value: number;
}

export const TOWER_SPECIALS: Record<TowerSpecial, TowerSpecialInfo> = {
  glue: { name: 'Kleber', group: 'helper', durationMs: 0, value: 3, hint: 'Dein nächster Stein haftet beim Aufsetzen fest.' },
  shrink: { name: 'Schrumpfen', group: 'helper', durationMs: 0, value: 2, hint: 'Dein aktueller Stein schrumpft auf 70 %.' },
  beam: { name: 'Stützbalken', group: 'helper', durationMs: 20_000, value: 3, hint: 'Ein fester Balken knapp unter deiner Turmspitze, 20 Sekunden lang.' },
  boulder: { name: 'Brocken', group: 'attack', durationMs: 0, value: 2, hint: 'Der nächste Stein deines Ziels ist eine sperrige Fünferform.' },
  ice: { name: 'Glatteis', group: 'attack', durationMs: 10_000, value: 2, hint: 'Die Steine deines Ziels werden 10 Sekunden lang spiegelglatt.' },
  gust: { name: 'Windstoß', group: 'attack', durationMs: 0, value: 2, hint: 'Ein kräftiger Stoß von der Seite gegen den Turm deines Ziels.' },
  fog: { name: 'Nebel', group: 'sight', durationMs: 8_000, value: 1, hint: 'Dein Ziel sieht 8 Sekunden keine Vorschau, die obere Turmhälfte verschwimmt.' },
  turbo: { name: 'Turbo', group: 'sight', durationMs: 10_000, value: 1, hint: 'Die Steine deines Ziels fallen 10 Sekunden doppelt so schnell.' },
};

export const TOWER_GROUP_LABELS: Record<TowerSpecialGroup, string> = { helper: 'Helfer', attack: 'Störer', sight: 'Sicht und Tempo' };

/** So lange bleiben einmalige Effekte (Windstoß, Brocken …) als Hinweis sichtbar. */
export const TOWER_EFFECT_SHOW_MS = 3000;

export function isTowerSpecial(x: unknown): x is TowerSpecial {
  return typeof x === 'string' && (TOWER_SPECIAL_IDS as readonly string[]).includes(x);
}

/** Muss der Spieler ein Ziel wählen? */
export function specialTargetsOthers(s: TowerSpecial): boolean {
  return TOWER_SPECIALS[s].group !== 'helper';
}

/**
 * Gewichte für die Vergabe nach Rang (1 = vorne) bei `n` Spielern. Aufholhilfe: Wer zurückliegt, bekommt deutlich
 * öfter starke Helfer für den eigenen Turm, wer vorne liegt, eher milde Sicht- und Tempo-Effekte und Störer.
 */
export function specialWeights(rank: number, n: number): Record<TowerSpecial, number> {
  const t = n <= 1 ? 0.5 : Math.min(1, Math.max(0, (rank - 1) / (n - 1)));
  return {
    glue: 0.5 + 3.5 * t,
    beam: 0.5 + 3 * t,
    shrink: 1 + 1.5 * t,
    boulder: 1,
    ice: 1,
    gust: 1 + 0.5 * t,
    fog: 2 - 1.5 * t,
    turbo: 2 - 1.5 * t,
  };
}

/** Zieht ein Spezial passend zum Rang. */
export function specialFor(rank: number, n: number, random: () => number): TowerSpecial {
  const weights = specialWeights(rank, n);
  const total = TOWER_SPECIAL_IDS.reduce((s, id) => s + weights[id], 0);
  let r = random() * total;
  for (const id of TOWER_SPECIAL_IDS) {
    r -= weights[id];
    if (r < 0) return id;
  }
  return TOWER_SPECIAL_IDS[TOWER_SPECIAL_IDS.length - 1]!;
}

// ---------------------------------------------------------------- Rangliste

export interface TowerRankEntry {
  playerId: string;
  height: number;
  finishedAt: number | null;
}

export interface TowerRanked extends TowerRankEntry {
  rank: number;
}

/** Höhen werden auf eine Nachkommastelle verglichen. */
const roundHeight = (h: number) => Math.round(h * 10) / 10;

/**
 * Sieger (über der Linie gehalten) nach Zeit vorne, danach alle übrigen nach Turmhöhe.
 * Gleich hohe Türme teilen sich den Platz, bei Gleichstand bleibt die Eingangsreihenfolge.
 */
export function towerRanking(entries: readonly TowerRankEntry[]): TowerRanked[] {
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const fa = a.e.finishedAt;
      const fb = b.e.finishedAt;
      if (fa !== null || fb !== null) {
        if (fa === null) return 1;
        if (fb === null) return -1;
        return fa - fb || a.i - b.i;
      }
      return roundHeight(b.e.height) - roundHeight(a.e.height) || a.i - b.i;
    })
    .map((x) => x.e);
  let rank = 0;
  return sorted.map((e, i) => {
    const prev = sorted[i - 1];
    const same = prev && prev.finishedAt === null && e.finishedAt === null && roundHeight(prev.height) === roundHeight(e.height);
    if (!same) rank = i + 1;
    return { ...e, height: roundHeight(e.height), rank };
  });
}

/** Punktevorschlag: Spielerzahl − Platz + 1. */
export function towerPoints(ranking: readonly TowerRanked[]): Record<string, number> {
  const n = ranking.length;
  return Object.fromEntries(ranking.map((r) => [r.playerId, n - r.rank + 1]));
}

// -------------------------------------------------------------------- Frame

/** Zahlen je Stein im Frame: id, Form, x, y, Winkel, Flags. */
export const TOWER_STONE_FIELDS = 6;
export const TOWER_FRAME_MAX_STONES = 160;
/** Etwa acht Frames pro Sekunde. */
export const TOWER_FRAME_INTERVAL_MS = 125;

/** Stein-Flags */
export const STONE_FALLING = 1;
export const STONE_GLUED = 2;
export const STONE_SPECIAL = 4;
export const STONE_SHRUNK = 8;
export const STONE_ICY = 16;
const STONE_FLAGS_MAX = 31;

/** Effekt-Flags des ganzen Turms */
export const FX_ICE = 1;
export const FX_FOG = 2;
export const FX_TURBO = 4;
export const FX_BEAM = 8;
export const FX_GLUE = 16;
export const FX_BOULDER = 32;
const FX_MAX = 63;

export interface TowerStone {
  id: number;
  form: number;
  x: number;
  y: number;
  /** Winkel im Bogenmaß, gegen den Uhrzeigersinn. */
  a: number;
  flags: number;
}

/** Schnappschuss eines Turms, schlank für die Leitung: Steine als flaches Zahlen-Array. */
export interface TowerFrame {
  /** Serverzeit laut Gerät. */
  t: number;
  /** Turmhöhe über dem Sockel. */
  h: number;
  fx: number;
  /** Fortschritt der Ruheprüfung über der Linie, 0 bis 1. */
  hold: number;
  /** Nächste Form, -1 wenn verborgen (Nebel). */
  next: number;
  s: number[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function packFrame(input: { t: number; h: number; fx: number; hold: number; next: number; stones: readonly TowerStone[] }): TowerFrame {
  const s: number[] = [];
  for (const st of input.stones.slice(0, TOWER_FRAME_MAX_STONES)) s.push(st.id, st.form, r2(st.x), r2(st.y), r3(st.a), st.flags);
  return { t: Math.round(input.t), h: r2(Math.max(0, input.h)), fx: input.fx, hold: r2(Math.min(1, Math.max(0, input.hold))), next: input.next, s };
}

export function unpackStones(s: readonly number[]): TowerStone[] {
  const out: TowerStone[] = [];
  for (let i = 0; i + TOWER_STONE_FIELDS <= s.length; i += TOWER_STONE_FIELDS) {
    out.push({ id: s[i]!, form: s[i + 1]!, x: s[i + 2]!, y: s[i + 3]!, a: s[i + 4]!, flags: s[i + 5]! });
  }
  return out;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isIntIn = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= lo && x <= hi;

/** Strukturelle Prüfung eines Frames samt Grenzen. */
export function isTowerFrame(x: unknown): x is TowerFrame {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const f = x as Record<string, unknown>;
  if (!isNum(f.t) || !isNum(f.h) || f.h < 0 || f.h > TOWER_MAX_HEIGHT * 2) return false;
  if (!isIntIn(f.fx, 0, FX_MAX) || !isNum(f.hold) || f.hold < 0 || f.hold > 1 || !isIntIn(f.next, -1, TOWER_FORM_COUNT - 1)) return false;
  const s = f.s;
  if (!Array.isArray(s) || s.length % TOWER_STONE_FIELDS !== 0 || s.length > TOWER_FRAME_MAX_STONES * TOWER_STONE_FIELDS) return false;
  for (let i = 0; i < s.length; i += TOWER_STONE_FIELDS) {
    if (!isIntIn(s[i], 0, 1e6) || !isIntIn(s[i + 1], 0, TOWER_FORM_COUNT - 1)) return false;
    const px = s[i + 2];
    const py = s[i + 3];
    const a = s[i + 4];
    if (!isNum(px) || Math.abs(px) > 50 || !isNum(py) || py < -50 || py > TOWER_MAX_HEIGHT * 2 || !isNum(a) || Math.abs(a) > 1000) return false;
    if (!isIntIn(s[i + 5], 0, STONE_FLAGS_MAX)) return false;
  }
  return Object.keys(f).every((k) => k === 't' || k === 'h' || k === 'fx' || k === 'hold' || k === 'next' || k === 's');
}
