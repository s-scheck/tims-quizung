import { Box, Vec2, WeldJoint, World, type Body, type Contact } from 'planck';
import {
  formCells,
  packFrame,
  STONE_FALLING,
  STONE_GLUED,
  STONE_ICY,
  STONE_SHRUNK,
  STONE_SPECIAL,
  FX_BEAM,
  FX_BOULDER,
  FX_GLUE,
  FX_ICE,
  FX_TURBO,
  TOWER_BASE_HALF,
  TOWER_BEAM,
  TOWER_BEAM_HALF,
  TOWER_BOULDER,
  TOWER_FIELD_HALF,
  TOWER_HOLD_MS,
  towerPiece,
  type TowerFrame,
  type TowerStone,
} from '@quiz/shared';

/**
 * Hochstapler-Physik eines Turms mit planck.js, ohne DOM. Fester Zeitschritt 60 Hz.
 * Der fallende Stein ist ein dynamischer Körper ohne Schwerkraft, dessen Geschwindigkeit die Steuerung vorgibt;
 * sobald er irgendetwas berührt, wird er ein normaler Stein. Der Sockel ist ein fester Körper mit Oberkante y = 0.
 */

export const STEP_MS = 1000 / 60;
const STEP_S = 1 / 60;
const GRAVITY = -22;
/** Fallgeschwindigkeit normal und gedrückt, Einheiten pro Sekunde. */
export const FALL_SPEED = 2.2;
export const FAST_SPEED = 9;
/** Kurz vor dem Aufsetzen wird ein schneller Stein abgebremst, damit er den Turm nicht wegschießt. */
const FAST_LANDING_SPEED = 3.5;
const FRICTION = 0.6;
const ICE_FRICTION = 0.02;
const DENSITY = 1;
/** Neue Steine erscheinen so weit über der Turmspitze. */
export const SPAWN_GAP = 7;
const SPAWN_DELAY_MS = 260;
const SHRINK = 0.7;
/** Steine unterhalb davon oder seitlich weit draußen sind heruntergefallen und verschwinden. */
const LOST_Y = -5;
const LOST_X = 13;
const CALM_SPEED = 0.15;
const CALM_SPIN = 0.2;

const CAT_PIECE = 0x0001;
const CAT_OLD = 0x0002;
const CAT_BEAM = 0x0008;

export type SimEvent =
  | { type: 'land'; index: number }
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
  scale: number;
}

export interface TowerSimOptions {
  seed: number;
  goalHeight: number;
  marks?: number[];
  /** Schon erreichte Marken (nach Neuladen), bringen kein zweites Spezial. */
  reachedMarks?: number[];
  /** Für Tests: eigener Steinstrom. */
  stream?: (index: number) => { form: number; special: boolean };
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

  // Steuerung
  targetX = 0;
  targetAngle = 0;
  fast = false;
  // Effekte
  ice = false;
  turbo = false;
  glueArmed = false;
  boulderArmed = false;
  shrinkArmed = false;
  beam: Body | null = null;

  private nextIndex = 0;
  private nextId = 1;
  private spawnAt = 0;
  private acc = 0;
  private landOn: Body | null | undefined = undefined;
  private events: SimEvent[] = [];
  private marks: number[];
  private reached: Set<number>;
  private stream: (index: number) => { form: number; special: boolean };

  constructor(opts: TowerSimOptions) {
    this.goalHeight = opts.goalHeight;
    this.marks = opts.marks ?? [];
    this.reached = new Set(opts.reachedMarks ?? []);
    this.stream = opts.stream ?? ((i) => towerPiece(opts.seed, i));
    this.world = new World({ gravity: Vec2(0, GRAVITY) });
    this.base = this.world.createBody({ type: 'static', position: Vec2(0, -0.5) });
    this.base.createFixture({ shape: Box(TOWER_BASE_HALF, 0.5), friction: FRICTION });
    this.world.on('begin-contact', (c: Contact) => this.onContact(c));
  }

  // ------------------------------------------------------------ Steuerung

  move(dir: -1 | 1): void {
    if (!this.current) return;
    this.targetX = Math.max(-TOWER_FIELD_HALF, Math.min(TOWER_FIELD_HALF, this.targetX + dir * 0.5));
  }

  rotate(): void {
    if (this.current) this.targetAngle -= Math.PI / 2;
  }

  // -------------------------------------------------------------- Effekte

  setIce(on: boolean): void {
    if (this.ice === on) return;
    this.ice = on;
    // Sockel und Steine zugleich, Reibung wird je Kontakt aus beiden Seiten gemischt.
    for (const body of [this.base, ...this.pieces.map((p) => p.body)]) for (let f = body.getFixtureList(); f; f = f.getNext()) f.setFriction(on ? ICE_FRICTION : FRICTION);
    for (let c = this.world.getContactList(); c; c = c.getNext()) c.resetFriction();
  }

  /** Aktuellen Stein auf 70 % schrumpfen, sonst den nächsten. */
  shrink(): void {
    const p = this.current;
    if (!p || p.scale !== 1) {
      this.shrinkArmed = true;
      return;
    }
    this.rebuild(p, SHRINK);
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

  /** Fester Balken knapp unter der Turmspitze. Steine, die schon liegen, gehen durch ihn hindurch; neue landen darauf. */
  addBeam(): void {
    this.removeBeam();
    const settled = this.pieces.filter((p) => p !== this.current);
    const top = Math.max(0.6, this.height - 0.45);
    const near = settled.filter((p) => p.body.getPosition().y > this.height - 2.5);
    const cx = near.length > 0 ? near.reduce((s, p) => s + p.body.getPosition().x, 0) / near.length : 0;
    for (const p of settled) for (let f = p.body.getFixtureList(); f; f = f.getNext()) f.setFilterData({ groupIndex: 0, categoryBits: CAT_OLD, maskBits: 0xffff });
    const beam = this.world.createBody({ type: 'static', position: Vec2(Math.max(-3, Math.min(3, cx)), top - TOWER_BEAM_HALF.h) });
    beam.createFixture({ shape: Box(TOWER_BEAM_HALF.w, TOWER_BEAM_HALF.h), friction: FRICTION, filterCategoryBits: CAT_BEAM, filterMaskBits: CAT_PIECE });
    this.beam = beam;
  }

  removeBeam(): void {
    if (!this.beam) return;
    this.world.destroyBody(this.beam);
    this.beam = null;
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
    return this.boulderArmed ? TOWER_BOULDER : this.stream(this.nextIndex).form;
  }

  private tick(): void {
    if (!this.current && this.time >= this.spawnAt) this.spawn();
    const p = this.current;
    if (p) this.steer(p);
    this.landOn = undefined;
    this.world.step(STEP_S, 8, 3);
    if (this.current && this.landOn !== undefined) this.land(this.current, this.landOn);
    this.time += STEP_MS;
    this.cleanup();
    this.measure();
  }

  private steer(p: Piece): void {
    const pos = p.body.getPosition();
    let speed = this.fast ? FAST_SPEED : FALL_SPEED;
    if (this.fast && this.somethingBelow(p)) speed = Math.min(speed, FAST_LANDING_SPEED);
    if (this.turbo) speed *= 2;
    const vx = Math.max(-12, Math.min(12, (this.targetX - pos.x) * 14));
    const w = Math.max(-14, Math.min(14, (this.targetAngle - p.body.getAngle()) * 16));
    p.body.setLinearVelocity(Vec2(vx, -speed));
    p.body.setAngularVelocity(w);
  }

  /** Liegt direkt unter dem fallenden Stein etwas? */
  private somethingBelow(p: Piece): boolean {
    let lo = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let f = p.body.getFixtureList(); f; f = f.getNext()) {
      const aabb = f.getAABB(0);
      lo = Math.min(lo, aabb.lowerBound.y);
      minX = Math.min(minX, aabb.lowerBound.x);
      maxX = Math.max(maxX, aabb.upperBound.x);
    }
    let found = false;
    this.world.queryAABB({ lowerBound: Vec2(minX, lo - 1.4), upperBound: Vec2(maxX, lo) }, (f) => {
      if (f.getBody() === p.body) return true;
      found = true;
      return false;
    });
    return found;
  }

  private onContact(c: Contact): void {
    const cur = this.current;
    if (!cur) return;
    const a = c.getFixtureA().getBody();
    const b = c.getFixtureB().getBody();
    if (a === cur.body) this.landOn = b;
    else if (b === cur.body) this.landOn = a;
  }

  private spawn(): void {
    const index = this.nextIndex++;
    let { form, special } = this.stream(index);
    if (this.boulderArmed) {
      form = TOWER_BOULDER;
      special = false;
      this.boulderArmed = false;
    }
    const y = Math.max(this.height, 0) + SPAWN_GAP;
    const body = this.world.createBody({ type: 'dynamic', position: Vec2(0, y), gravityScale: 0, bullet: true });
    const piece: Piece = { id: this.nextId++, index, form, body, special, glued: false, scale: 1 };
    this.targetX = 0;
    this.targetAngle = 0;
    this.addFixtures(piece, 1);
    this.pieces.push(piece);
    this.current = piece;
    if (this.shrinkArmed) {
      this.shrinkArmed = false;
      this.rebuild(piece, SHRINK);
    }
  }

  private addFixtures(p: Piece, scale: number): void {
    const half = 0.5 * scale;
    for (const c of formCells(p.form)) {
      p.body.createFixture({
        shape: Box(half, half, Vec2(c.x * scale, c.y * scale), 0),
        density: DENSITY,
        friction: this.ice ? ICE_FRICTION : FRICTION,
        restitution: 0,
        filterCategoryBits: CAT_PIECE,
        filterMaskBits: 0xffff,
      });
    }
    p.scale = scale;
  }

  private rebuild(p: Piece, scale: number): void {
    const fixtures = [];
    for (let f = p.body.getFixtureList(); f; f = f.getNext()) fixtures.push(f);
    for (const f of fixtures) p.body.destroyFixture(f);
    this.addFixtures(p, scale);
  }

  private land(p: Piece, other: Body | null): void {
    this.current = null;
    p.body.setGravityScale(1);
    p.body.setBullet(false);
    const v = p.body.getLinearVelocity();
    p.body.setLinearVelocity(Vec2(v.x * 0.2, Math.max(v.y, -FALL_SPEED)));
    p.body.setAngularVelocity(p.body.getAngularVelocity() * 0.2);
    if (this.glueArmed && other) {
      this.glueArmed = false;
      p.glued = true;
      this.world.createJoint(new WeldJoint({ frequencyHz: 0, dampingRatio: 0 }, other, p.body, p.body.getWorldCenter()));
    }
    this.spawnAt = this.time + SPAWN_DELAY_MS;
    this.events.push({ type: 'land', index: p.index });
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
      this.world.destroyBody(p.body);
      if (p === this.current) {
        this.current = null;
        this.spawnAt = this.time + SPAWN_DELAY_MS;
      }
    }
    this.pieces = this.pieces.filter((p) => !lost.includes(p));
  }

  /** Turmhöhe, Ruhe, Marken und Ziel. */
  private measure(): void {
    let calm = true;
    for (const p of this.pieces) {
      if (p === this.current) continue;
      if (p.body.getLinearVelocity().length() > CALM_SPEED || Math.abs(p.body.getAngularVelocity()) > CALM_SPIN) calm = false;
    }
    this.height = this.cornerTop();
    this.calm = calm;

    for (const m of this.marks) {
      if (this.height >= m && !this.reached.has(m)) {
        this.reached.add(m);
        this.events.push({ type: 'mark', height: this.height });
      }
    }
    if (this.height >= this.goalHeight && calm) this.holdMs += STEP_MS;
    else this.holdMs = Math.max(0, this.holdMs - STEP_MS * 3);
    if (this.holdMs >= TOWER_HOLD_MS) {
      // Meldung ans Ziel. Bleibt das Rennen offen (Meldung ging verloren oder kam zu früh), folgt nach 1,5 s die nächste.
      this.finished = true;
      this.events.push({ type: 'finish', height: this.height });
      this.holdMs = TOWER_HOLD_MS - 1500;
    }
  }

  /** Höchste Ecke eines liegenden Steins (echte Ecken, nicht die AABB, die bei Drehung zu hoch liegt). */
  private cornerTop(): number {
    let top = 0;
    for (const p of this.pieces) {
      if (p === this.current) continue;
      const half = 0.5 * p.scale;
      for (const c of formCells(p.form)) {
        for (const [dx, dy] of [[-half, half], [half, half], [-half, -half], [half, -half]] as const) {
          const w = p.body.getWorldPoint(Vec2(c.x * p.scale + dx, c.y * p.scale + dy));
          if (w.y > top && w.y < 200) top = w.y;
        }
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
      if (p.scale !== 1) flags |= STONE_SHRUNK;
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
    return (this.ice ? FX_ICE : 0) | (this.turbo ? FX_TURBO : 0) | (this.beam ? FX_BEAM : 0) | (this.glueArmed ? FX_GLUE : 0) | (this.boulderArmed ? FX_BOULDER : 0);
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
