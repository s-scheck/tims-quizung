/**
 * Hochstapler: gemeinsame Regeln für das Turmbau-Rennen. Rein und deterministisch.
 * Einheiten: ein Steinquadrat ist 1 breit, die Oberkante des Sockels liegt bei y = 0, y wächst nach oben.
 * Die Physik läuft auf jedem Handy, hier stehen nur Formen, Steinstrom, Spezials, Rangliste und das Frame-Format.
 */

import { shuffle } from './sort.ts';
import { seededRandom } from './splash.ts';

// ---------------------------------------------------------------- Optionen

export type TowerGoal = 'low' | 'mid' | 'high' | 'xhigh' | 'sky';
export const TOWER_GOALS: readonly TowerGoal[] = ['low', 'mid', 'high', 'xhigh', 'sky'];

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
export const TOWER_GOAL_HEIGHT: Record<TowerGoal, number> = { low: 10, mid: 16, high: 24, xhigh: 32, sky: 40 };
export const TOWER_GOAL_LABELS: Record<TowerGoal, string> = { low: 'Niedrig', mid: 'Mittel', high: 'Hoch', xhigh: 'Sehr hoch', sky: 'Wolkenkratzer' };

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
/** Rundstein (dunkle Magie): physikalisch ein Kreis mit Radius `TOWER_ROUND_RADIUS`, keine Zellen. */
export const TOWER_ROUND = 9;
export const TOWER_ROUND_RADIUS = 0.9;
export const TOWER_FORM_COUNT = 10;
export const TOWER_FORM_NAMES = ['I', 'O', 'T', 'S', 'Z', 'L', 'J', 'Brocken', 'Balken', 'Rund'] as const;
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


function mix(a: number, b: number): number {
  let h = (a ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = (h + Math.imul(b + 1, 0x27d4eb2d)) >>> 0;
  return Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
}

/**
 * Stein Nummer `index` (ab 0) im Strom eines Spielers. In jedem Siebenerblock kommt jede Grundform genau einmal,
 * so gibt es keine langen Durststrecken. Spezialsteine gibt es nicht mehr (zufällige Magie kommt über den
 * Glücks-Slot vom Server); `special` bleibt nur der Form halber und ist immer false.
 */
export function towerPiece(seed: number, index: number): { form: number; special: boolean } {
  const block = Math.floor(index / TOWER_BASIC_FORMS);
  const rnd = seededRandom(mix(seed, block));
  const bag = Array.from({ length: TOWER_BASIC_FORMS }, (_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  return { form: bag[index % TOWER_BASIC_FORMS]!, special: false };
}

/** Zweite Form für die Steinwahl bei Stein Nummer `index`: deterministisch und nie gleich der eigentlichen Form. */
export function towerAltForm(seed: number, index: number): number {
  const main = towerPiece(seed, index).form;
  const k = 1 + Math.floor(seededRandom(mix(seed ^ 0x3c6ef372, index))() * (TOWER_BASIC_FORMS - 1));
  return (main + k) % TOWER_BASIC_FORMS;
}

/** So weit (in Einheiten) erscheint ein neuer Stein höchstens neben der Mitte. */
export const TOWER_SPAWN_SPREAD = 3.5;

/**
 * Startlage von Stein Nummer `index`: seitlicher Versatz auf halben Einheiten und Vierteldrehungen im
 * Uhrzeigersinn. Deterministisch aus dem Seed, damit alle dieselben Bedingungen haben. Wer nichts tut, lässt die
 * Steine schief und neben den Sockel fallen; Steuern lohnt sich also immer. Der erste Stein kommt gerade und mittig.
 */
export function towerSpawn(seed: number, index: number): { x: number; turns: number } {
  if (index === 0) return { x: 0, turns: 0 };
  const rnd = seededRandom(mix(seed ^ 0x2c1b3c6d, index));
  const steps = TOWER_SPAWN_SPREAD * 2;
  const x = (Math.floor(rnd() * (steps * 2 + 1)) - steps) / 2;
  const turns = Math.floor(rnd() * 4);
  return { x, turns };
}

/** Der Turm zählt über der Linie nur, wenn von den zuletzt gelandeten Steinen mindestens einer selbst gesteuert war. */
export const TOWER_STEERED_WINDOW = 3;

// ----------------------------------------------------------------- Spezials

/**
 * Magie. Helle Zauber wirken auf den eigenen Turm, dunkle auf einen gewählten Gegner.
 * - Höhenmarken: Der Server bietet ein Paar an (hell oder dunkel, `tower_choose`). Der gewählte Zauber kommt in den
 *   Vorrat (`stock`, höchstens `TOWER_STOCK_MAX`, eingesetzt wird der Reihe nach, der älteste zuerst; ist der Vorrat
 *   voll, verdrängt ein neuer den ältesten).
 * - Glücks-Slot: Alle 10–20 s schenkt der Server einen zufälligen Zauber (`luck`, nicht stapelbar, ein neuer ersetzt
 *   den alten). Aufholhilfe: Wer hinten liegt, bekommt öfter Starkes für sich, wer vorne liegt, öfter dunkle Magie.
 * Pro Partie ist nur eine Auswahl aller Zauber im Spiel (`pool`). Zauber mit `charges` wirken auf die nächsten
 * N Steine, Zauber mit `durationMs` eine Zeit lang, alle anderen sofort und einmalig.
 */
export type TowerSpecial =
  | 'glue'
  | 'grow'
  | 'heavy'
  | 'pick'
  | 'beam'
  | 'petrify'
  | 'vanish'
  | 'mini'
  | 'ice'
  | 'gust'
  | 'fog'
  | 'turbo'
  | 'round';
export const TOWER_SPECIAL_IDS: readonly TowerSpecial[] = ['glue', 'grow', 'heavy', 'pick', 'beam', 'petrify', 'vanish', 'mini', 'ice', 'gust', 'fog', 'turbo', 'round'];
export type TowerSpecialGroup = 'light' | 'dark';
export type TowerSide = TowerSpecialGroup;

export interface TowerSpecialInfo {
  name: string;
  group: TowerSpecialGroup;
  /** Wirkdauer; 0 heißt einmalig bzw. über `charges`. */
  durationMs: number;
  /** Wirkt auf so viele der nächsten Steine (0 = nicht steinweise). */
  charges: number;
  hint: string;
  /** Ganz kurz für Chips und Knöpfe. */
  short: string;
  /** Wie viel es dem Nutzer bringt, 1 bis 3. Grundlage der Aufholhilfe. */
  value: number;
}

/** Werte (Dauer, Stärke, Texte) darf der Spielgefühl-Feinschliff anpassen; Ids und Gruppen sind fest. */
export const TOWER_SPECIALS: Record<TowerSpecial, TowerSpecialInfo> = {
  glue: { name: 'Ranken', group: 'light', durationMs: 0, charges: 5, value: 3, short: 'Steine verketten sich', hint: 'Deine nächsten 5 Steine ranken sich beim Aufsetzen an alle Nachbarn und verketten den Turm.' },
  grow: { name: 'Vergrößern', group: 'light', durationMs: 0, charges: 3, value: 2, short: 'große Steine', hint: 'Deine nächsten 3 Steine sind anderthalbmal so groß, ideal für eine breite Basis.' },
  heavy: { name: 'Schwerer Stein', group: 'light', durationMs: 0, charges: 1, value: 2, short: 'liegt bombenfest', hint: 'Dein nächster Stein ist bleischwer und griffig, er rutscht und kippt kaum.' },
  pick: { name: 'Steinwahl', group: 'light', durationMs: 0, charges: 3, value: 2, short: 'Form aussuchen', hint: 'Bei deinen nächsten 3 Steinen wählst du aus zwei Formen.' },
  beam: { name: 'Stützbalken', group: 'light', durationMs: 0, charges: 0, value: 3, short: 'fester Balken', hint: 'Ein fester Balken knapp unter deiner Turmspitze, dauerhaft.' },
  petrify: { name: 'Versteinern', group: 'light', durationMs: 0, charges: 0, value: 3, short: 'Turm wird Fels', hint: 'Dein Turm bis knapp unter die Spitze wird zu festem Fels.' },
  vanish: { name: 'Wegzaubern', group: 'light', durationMs: 0, charges: 0, value: 2, short: 'letzter Stein weg', hint: 'Dein zuletzt gesetzter Stein verschwindet.' },
  mini: { name: 'Mini-Steine', group: 'dark', durationMs: 0, charges: 3, value: 2, short: 'Gegner: winzige Steine', hint: 'Die nächsten 3 Steine deines Ziels sind winzig und schwer zu stapeln.' },
  ice: { name: 'Glatteis', group: 'dark', durationMs: 10_000, charges: 0, value: 2, short: 'Gegner: glatte Steine', hint: 'Die Steine deines Ziels werden 10 Sekunden lang spiegelglatt.' },
  gust: { name: 'Windstoß', group: 'dark', durationMs: 0, charges: 0, value: 2, short: 'Gegner: Windstoß', hint: 'Ein kräftiger Stoß von der Seite gegen den Turm deines Ziels.' },
  fog: { name: 'Nebel', group: 'dark', durationMs: 8_000, charges: 0, value: 1, short: 'Gegner: Nebel', hint: 'Eine Wolke verdeckt deinem Ziel 8 Sekunden lang Turm und Vorschau.' },
  turbo: { name: 'Turbo', group: 'dark', durationMs: 10_000, charges: 0, value: 1, short: 'Gegner: fällt schneller', hint: 'Die Steine deines Ziels fallen 10 Sekunden doppelt so schnell.' },
  round: { name: 'Rundstein', group: 'dark', durationMs: 0, charges: 0, value: 2, short: 'Gegner: rollender Stein', hint: 'Der nächste Stein deines Ziels ist rund und rollt.' },
};

/** Höchstens so viele Zauber aus Höhenmarken im Vorrat. */
export const TOWER_STOCK_MAX = 3;
/** Abstand der Glücks-Zauber je Spieler (zufällig dazwischen). */
export const TOWER_LUCK_MIN_MS = 10_000;
export const TOWER_LUCK_MAX_MS = 20_000;
/** Herkunft eines eingesetzten Zaubers. */
export type TowerSpellSource = 'stock' | 'luck';

export const TOWER_GROUP_LABELS: Record<TowerSpecialGroup, string> = { light: 'Helle Magie', dark: 'Dunkle Magie' };

/** Angebot an einer Marke: ein heller und ein dunkler Zauber, genau einer wird genommen. */
export interface TowerOffer {
  light: TowerSpecial;
  dark: TowerSpecial;
}

/** So lange bleiben einmalige Effekte (Windstoß, Brocken …) als Hinweis sichtbar. */
export const TOWER_EFFECT_SHOW_MS = 3000;

export function isTowerSpecial(x: unknown): x is TowerSpecial {
  return typeof x === 'string' && (TOWER_SPECIAL_IDS as readonly string[]).includes(x);
}

/** Muss der Spieler ein Ziel wählen? */
export function specialTargetsOthers(s: TowerSpecial): boolean {
  return TOWER_SPECIALS[s].group === 'dark';
}

/** So viele helle und dunkle Zauber sind pro Partie im Spiel. */
export const TOWER_POOL_PER_SIDE = 4;

/** Zieht die Auswahl einer Partie: je Seite `TOWER_POOL_PER_SIDE` Zauber. */
export function towerPool(random: () => number): TowerSpecial[] {
  const pick = (group: TowerSpecialGroup) => shuffle(TOWER_SPECIAL_IDS.filter((id) => TOWER_SPECIALS[id].group === group), random).slice(0, TOWER_POOL_PER_SIDE);
  return [...pick('light'), ...pick('dark')];
}

/**
 * Angebot an einer Marke nach Rang (1 = vorne) bei `n` Spielern, aus der Auswahl der Partie. Aufholhilfe: Wer
 * zurückliegt, bekommt eher starke helle Zauber (hoher `value`), wer vorne liegt, eher schwache.
 */
export function offerFor(rank: number, n: number, pool: readonly TowerSpecial[], random: () => number): TowerOffer {
  const t = n <= 1 ? 0.5 : Math.min(1, Math.max(0, (rank - 1) / (n - 1)));
  const draw = (group: TowerSpecialGroup): TowerSpecial => {
    const ids = pool.filter((id) => TOWER_SPECIALS[id].group === group);
    const list = ids.length > 0 ? ids : TOWER_SPECIAL_IDS.filter((id) => TOWER_SPECIALS[id].group === group);
    const weight = (id: TowerSpecial) => (group === 'light' ? 1 + (TOWER_SPECIALS[id].value - 2) * (t - 0.5) * 2 : 1);
    const total = list.reduce((sum, id) => sum + Math.max(0.1, weight(id)), 0);
    let r = random() * total;
    for (const id of list) {
      r -= Math.max(0.1, weight(id));
      if (r < 0) return id;
    }
    return list[list.length - 1]!;
  };
  return { light: draw('light'), dark: draw('dark') };
}

/**
 * Glücks-Zauber nach Rang: hell oder dunkel gemischt. Wer hinten liegt, bekommt öfter hellen (und starken),
 * wer vorne liegt, öfter dunklen Zauber.
 */
export function luckFor(rank: number, n: number, pool: readonly TowerSpecial[], random: () => number): TowerSpecial {
  const t = n <= 1 ? 0.5 : Math.min(1, Math.max(0, (rank - 1) / (n - 1)));
  const offer = offerFor(rank, n, pool, random);
  return random() < 0.3 + 0.5 * t ? offer.light : offer.dark;
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
/** Versteinert: fest, bewegt sich nicht mehr. */
export const STONE_PETRIFIED = 32;
/** Vergrößern: anderthalbmal so groß gezeichnet und simuliert. (Mini-Steine nutzen `STONE_SHRUNK`.) */
export const STONE_GIANT = 64;
/** Schwerer Stein: viel Masse und Reibung, sieht dunkel-metallisch aus. */
export const STONE_HEAVY = 128;
const STONE_FLAGS_MAX = 255;

/** Effekt-Flags des ganzen Turms */
export const FX_ICE = 1;
export const FX_FOG = 2;
export const FX_TURBO = 4;
export const FX_BEAM = 8;
/** Ranken scharf (die nächsten Steine ranken sich an). */
export const FX_GLUE = 16;
/** Größenzauber scharf (Vergrößern oder Mini-Steine für die nächsten Steine). */
export const FX_BOULDER = 32;
/** Schwerer Stein scharf. */
export const FX_HEAVY = 64;
/** Steinwahl aktiv. */
export const FX_PICK = 128;
const FX_MAX = 255;

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
