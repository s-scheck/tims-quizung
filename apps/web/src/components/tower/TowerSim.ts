import { AABB, Box, Circle, Polygon, testOverlap, Transform, Vec2, WeldJoint, World, type Body, type Contact, type Fixture, type Shape } from 'planck';
import {
  formCells,
  packFrame,
  STONE_FALLING,
  STONE_GIANT,
  STONE_PETRIFIED,
  STONE_GLUED,
  STONE_ICY,
  STONE_SHRUNK,
  STONE_SPECIAL,
  FX_BEAM,
  FX_BOULDER,
  FX_ICE,
  FX_SHIELD,
  FX_TURBO,
  TOWER_BASE_HALF,
  TOWER_BEAM,
  TOWER_BEAM_HALF,
  TOWER_ROUND,
  TOWER_ROUND_RADIUS,
  TOWER_FIELD_HALF,
  TOWER_HOLD_MS,
  towerPiece,
  towerSpawn,
  TOWER_STEERED_WINDOW,
  type TowerFrame,
  type TowerSpecial,
  type TowerStone,
} from '@quiz/shared';

/**
 * Hochstapler-Physik eines Turms mit planck.js, ohne DOM. Fester Zeitschritt 60 Hz.
 *
 * Der fallende Stein ist ein dynamischer Körper ohne Schwerkraft, dessen Geschwindigkeit die Steuerung vorgibt:
 * Er gleitet mit weichem Anfahren und Abbremsen auf ein Halbzellen-Raster und dreht sich ebenso weich in
 * Vierteldrehungen. Sobald er irgendetwas berührt, wird er ein normaler Stein. Der Sockel ist ein fester Körper
 * mit Oberkante y = 0.
 *
 * Neue Steine erscheinen mit seitlichem Versatz und gedreht (deterministisch aus dem Seed), heruntergefallene
 * Steine kosten eine kurze Pause, und das Grundtempo steigt langsam: Nichtstun baut keinen Turm.
 */

export const STEP_MS = 1000 / 60;
const STEP_S = 1 / 60;
const GRAVITY = -22;
/** Grundtempo beim Fallen, Einheiten pro Sekunde; steigt im Lauf des Rennens bis `FALL_SPEED_MAX`. */
export const FALL_SPEED = 2.4;
const FALL_SPEED_MAX = 3.6;
const FALL_RAMP_PER_MIN = 0.45;
/** Tempo mit gedrücktem ▼. */
export const FAST_SPEED = 13;
/** So schnell zieht das Fallen an (Einheiten/s²); abgebremst wird sofort. */
const FALL_ACCEL = 90;
/** Kurz vor dem Aufsetzen bremst ein schneller Stein ab: höchstens so schnell plus `LAND_BRAKE` je Einheit Abstand. */
const LAND_SPEED = 3.2;
const LAND_BRAKE = 6;
/** Seitliches Gleiten: Beschleunigung, Bremsweg und Höchsttempo. */
const SLIDE_ACCEL = 260;
const SLIDE_BRAKE = 150;
const SLIDE_MAX = 15;
/** Drehen: in gut einer Zehntelsekunde eine Vierteldrehung. */
const TURN_ACCEL = 600;
const TURN_BRAKE = 340;
const TURN_MAX = 24;

/**
 * Hitbox der Steine. planck legt um jedes Polygon eine Haut von 0,01 (`polygonRadius`); zwei Polygone berühren
 * sich schon, wenn sich die Häute überlappen, und ruhen mit 0,005 Überlappung (`linearSlop`) aufeinander. Mit
 * Zellen von genau 1 Breite war ein Stein darum physikalisch 1,02 breit: Er passte nicht in eine gleich breite
 * Lücke, und wer bündig neben einem anderen Stein aufsetzte, blieb mit der Unterkante auf dessen Ecke hängen und
 * kippte. Die Hitbox ist deshalb kleiner als die gezeichnete Form, und zwar je nach Richtung in der Welt:
 * - waagrecht um `HIT_INSET_SIDE`: Bündig nebeneinander bleiben 2 · (0,03 − 0,01) = 0,04 Luft zwischen den Häuten,
 *   eine Lücke darf also um so viel zu schmal sein (liegende Steine stehen oft ein paar Hundertstel daneben).
 *   Gedrückt aneinander überlappen sich die gezeichneten Steine dafür um höchstens 0,045, gut ein Pixel;
 * - senkrecht um `HIT_INSET_STACK`: genau so viel, dass aufeinander liegende Steine wie gezeichnet bündig ruhen
 *   (2 · 0,0075 = 0,015 = Hautdicke minus Überlappung). Sonst säße ein L, das über zwei Ebenen greift, schief.
 * Welche Achse des Steins waagrecht liegt, folgt aus seiner Vierteldrehung (siehe `reshape`).
 */
const HIT_INSET_SIDE = 0.03;
const HIT_INSET_STACK = 0.0075;
/**
 * Fase an den äußeren Ecken (wie die gezeichnete Rundung): Eine Ecke, die knapp auf eine andere trifft, gleitet
 * daran ab und rutscht in die Lücke, statt darauf zu ruhen.
 */
const HIT_CHAMFER = 0.05;
/**
 * Kantenhilfe: Würde der fallende Stein im nächsten Schritt etwas streifen, und reicht ein seitliches Ausweichen
 * um höchstens so viel, um frei zu bleiben, rückt er so weit zur Seite und fällt weiter. Liegende Steine stehen oft
 * ein paar Hundertstel neben dem Raster; ohne die Hilfe bliebe ein sauber gezielter Stein auf deren Ecke hängen.
 * Ein echtes Aufsetzen lässt sich so nicht wegschieben, und ein Stein, der weniger als das auf einer Kante liegen
 * würde, hielte dort ohnehin nicht.
 */
const EDGE_ASSIST = 0.08;
const EDGE_ASSIST_STEP = 0.005;

const FRICTION = 0.72;
const ICE_FRICTION = 0.02;
const DENSITY = 1;
/** Etwas Luftwiderstand: Türme schwingen aus, statt ewig zu zittern. */
const LINEAR_DAMPING = 0.06;
const ANGULAR_DAMPING = 0.4;
const VELOCITY_ITERATIONS = 10;
const POSITION_ITERATIONS = 8;

/** Neue Steine erscheinen so weit über der Turmspitze. */
export const SPAWN_GAP = 7;
const SPAWN_DELAY_MS = 220;
/** Strafe für einen heruntergefallenen Stein: so viel länger bis zum nächsten. */
export const LOST_DELAY_MS = 900;
const LOST_DELAY_MAX_MS = 1800;
/** Eingaben in der Pause zwischen zwei Steinen gelten für den nächsten. */
const INPUT_BUFFER_MS = 400;
const SHRINK = 0.7;
/** Riesenstein: die nächste Form anderthalbfach. */
const GIANT = 1.5;
/** Ranken verbinden alle Steine, deren Oberkante höchstens so weit unter der Spitze liegt. */
const VINE_DEPTH = 3;
/** Versteinern erfasst alles, was ganz unterhalb von Spitze minus diesem Abstand liegt. */
const PETRIFY_DEPTH = 2;
/** Steine liegen genau auf dem Raster; Grenzfälle bei Ranken und Versteinern nicht dem Rundungsfehler überlassen. */
const DEPTH_TOLERANCE = 0.05;
/** Rundsteine rollen, also kaum Drehdämpfung. */
const ROUND_ANGULAR_DAMPING = 0.05;
/** Steine unterhalb davon oder seitlich weit draußen sind heruntergefallen und verschwinden. */
const LOST_Y = -5;
const LOST_X = 13;
const CALM_SPEED = 0.15;
const CALM_SPIN = 0.2;
/** Ab dieser Annäherungsgeschwindigkeit klackt ein Zusammenstoß liegender Steine hörbar. */
const BUMP_SPEED = 1.4;
const BUMP_GAP_MS = 45;
/** Schritte der Halte-Anzeige (für den steigenden Ton). */
const HOLD_STEPS = 12;
const WOBBLE_EVENT = 0.3;
const WOBBLE_GAP_MS = 700;

/**
 * Was in der Simulation passiert, für Klang, Vibration, Anzeige und Server. Alle Koordinaten in Steineinheiten.
 * - `spawn`: neuer fallender Stein (Startlage aus dem Seed).
 * - `shift` / `turn`: der fallende Stein wurde verschoben bzw. gedreht (nicht gemeldet, wenn am Rand blockiert).
 * - `land`: der fallende Stein hat etwas berührt; `impact` 0 bis 1 ist die Aufprallstärke.
 * - `bump`: zwei liegende Steine (oder Stein und Sockel) stoßen spürbar zusammen, gedrosselt.
 * - `lost`: ein Stein ist heruntergefallen; `delayMs` ist die Strafpause bis zum nächsten Stein.
 * - `wobble`: der Turm gerät ins Wanken, `amount` 0 bis 1.
 * - `hold`: Fortschritt der Ruheprüfung über der Linie stieg (Zwölftel-Schritte), `holdLost`: abgebrochen.
 * - `vines`, `petrify`, `vanish`: helle Magie hat gewirkt (Anzahl Steine bzw. der weggezauberte Stein).
 * - `special`, `mark`, `finish`: wie gehabt, gehen an den Server.
 */
export type SimEvent =
  | { type: 'spawn'; index: number; form: number; x: number }
  | { type: 'shift'; dir: -1 | 1; x: number }
  | { type: 'turn'; dir: -1 | 1 }
  | { type: 'land'; index: number; form: number; x: number; y: number; impact: number }
  | { type: 'bump'; x: number; y: number; impact: number }
  | { type: 'lost'; index: number; x: number; falling: boolean; delayMs: number }
  | { type: 'wobble'; amount: number }
  | { type: 'hold'; progress: number }
  | { type: 'holdLost'; progress: number }
  | { type: 'vines'; count: number }
  | { type: 'petrify'; count: number }
  | { type: 'vanish'; id: number; form: number; x: number; y: number; a: number }
  | { type: 'special'; index: number; height: number }
  | { type: 'mark'; height: number }
  | { type: 'finish'; height: number };

interface Piece {
  id: number;
  /** Index im Steinstrom. */
  index: number;
  form: number;
  body: Body;
  special: boolean;
  glued: boolean;
  petrified: boolean;
  scale: number;
  /** Vom Spieler verschoben oder gedreht. */
  steered: boolean;
  /** Hitbox für gerade Vierteldrehung (x-Achse waagrecht) gebaut, sonst für ungerade. */
  upright: boolean;
}

export interface StreamPiece {
  form: number;
  special: boolean;
  /** Startversatz und Vierteldrehungen im Uhrzeigersinn, sonst mittig und gerade. */
  x?: number;
  turns?: number;
}

export interface TowerSimOptions {
  seed: number;
  goalHeight: number;
  marks?: number[];
  /** Schon erreichte Marken (nach Neuladen), bringen kein zweites Spezial. */
  reachedMarks?: number[];
  /** Für Tests: eigener Steinstrom. */
  stream?: (index: number) => StreamPiece;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Rechteck einer Hitbox in Zelleinheiten (ungedreht, unskaliert) mit gefasten Ecken: unten links, unten rechts, oben rechts, oben links. */
interface HitRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Verbindungsstück zweier Blöcke: liegt innen, wird nur seitlich eingerückt und nie gefast. */
  joint: boolean;
  fase: [boolean, boolean, boolean, boolean];
}

const hitCache = new Map<number, HitRect[]>();

/** Liegt ein Stein mit diesem Winkel in gerader Vierteldrehung (x-Achse waagrecht)? */
const isUpright = (angle: number) => Math.abs(Math.round(angle / (Math.PI / 2))) % 2 === 0;

/**
 * Zerlegt eine Form in wenige konvexe Rechtecke: waagrechte Zellreihen, gleich breite übereinander zu Blöcken
 * zusammengefasst, plus je ein schmales Verbindungsstück über jeder inneren Fuge. So hat ein Stein keine inneren
 * Kanten, an denen andere hängen bleiben, und die eingerückte Hitbox bleibt lückenlos.
 */
function formHitRects(form: number): HitRect[] {
  const cached = hitCache.get(form);
  if (cached) return cached;
  const cells = formCells(form);
  const key = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const filled = new Set(cells.map((c) => key(c.x, c.y)));
  const has = (x: number, y: number) => filled.has(key(x, y));
  // Zellreihen zu Läufen
  const rows = new Map<number, number[]>();
  for (const c of cells) rows.set(c.y, [...(rows.get(c.y) ?? []), c.x]);
  let blocks: { x0: number; x1: number; y0: number; y1: number }[] = [];
  for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i]! - xs[i - 1]! < 1.01) continue;
      const run = { x0: start - 0.5, x1: xs[i - 1]! + 0.5, y0: y - 0.5, y1: y + 0.5 };
      // Gleich breiter Lauf direkt darunter: zu einem Block verlängern.
      const below = blocks.find((b) => Math.abs(b.y1 - run.y0) < 1e-6 && Math.abs(b.x0 - run.x0) < 1e-6 && Math.abs(b.x1 - run.x1) < 1e-6);
      if (below) below.y1 = run.y1;
      else blocks.push(run);
      if (i < xs.length) start = xs[i]!;
    }
  }
  blocks = blocks.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  // Außenecke: weder links/rechts daneben noch darüber/darunter eine Zelle.
  const convex = (gx: number, gy: number, sx: number, sy: number) => !has(gx + sx * 0.5, gy - sy * 0.5) && !has(gx - sx * 0.5, gy + sy * 0.5);
  const out: HitRect[] = blocks.map((b) => ({
    ...b,
    joint: false,
    fase: [convex(b.x0, b.y0, -1, -1), convex(b.x1, b.y0, 1, -1), convex(b.x1, b.y1, 1, 1), convex(b.x0, b.y1, -1, 1)],
  }));
  for (const lo of blocks) {
    for (const hi of blocks) {
      if (Math.abs(lo.y1 - hi.y0) > 1e-6) continue;
      const x0 = Math.max(lo.x0, hi.x0);
      const x1 = Math.min(lo.x1, hi.x1);
      if (x1 - x0 < 1e-6) continue;
      out.push({ x0, x1, y0: lo.y1 - 0.5, y1: lo.y1 + 0.5, joint: true, fase: [false, false, false, false] });
    }
  }
  hitCache.set(form, out);
  return out;
}

/**
 * Konvexes Polygon eines Hitbox-Rechtecks, eingerückt und gefast, in Körperkoordinaten. `upright`: Der Stein liegt
 * in gerader Vierteldrehung, seine x-Achse ist also waagrecht.
 */
function hitPolygon(r: HitRect, scale: number, upright: boolean): Vec2[] {
  const ix = upright ? HIT_INSET_SIDE : HIT_INSET_STACK;
  const iy = upright ? HIT_INSET_STACK : HIT_INSET_SIDE;
  const x0 = r.x0 * scale + ix;
  const x1 = r.x1 * scale - ix;
  // Verbindungsstücke liegen innen; oben und unten reichen sie in die Blöcke hinein.
  const y0 = r.y0 * scale + (r.joint ? 0 : iy);
  const y1 = r.y1 * scale - (r.joint ? 0 : iy);
  const c = HIT_CHAMFER * scale;
  const pts: Vec2[] = [];
  const corner = (x: number, y: number, fase: boolean, a: [number, number], b: [number, number]) => {
    if (!fase) pts.push(Vec2(x, y));
    else pts.push(Vec2(x + a[0] * c, y + a[1] * c), Vec2(x + b[0] * c, y + b[1] * c));
  };
  // Gegen den Uhrzeigersinn, je Ecke erst der Punkt auf der eingehenden, dann auf der ausgehenden Kante.
  corner(x0, y0, r.fase[0], [0, 1], [1, 0]);
  corner(x1, y0, r.fase[1], [-1, 0], [0, 1]);
  corner(x1, y1, r.fase[2], [0, -1], [-1, 0]);
  corner(x0, y1, r.fase[3], [1, 0], [0, -1]);
  return pts;
}

/**
 * Geschwindigkeit, mit der man `err` entfernt sanft ankommt: anfahren mit `accel`, abbremsen mit `brake`,
 * höchstens `max`, und im letzten Schritt genau aufs Ziel.
 */
function glide(err: number, current: number, accel: number, brake: number, max: number): number {
  const a = Math.abs(err);
  if (a < 1e-5) return 0;
  const want = Math.sign(err) * Math.min(max, Math.sqrt(2 * brake * a), a / STEP_S);
  // Anfahren begrenzt, bremsen und umkehren sofort.
  if (Math.sign(want) === Math.sign(current) && Math.abs(want) <= Math.abs(current)) return want;
  const from = Math.sign(want) === Math.sign(current) ? current : 0;
  const dv = accel * STEP_S;
  return Math.abs(want - from) <= dv ? want : from + Math.sign(want - from) * dv;
}

export class TowerSim {
  readonly world: World;
  readonly base: Body;
  readonly goalHeight: number;
  pieces: Piece[] = [];
  current: Piece | null = null;
  /** Simulierte Zeit in ms. */
  time = 0;
  height = 0;
  /** Wie lange der Turm schon ruhig über der Linie steht. */
  holdMs = 0;
  finished = false;
  calm = false;
  /** Wie stark der Turm gerade wankt, 0 bis 1, langsam abklingend. */
  wobble = 0;
  /** Heruntergefallene Steine bisher. */
  lostCount = 0;

  // Steuerung
  targetX = 0;
  targetAngle = 0;
  fast = false;
  // Effekte
  ice = false;
  turbo = false;
  /** Nächster Stein wird ein Riesenstein (dunkle Magie). */
  boulderArmed = false;
  /** Nächster Stein ist rund (dunkle Magie). */
  roundArmed = false;
  shrinkArmed = false;
  /** Schutzschild aktiv (nur Anzeige, das Abfangen erledigt der Server). */
  shield = false;
  beam: Body | null = null;

  private nextIndex = 0;
  private nextId = 1;
  private spawnAt = 0;
  private pendingDelay = 0;
  private acc = 0;
  private landOn: Body | null | undefined = undefined;
  /** Geschwindigkeit des fallenden Steins vor dem Schritt, für die Aufprallstärke. */
  private preVel = { x: 0, y: 0 };
  private events: SimEvent[] = [];
  private marks: number[];
  private reached: Set<number>;
  private stream: (index: number) => StreamPiece;
  private bufShift = 0;
  private bufTurns = 0;
  private bufAt = -Infinity;
  private lastBump = -Infinity;
  private lastWobble = -Infinity;
  private holdStep = 0;
  /** Ob die zuletzt gelandeten Steine gesteuert waren. */
  private recentSteered: boolean[] = [];
  /** Zuletzt aufgesetzter Stein, für Wegzaubern. */
  private lastLanded: Piece | null = null;

  constructor(opts: TowerSimOptions) {
    this.goalHeight = opts.goalHeight;
    this.marks = opts.marks ?? [];
    this.reached = new Set(opts.reachedMarks ?? []);
    this.stream = opts.stream ?? ((i) => ({ ...towerPiece(opts.seed, i), ...towerSpawn(opts.seed, i) }));
    this.world = new World({ gravity: Vec2(0, GRAVITY) });
    // Um die halbe Ruhe-Überlappung tiefer, damit die unterste Lage wie gezeichnet genau auf y = 0 aufliegt.
    this.base = this.world.createBody({ type: 'static', position: Vec2(0, -0.5 - HIT_INSET_STACK) });
    this.base.createFixture({ shape: Box(TOWER_BASE_HALF, 0.5), friction: FRICTION });
    this.world.on('begin-contact', (c: Contact) => this.onContact(c));
  }

  // ------------------------------------------------------------ Steuerung

  /** Eine halbe Einheit nach links oder rechts. Gibt zurück, ob sich etwas bewegt (nicht am Rand). */
  move(dir: -1 | 1): boolean {
    if (!this.current) {
      this.buffer();
      this.bufShift = clamp(this.bufShift + dir, -4 * TOWER_FIELD_HALF, 4 * TOWER_FIELD_HALF);
      return false;
    }
    const x = clamp(this.targetX + dir * 0.5, -TOWER_FIELD_HALF, TOWER_FIELD_HALF);
    if (x === this.targetX) return false;
    this.targetX = x;
    this.current.steered = true;
    this.events.push({ type: 'shift', dir, x });
    return true;
  }

  /** Vierteldrehung, `dir` 1 im Uhrzeigersinn (Standard), -1 dagegen. */
  rotate(dir: -1 | 1 = 1): void {
    if (!this.current) {
      this.buffer();
      this.bufTurns = (this.bufTurns + dir + 4) % 4;
      return;
    }
    this.targetAngle -= (dir * Math.PI) / 2;
    this.current.steered = true;
    this.reshape(this.current, this.targetAngle);
    this.events.push({ type: 'turn', dir });
  }

  /** Eingaben zwischen zwei Steinen sammeln; zu alte verfallen. */
  private buffer(): void {
    if (this.time - this.bufAt > INPUT_BUFFER_MS) {
      this.bufShift = 0;
      this.bufTurns = 0;
    }
    this.bufAt = this.time;
  }

  // -------------------------------------------------------------- Effekte

  setIce(on: boolean): void {
    if (this.ice === on) return;
    this.ice = on;
    // Sockel und Steine zugleich, Reibung wird je Kontakt aus beiden Seiten gemischt.
    for (const body of [this.base, ...this.pieces.map((p) => p.body)]) for (let f = body.getFixtureList(); f; f = f.getNext()) f.setFriction(on ? ICE_FRICTION : FRICTION);
    for (let c = this.world.getContactList(); c; c = c.getNext()) c.resetFriction();
  }

  /**
   * Wirkt einen Zauber auf diesen Turm, so wie er beim Ziel ankommt (abgefangene nicht übergeben).
   * Dauer-Effekte (Glatteis, Turbo, Nebel, Schild, Balken-Ende) steuert der Aufrufer über die Laufzeit.
   */
  applySpecial(special: TowerSpecial, dir: -1 | 1 = 1): void {
    switch (special) {
      case 'glue':
        this.vines();
        break;
      case 'shrink':
        this.shrink();
        break;
      case 'beam':
        this.addBeam();
        break;
      case 'petrify':
        this.petrify();
        break;
      case 'vanish':
        this.vanish();
        break;
      case 'boulder':
        this.boulderArmed = true;
        break;
      case 'round':
        this.roundArmed = true;
        break;
      case 'gust':
        this.gust(dir);
        break;
      case 'ice':
        this.setIce(true);
        break;
      case 'turbo':
        this.turbo = true;
        break;
      case 'shield':
        this.shield = true;
        break;
      case 'fog':
        break;
    }
  }

  /** Liegende Steine (ohne den fallenden und ohne heruntergefallene). */
  private settled(): Piece[] {
    return this.pieces.filter((p) => p !== this.current && p.body.getPosition().y > -0.5);
  }

  /** Ranken: Die oberen Steine werden dort, wo sie sich berühren, fest miteinander und mit ihrer Auflage verschweißt. */
  vines(): number {
    const top = this.settled().filter((p) => this.topOf(p) > this.height - VINE_DEPTH + DEPTH_TOLERANCE);
    const set = new Set(top.map((p) => p.body));
    for (let c = this.world.getContactList(); c; c = c.getNext()) {
      if (!c.isTouching()) continue;
      const a = c.getFixtureA().getBody();
      const b = c.getFixtureB().getBody();
      if (!set.has(a) && !set.has(b)) continue;
      if (a === this.current?.body || b === this.current?.body || a === this.beam || b === this.beam) continue;
      if (this.welded(a, b)) continue;
      const pt = c.getWorldManifold(null)?.points[0] ?? b.getWorldCenter();
      this.world.createJoint(new WeldJoint({ frequencyHz: 0, dampingRatio: 0 }, a, b, pt));
    }
    for (const p of top) {
      p.glued = true;
      p.body.setAwake(true);
    }
    this.events.push({ type: 'vines', count: top.length });
    return top.length;
  }

  private welded(a: Body, b: Body): boolean {
    for (let j = a.getJointList(); j; j = j.next) if (j.other === b) return true;
    return false;
  }

  /** Versteinern: alles, was ganz unterhalb von Spitze − 2 ruht, wird fester Fels wie ein neuer Sockel. */
  petrify(): number {
    const limit = this.height - PETRIFY_DEPTH + DEPTH_TOLERANCE;
    let count = 0;
    for (const p of this.settled()) {
      if (p.petrified || this.topOf(p) > limit) continue;
      if (p.body.getLinearVelocity().length() > 1 || p.body.getPosition().y < 0) continue;
      p.body.setLinearVelocity(Vec2(0, 0));
      p.body.setAngularVelocity(0);
      p.body.setType('static');
      p.petrified = true;
      count++;
    }
    for (const p of this.pieces) p.body.setAwake(true);
    this.events.push({ type: 'petrify', count });
    return count;
  }

  /** Wegzaubern: der zuletzt gesetzte liegende Stein verschwindet einfach aus der Welt. */
  vanish(): boolean {
    let p = this.lastLanded && this.pieces.includes(this.lastLanded) && this.lastLanded !== this.current ? this.lastLanded : null;
    if (!p || p.petrified) {
      const loose = this.settled().filter((x) => !x.petrified);
      p = loose.reduce<Piece | null>((best, x) => (!best || x.index > best.index ? x : best), null);
    }
    if (!p) return false;
    const pos = p.body.getPosition();
    this.events.push({ type: 'vanish', id: p.id, form: p.form, x: pos.x, y: pos.y, a: p.body.getAngle() });
    this.world.destroyBody(p.body);
    this.pieces = this.pieces.filter((x) => x !== p);
    for (const o of this.pieces) o.body.setAwake(true);
    if (this.lastLanded === p) this.lastLanded = null;
    return true;
  }

  /** Aktuellen Stein auf 70 % schrumpfen, sonst den nächsten. */
  shrink(): void {
    const p = this.current;
    if (!p || p.scale < 1) {
      this.shrinkArmed = true;
      return;
    }
    this.rebuild(p, p.scale * SHRINK);
  }

  /** Seitlicher Stoß gegen den Turm, oben stärker als unten. */
  gust(dir: -1 | 1): void {
    for (const p of this.pieces) {
      if (p === this.current) continue;
      const pos = p.body.getPosition();
      const dv = dir * (0.45 + 0.05 * Math.max(0, pos.y));
      p.body.applyLinearImpulse(Vec2(p.body.getMass() * dv, 0), p.body.getWorldCenter(), true);
    }
  }

  /**
   * Fester Balken an der Turmspitze, kollidiert mit allen Steinen. Er wird von oben auf den Turm gesenkt, bis er
   * gleich etwas berühren würde, und zwar dort (um die Mitte der oberen Steine), wo er am tiefsten einsinkt.
   * So überlappt er nie einen liegenden Stein und schiebt nichts weg.
   */
  addBeam(): void {
    this.removeBeam();
    const settled = this.pieces.filter((p) => p !== this.current);
    const near = settled.filter((p) => p.body.getPosition().y > this.height - 2.5);
    const cx = near.length > 0 ? near.reduce((s, p) => s + p.body.getPosition().x, 0) / near.length : 0;
    const shape = Box(TOWER_BEAM_HALF.w, TOWER_BEAM_HALF.h);
    const hh = TOWER_BEAM_HALF.h;
    let best: { x: number; y: number } | null = null;
    for (const dx of [0, -0.5, 0.5, -1, 1, -1.5, 1.5]) {
      const x = clamp(Math.round((cx + dx) * 2) / 2, -3, 3);
      let y = Math.max(this.height, 0) + hh + 0.03;
      while (y - hh > 0.03 && !this.beamOverlaps(shape, x, y - 0.05, settled)) y -= 0.05;
      if (!best || y < best.y - 0.01) best = { x, y };
    }
    const beam = this.world.createBody({ type: 'static', position: Vec2(best!.x, best!.y) });
    beam.createFixture({ shape, friction: this.ice ? ICE_FRICTION : FRICTION });
    this.beam = beam;
    for (const p of settled) p.body.setAwake(true);
  }

  private beamOverlaps(shape: Shape, x: number, y: number, pieces: Piece[]): boolean {
    const xf = Transform(Vec2(x, y), 0);
    const lo = { x: x - TOWER_BEAM_HALF.w, y: y - TOWER_BEAM_HALF.h };
    const hi = { x: x + TOWER_BEAM_HALF.w, y: y + TOWER_BEAM_HALF.h };
    for (const p of pieces) {
      for (let f: Fixture | null = p.body.getFixtureList(); f; f = f.getNext()) {
        const a = f.getAABB(0);
        if (a.upperBound.x < lo.x || a.lowerBound.x > hi.x || a.upperBound.y < lo.y || a.lowerBound.y > hi.y) continue;
        if (testOverlap(shape, 0, f.getShape(), 0, xf, p.body.getTransform())) return true;
      }
    }
    return false;
  }

  removeBeam(): void {
    if (!this.beam) return;
    this.world.destroyBody(this.beam);
    this.beam = null;
    for (const p of this.pieces) p.body.setAwake(true);
  }

  // ------------------------------------------------------------ Simulation

  /** Simuliert `ms` Millisekunden in festen Schritten. Große Sprünge (Hintergrund-Tab) kappt der Aufrufer. */
  advance(ms: number): void {
    this.acc += ms;
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.tick();
    }
  }

  /** Nimmt die angefallenen Ereignisse ab. */
  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Form des nächsten Steins für die Vorschau. */
  peekNext(): number {
    return this.roundArmed ? TOWER_ROUND : this.stream(this.nextIndex).form;
  }

  /**
   * Zählt der Turm über der Linie? Nur wenn von den zuletzt gelandeten Steinen mindestens einer selbst gesteuert
   * (verschoben oder gedreht) war. Wer gar nicht steuert, kann so nie gewinnen, auch nicht mit Glück.
   */
  get active(): boolean {
    return this.recentSteered.some(Boolean);
  }

  /** Aktuelles Grundtempo beim Fallen (ohne ▼ und Turbo). */
  fallSpeed(): number {
    return Math.min(FALL_SPEED_MAX, FALL_SPEED + (this.time / 60_000) * FALL_RAMP_PER_MIN);
  }

  private tick(): void {
    // Steht der Turm ruhig über der Linie, kommt kein neuer Stein dazwischen: die drei Sekunden gehören dem Spieler.
    if (!this.current && this.time >= this.spawnAt && this.holdMs === 0) this.spawn();
    const p = this.current;
    if (p) this.steer(p);
    this.landOn = undefined;
    this.world.step(STEP_S, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    if (this.current && this.landOn !== undefined) this.land(this.current);
    this.time += STEP_MS;
    this.cleanup();
    this.measure();
  }

  private steer(p: Piece): void {
    const pos = p.body.getPosition();
    const v = p.body.getLinearVelocity();
    const normal = this.fallSpeed();
    let speed = this.fast ? Math.max(FAST_SPEED, normal) : normal;
    if (this.fast) speed = Math.min(speed, Math.max(normal, LAND_SPEED + this.gapBelow(p) * LAND_BRAKE));
    if (this.turbo) speed *= 2;
    // Fallen: weich anziehen, sofort bremsen.
    const cur = -v.y;
    const vy = speed <= cur ? speed : Math.min(speed, Math.max(0, cur) + FALL_ACCEL * STEP_S);
    const vx = glide(this.targetX - pos.x, v.x, SLIDE_ACCEL, SLIDE_BRAKE, SLIDE_MAX);
    const w = glide(this.targetAngle - p.body.getAngle(), p.body.getAngularVelocity(), TURN_ACCEL, TURN_BRAKE, TURN_MAX);
    p.body.setLinearVelocity(Vec2(vx, -vy));
    p.body.setAngularVelocity(w);
    this.preVel = { x: vx, y: -vy };
    this.edgeAssist(p, pos.x + vx * STEP_S, pos.y - vy * STEP_S, p.body.getAngle() + w * STEP_S);
  }

  /** Siehe `EDGE_ASSIST`: `x`, `y`, `angle` ist die Lage nach dem nächsten Schritt. */
  private edgeAssist(p: Piece, x: number, y: number, angle: number): void {
    if (!this.blocked(p, x, y, angle)) return;
    // Zuerst zur Seite, auf die der Spieler ohnehin will.
    const first = this.targetX >= x ? 1 : -1;
    for (let d = EDGE_ASSIST_STEP; d <= EDGE_ASSIST + 1e-9; d += EDGE_ASSIST_STEP) {
      for (const dir of [first, -first]) {
        // Nur nahe am Ziel des Spielers: Wer gegen eine Wand schiebt oder noch unterwegs ist, setzt auf wie immer.
        if (Math.abs(x + dir * d - this.targetX) > EDGE_ASSIST + 1e-9 || this.blocked(p, x + dir * d, y, angle)) continue;
        const pos = p.body.getPosition();
        const v = p.body.getLinearVelocity();
        // Seitlich nur versetzen, ohne Schwung in Richtung der Kante.
        p.body.setPosition(Vec2(x + dir * d, pos.y));
        p.body.setLinearVelocity(Vec2(0, v.y));
        this.preVel = { x: 0, y: v.y };
        return;
      }
    }
  }

  /** Würde der Stein in dieser Lage irgendetwas berühren (Häute überlappen)? */
  private blocked(p: Piece, x: number, y: number, angle: number): boolean {
    const xf = Transform(Vec2(x, y), angle);
    const box = new AABB();
    let hit = false;
    for (let f: Fixture | null = p.body.getFixtureList(); f && !hit; f = f.getNext()) {
      const shape = f.getShape();
      shape.computeAABB(box, xf, 0);
      this.world.queryAABB(box, (g) => {
        if (g.getBody() === p.body || !testOverlap(shape, 0, g.getShape(), 0, xf, g.getBody().getTransform())) return true;
        hit = true;
        return false;
      });
    }
    return hit;
  }

  /** Freier Weg unter dem fallenden Stein bis zum nächsten Hindernis (über die Hüllrechtecke, eher zu knapp). */
  private gapBelow(p: Piece): number {
    let lo = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let f = p.body.getFixtureList(); f; f = f.getNext()) {
      const aabb = f.getAABB(0);
      lo = Math.min(lo, aabb.lowerBound.y);
      minX = Math.min(minX, aabb.lowerBound.x);
      maxX = Math.max(maxX, aabb.upperBound.x);
    }
    let gap = Infinity;
    this.world.queryAABB({ lowerBound: Vec2(minX - 0.3, lo - 4), upperBound: Vec2(maxX + 0.3, lo + 0.3) }, (f) => {
      if (f.getBody() === p.body) return true;
      const top = f.getAABB(0).upperBound.y;
      if (top <= lo + 0.3) gap = Math.min(gap, Math.max(0, lo - top));
      return true;
    });
    return gap;
  }

  private onContact(c: Contact): void {
    const a = c.getFixtureA().getBody();
    const b = c.getFixtureB().getBody();
    const cur = this.current?.body;
    if (cur && (a === cur || b === cur)) {
      this.landOn = a === cur ? b : a;
      return;
    }
    // Klacken liegender Steine: Annäherung entlang der Kontaktnormale.
    if (this.time - this.lastBump < BUMP_GAP_MS) return;
    const wm = c.getWorldManifold(null);
    const pt = wm?.points[0];
    if (!wm || !pt) return;
    const va = a.getLinearVelocityFromWorldPoint(pt);
    const vb = b.getLinearVelocityFromWorldPoint(pt);
    const vn = Math.abs((vb.x - va.x) * wm.normal.x + (vb.y - va.y) * wm.normal.y);
    if (vn < BUMP_SPEED) return;
    this.lastBump = this.time;
    this.events.push({ type: 'bump', x: pt.x, y: pt.y, impact: clamp((vn - BUMP_SPEED * 0.6) / 7, 0, 1) });
  }

  private spawn(): void {
    const index = this.nextIndex++;
    let { form, special, x = 0, turns = 0 } = this.stream(index);
    let scale = 1;
    if (this.roundArmed) {
      form = TOWER_ROUND;
      special = false;
      this.roundArmed = false;
    } else if (this.boulderArmed) {
      scale = GIANT;
      special = false;
      this.boulderArmed = false;
    }
    // Gepufferte Eingaben aus der Pause gelten für diesen Stein.
    let steered = false;
    if (this.time - this.bufAt <= INPUT_BUFFER_MS && (this.bufShift !== 0 || this.bufTurns !== 0)) {
      x += this.bufShift * 0.5;
      turns += this.bufTurns;
      steered = true;
    }
    this.bufShift = 0;
    this.bufTurns = 0;
    this.bufAt = -Infinity;
    x = clamp(x, -TOWER_FIELD_HALF, TOWER_FIELD_HALF);
    const angle = -((((turns % 4) + 4) % 4) * Math.PI) / 2;
    const y = Math.max(this.height, 0) + SPAWN_GAP;
    const body = this.world.createBody({
      type: 'dynamic',
      position: Vec2(x, y),
      angle,
      gravityScale: 0,
      bullet: true,
      linearDamping: LINEAR_DAMPING,
      angularDamping: form === TOWER_ROUND ? ROUND_ANGULAR_DAMPING : ANGULAR_DAMPING,
    });
    const piece: Piece = { id: this.nextId++, index, form, body, special, glued: false, petrified: false, scale, steered, upright: isUpright(angle) };
    this.targetX = x;
    this.targetAngle = angle;
    this.addFixtures(piece, scale);
    this.pieces.push(piece);
    this.current = piece;
    body.setLinearVelocity(Vec2(0, -this.fallSpeed()));
    if (this.shrinkArmed) {
      this.shrinkArmed = false;
      this.rebuild(piece, SHRINK);
    }
    this.events.push({ type: 'spawn', index, form, x });
  }

  private addFixtures(p: Piece, scale: number): void {
    if (p.form === TOWER_ROUND) {
      p.body.createFixture({ shape: Circle(TOWER_ROUND_RADIUS * scale), density: DENSITY, friction: this.ice ? ICE_FRICTION : FRICTION, restitution: 0 });
      p.scale = scale;
      return;
    }
    // Verbindungsstücke überlappen die Blöcke; ohne Masse verschieben sie den Schwerpunkt nicht.
    for (const r of formHitRects(p.form)) {
      p.body.createFixture({
        shape: Polygon(hitPolygon(r, scale, p.upright)),
        density: r.joint ? 0 : DENSITY,
        friction: this.ice ? ICE_FRICTION : FRICTION,
        restitution: 0,
      });
    }
    p.scale = scale;
  }

  /**
   * Passt die Hitbox des fallenden Steins an die Zieldrehung an, damit die schmale Seite der Hitbox waagrecht liegt.
   * Der fallende Stein berührt noch nichts, das Umbauen verschiebt also nichts.
   */
  private reshape(p: Piece, angle: number): void {
    const upright = isUpright(angle);
    if (p.upright === upright || p.form === TOWER_ROUND) return;
    p.upright = upright;
    this.rebuild(p, p.scale);
  }

  private rebuild(p: Piece, scale: number): void {
    const fixtures = [];
    for (let f = p.body.getFixtureList(); f; f = f.getNext()) fixtures.push(f);
    for (const f of fixtures) p.body.destroyFixture(f);
    this.addFixtures(p, scale);
  }

  private land(p: Piece): void {
    this.current = null;
    p.body.setGravityScale(1);
    p.body.setBullet(false);
    const v = p.body.getLinearVelocity();
    // Kein Wegschießen: Seitenschwung fast ganz weg, nach unten höchstens das Grundtempo.
    p.body.setLinearVelocity(Vec2(v.x * 0.2, Math.max(v.y, -FALL_SPEED)));
    p.body.setAngularVelocity(p.body.getAngularVelocity() * 0.2);
    this.lastLanded = p;
    this.recentSteered = [...this.recentSteered, p.steered].slice(-TOWER_STEERED_WINDOW);
    this.spawnAt = this.time + SPAWN_DELAY_MS + this.pendingDelay;
    this.pendingDelay = 0;
    const pos = p.body.getPosition();
    const speed = Math.hypot(this.preVel.x * 0.5, this.preVel.y);
    this.events.push({ type: 'land', index: p.index, form: p.form, x: pos.x, y: pos.y, impact: clamp(speed / 7, 0, 1) });
    if (p.special) {
      p.special = false;
      this.events.push({ type: 'special', index: p.index, height: this.height });
    }
  }

  private cleanup(): void {
    const lost = this.pieces.filter((p) => {
      const pos = p.body.getPosition();
      return pos.y < LOST_Y || Math.abs(pos.x) > LOST_X;
    });
    if (lost.length === 0) return;
    for (const p of lost) {
      const falling = p === this.current;
      const x = p.body.getPosition().x;
      this.world.destroyBody(p.body);
      this.lostCount++;
      if (falling) {
        this.current = null;
        this.spawnAt = this.time + SPAWN_DELAY_MS + LOST_DELAY_MS;
      } else if (this.current) {
        this.pendingDelay = Math.min(LOST_DELAY_MAX_MS, this.pendingDelay + LOST_DELAY_MS);
      } else {
        this.spawnAt = Math.min(Math.max(this.spawnAt, this.time) + LOST_DELAY_MS, this.time + LOST_DELAY_MAX_MS);
      }
      this.events.push({ type: 'lost', index: p.index, x, falling, delayMs: LOST_DELAY_MS });
    }
    this.pieces = this.pieces.filter((p) => !lost.includes(p));
  }

  /** Turmhöhe, Ruhe, Wanken, Marken und Ziel. */
  private measure(): void {
    let calm = true;
    let shake = 0;
    for (const p of this.pieces) {
      if (p === this.current) continue;
      const v = p.body.getLinearVelocity().length();
      const w = Math.abs(p.body.getAngularVelocity());
      if (v > CALM_SPEED || w > CALM_SPIN) calm = false;
      // Freier Fall (heruntergefallene Steine) zählt nicht als Wanken.
      if (p.body.getPosition().y > -0.5) shake = Math.max(shake, w * 0.7 + v * 0.35);
    }
    this.height = this.cornerTop();
    this.calm = calm;
    const amount = clamp((shake - 0.25) / 1.6, 0, 1);
    this.wobble = Math.max(amount, this.wobble * 0.94);
    if (amount >= WOBBLE_EVENT && this.time - this.lastWobble > WOBBLE_GAP_MS) {
      this.lastWobble = this.time;
      this.events.push({ type: 'wobble', amount });
    }

    for (const m of this.marks) {
      if (this.height >= m && !this.reached.has(m)) {
        this.reached.add(m);
        this.events.push({ type: 'mark', height: this.height });
      }
    }
    const holding = this.height >= this.goalHeight && calm && this.active;
    if (holding) this.holdMs += STEP_MS;
    else this.holdMs = Math.max(0, this.holdMs - STEP_MS * 3);
    const step = Math.floor((this.holdMs / TOWER_HOLD_MS) * HOLD_STEPS);
    if (holding && step > this.holdStep) {
      this.holdStep = step;
      this.events.push({ type: 'hold', progress: Math.min(1, this.holdMs / TOWER_HOLD_MS) });
    } else if (!holding && this.holdStep > 0) {
      if (this.holdStep >= 2) this.events.push({ type: 'holdLost', progress: this.holdStep / HOLD_STEPS });
      this.holdStep = 0;
    }
    if (this.holdMs >= TOWER_HOLD_MS) {
      // Meldung ans Ziel. Bleibt das Rennen offen (Meldung ging verloren oder kam zu früh), folgt nach 1,5 s die nächste.
      this.finished = true;
      this.events.push({ type: 'finish', height: this.height });
      this.holdMs = TOWER_HOLD_MS - 1500;
      this.holdStep = Math.floor((this.holdMs / TOWER_HOLD_MS) * HOLD_STEPS);
    }
  }

  /** Höchste Ecke eines liegenden Steins (echte Ecken, nicht die AABB, die bei Drehung zu hoch liegt). */
  private cornerTop(): number {
    let top = 0;
    for (const p of this.pieces) {
      if (p === this.current) continue;
      const t = this.topOf(p);
      if (t > top && t < 200) top = t;
    }
    return top;
  }

  /** Oberkante eines Steins. */
  private topOf(p: Piece): number {
    if (p.form === TOWER_ROUND) return p.body.getPosition().y + TOWER_ROUND_RADIUS * p.scale;
    const half = 0.5 * p.scale;
    let top = -Infinity;
    for (const c of formCells(p.form)) {
      for (const [dx, dy] of [[-half, half], [half, half], [-half, -half], [half, -half]] as const) {
        const w = p.body.getWorldPoint(Vec2(c.x * p.scale + dx, c.y * p.scale + dy));
        if (w.y > top) top = w.y;
      }
    }
    return top;
  }

  // ------------------------------------------------------------ Ausgabe

  stones(): TowerStone[] {
    const out: TowerStone[] = [];
    for (const p of this.pieces) {
      const pos = p.body.getPosition();
      let flags = 0;
      if (p === this.current) flags |= STONE_FALLING;
      if (p.glued) flags |= STONE_GLUED;
      if (p.special) flags |= STONE_SPECIAL;
      if (p.scale < 1) flags |= STONE_SHRUNK;
      if (p.scale > 1) flags |= STONE_GIANT;
      if (p.petrified) flags |= STONE_PETRIFIED;
      if (this.ice && p !== this.current) flags |= STONE_ICY;
      out.push({ id: p.id, form: p.form, x: pos.x, y: pos.y, a: p.body.getAngle(), flags });
    }
    if (this.beam) {
      const pos = this.beam.getPosition();
      out.push({ id: 0, form: TOWER_BEAM, x: pos.x, y: pos.y, a: 0, flags: 0 });
    }
    return out;
  }

  effectFlags(): number {
    return (this.ice ? FX_ICE : 0) | (this.turbo ? FX_TURBO : 0) | (this.beam ? FX_BEAM : 0) | (this.boulderArmed ? FX_BOULDER : 0) | (this.shield ? FX_SHIELD : 0);
  }

  /** Schnappschuss für die Leitung. `extraFx` ergänzt Effekte, die nur die Anzeige betreffen (Nebel). */
  frame(t: number, extraFx = 0, hideNext = false): TowerFrame {
    return packFrame({
      t,
      h: this.height,
      fx: this.effectFlags() | extraFx,
      hold: this.holdMs / TOWER_HOLD_MS,
      next: hideNext ? -1 : this.peekNext(),
      stones: this.stones(),
    });
  }
}
