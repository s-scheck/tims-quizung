import {
  formCells,
  FX_BEAM,
  FX_BOULDER,
  FX_FOG,
  FX_GLUE,
  FX_ICE,
  FX_SHIELD,
  FX_TURBO,
  STONE_FALLING,
  STONE_GIANT,
  STONE_GLUED,
  STONE_ICY,
  STONE_PETRIFIED,
  STONE_SHRUNK,
  STONE_SPECIAL,
  TOWER_BEAM,
  TOWER_BEAM_HALF,
  TOWER_ROUND,
  TOWER_ROUND_RADIUS,
  type TowerStone,
} from '@quiz/shared';
import { Backdrop, leafSprite, softDot } from './towerArt.ts';

/**
 * Hochstapler: Saft und Partikel. Ereignisse (Landung, Herunterfallen, Wegzaubern, neue Flags und Effekte)
 * erkennt der Renderer selbst durch Vergleich der Steine zwischen zwei Bildern. Das klappt am Handy mit der
 * eigenen Physik genauso wie am Fernseher, der nur Schnappschüsse bekommt.
 */

/** Riesenstein: so groß wird gezeichnet (die Physik nutzt denselben Wert). */
export const GIANT_SCALE = 1.5;
export const SHRINK_SCALE = 0.7;

export function stoneScale(flags: number): number {
  return flags & STONE_SHRUNK ? SHRINK_SCALE : flags & STONE_GIANT ? GIANT_SCALE : 1;
}

/** Bildsprache der Magie: hell warm-golden, dunkel violett bis tiefblau. */
export const LIGHT_MAGIC = ['#ffe7a6', '#ffd166', '#fff4d6', '#ffc24d'] as const;
export const DARK_MAGIC = ['#b38cff', '#7f5cff', '#5f7dff', '#d0b8ff'] as const;
const VINE_MAGIC = ['#b9e07a', '#ffe7a6', '#7cc46a'] as const;
const DUST = '#f4ebdf';
const DUST_DARK = '#cbb89f';
const CONFETTI = ['#ffd166', '#fff4d6', '#ff8fa3', '#7cc6ff', '#9be7b0', '#c9a7ff'];

const Kind = { Dust: 0, Spark: 1, Magic: 2, Crumb: 3, Confetti: 4, Mote: 5, Leaf: 6, Ring: 7 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

interface Particle {
  k: Kind;
  /** Welt-Einheiten, außer Confetti/Mote/Leaf: CSS-Pixel. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

interface Track {
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  /** Größte Fallgeschwindigkeit der letzten Momente, für die Aufprallstärke. */
  vmax: number;
  flags: number;
  form: number;
  t: number;
  /** Letzte Lagen für die Bewegungsspur. */
  trail: { x: number; y: number; a: number }[];
  trailAt: number;
}

/** Stein, der nach dem Verschwinden noch kurz weiterlebt (Fallspur nach unten oder magisches Auflösen). */
export interface Ghost {
  st: TowerStone;
  vx: number;
  vy: number;
  va: number;
  age: number;
  life: number;
  mode: 'fall' | 'vanish';
}

const MAX_PARTICLES = 240;

/** Zustand einer Zeichenfläche über die Bilder hinweg. */
export class FxState {
  tracks = new Map<number, Track>();
  particles: Particle[] = [];
  ghosts: Ghost[] = [];
  primed = false;
  fxPrev = 0;
  gustAt = -1;
  won = false;
  reached = new Set<number>();
  markFlash = new Map<number, number>();
  shrinkAt = new Map<number, number>();
  shieldAt = -1e9;
  shake = { amp: 0, at: 0, dx: 0, dy: 1 };
  /** Weich überblendete Stärken. */
  fogA = 0;
  iceA = 0;
  shieldA = 0;
  holdA = 0;
  goalA = 0;
  backdrop: Backdrop | null = null;
  /** Kamera-Federn */
  vy = 0;
  zoom = 1;
  vz = 0;
  /** Für die Partikel-Erzeugung im Zeittakt. */
  emitAcc = 0;

  add(p: Omit<Particle, 'age' | 'rot' | 'vr'> & { rot?: number; vr?: number }): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES + 1);
    this.particles.push({ age: 0, rot: 0, vr: 0, ...p });
  }
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

// ------------------------------------------------------------- Geometrie

export interface CellBox {
  x: number;
  y: number;
  /** Halbe Ausdehnung (achsparallel). */
  ex: number;
  ey: number;
}

/** Achsparallele Kästchen der Zellen eines Steins in Weltkoordinaten. */
export function stoneBoxes(st: TowerStone, out: CellBox[] = []): CellBox[] {
  if (st.form === TOWER_BEAM) {
    out.push({ x: st.x, y: st.y, ex: TOWER_BEAM_HALF.w, ey: TOWER_BEAM_HALF.h });
    return out;
  }
  const sc = stoneScale(st.flags);
  if (st.form === TOWER_ROUND) {
    const r = TOWER_ROUND_RADIUS * sc;
    out.push({ x: st.x, y: st.y, ex: r, ey: r });
    return out;
  }
  const ca = Math.cos(st.a);
  const sa = Math.sin(st.a);
  const e = 0.5 * sc * (Math.abs(ca) + Math.abs(sa));
  for (const c of formCells(st.form)) out.push({ x: st.x + sc * (c.x * ca - c.y * sa), y: st.y + sc * (c.x * sa + c.y * ca), ex: e, ey: e });
  return out;
}

// --------------------------------------------------------------- Auslöser

function burst(st: FxState, x: number, y: number, n: number, colors: readonly string[], spread: number, up = 1.2): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(0.1, spread);
    st.add({ k: Kind.Magic, x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5, vx: Math.cos(a) * rand(0.6, 2.2), vy: Math.sin(a) * rand(0.6, 2.2) + up, life: rand(600, 1200), size: rand(0.12, 0.26), color: pick(colors), vr: rand(-6, 6) });
  }
}

function dust(st: FxState, boxes: CellBox[], strength: number): void {
  let minY = Infinity;
  for (const b of boxes) minY = Math.min(minY, b.y - b.ey);
  const low = boxes.filter((b) => b.y - b.ey < minY + 0.2);
  const n = Math.round(3 + strength * 10);
  for (let i = 0; i < n; i++) {
    const b = pick(low);
    const side = Math.random() < 0.5 ? -1 : 1;
    st.add({ k: Kind.Dust, x: b.x + side * b.ex * rand(0.4, 1.05), y: minY + 0.08, vx: side * rand(0.6, 2) * (0.6 + strength), vy: rand(0.2, 0.8), life: rand(550, 950), size: rand(0.24, 0.42) * (0.8 + strength * 0.7), color: i % 3 ? DUST : DUST_DARK });
  }
}

function crumbs(st: FxState, x: number, y: number, n: number, color: string): void {
  for (let i = 0; i < n; i++) st.add({ k: Kind.Crumb, x: x + rand(-0.4, 0.4), y: y + rand(-0.3, 0.3), vx: rand(-2, 2), vy: rand(0, 3), life: rand(500, 900), size: rand(0.05, 0.11), color, vr: rand(-10, 10) });
}

export function shakeCamera(st: FxState, time: number, amp: number, dx = 0, dy = 1): void {
  if (amp < st.shake.amp * Math.exp(-(time - st.shake.at) / 120)) return;
  st.shake = { amp, at: time, dx, dy };
}

/** Kamerawackeln in CSS-Pixeln. */
export function shakeOffset(st: FxState, time: number): [number, number] {
  const t = time - st.shake.at;
  if (t > 500 || st.shake.amp <= 0) return [0, 0];
  const k = st.shake.amp * Math.exp(-t / 110) * Math.cos(t * 0.06);
  const j = st.shake.amp * 0.35 * Math.exp(-t / 90) * Math.sin(t * 0.083);
  return [k * st.shake.dx + j * (1 - Math.abs(st.shake.dx)), k * st.shake.dy];
}

export interface Observe {
  stones: TowerStone[];
  fx: number;
  reached: number[];
  gust: { at: number; dir: number } | null | undefined;
  won: boolean;
  height: number;
  color: string;
  time: number;
  /** Maßstab für Pixelangaben. */
  s: number;
  /** Bildbreite in CSS-Pixeln. */
  w: number;
  h: number;
}

/** Vergleicht mit dem letzten Bild und löst Partikel und Kamerawackeln aus. */
export function observe(st: FxState, o: Observe): void {
  const { time } = o;
  const seen = new Set<number>();
  // Sieht die Fläche einen ganzen Turm auf einmal (Fernseher verbindet sich neu), ist das kein Aufsetzen.
  const resync = st.tracks.size === 0 && o.stones.length > 2;
  for (const s of o.stones) {
    seen.add(s.id);
    const p = st.tracks.get(s.id);
    if (!p) {
      st.tracks.set(s.id, { x: s.x, y: s.y, a: s.a, vx: 0, vy: 0, vmax: 0, flags: s.flags, form: s.form, t: time, trail: [], trailAt: time });
      if (!st.primed || resync) continue;
      if (s.form === TOWER_BEAM) burst(st, s.x, s.y, 22, LIGHT_MAGIC, 3.2, 0.4);
      else if (s.flags & STONE_GIANT) burst(st, s.x, s.y, 16, DARK_MAGIC, 1.6);
      else if (s.form === TOWER_ROUND) burst(st, s.x, s.y, 14, DARK_MAGIC, 1.2);
      else if (s.flags & STONE_SPECIAL) burst(st, s.x, s.y, 8, LIGHT_MAGIC, 0.9, 0.4);
      else if (!(s.flags & STONE_FALLING)) dust(st, stoneBoxes(s), 0.2);
      continue;
    }
    const dts = Math.max(0.001, (time - p.t) / 1000);
    if (time > p.t) {
      p.vx = (s.x - p.x) / dts;
      p.vy = (s.y - p.y) / dts;
      p.vmax = Math.max(p.vmax * Math.exp(-dts / 0.26), -p.vy);
    }
    const added = s.flags & ~p.flags;
    if (p.flags & STONE_FALLING && !(s.flags & STONE_FALLING)) {
      // Landung: Staub, bei harten Landungen Kamerawackeln, beim Spezialstein Funken.
      const strength = Math.min(1, Math.max(0.12, (p.vmax - 1.2) / 5.5));
      const boxes = stoneBoxes(s);
      dust(st, boxes, strength * (s.flags & STONE_GIANT ? 1.6 : 1));
      if (strength > 0.38 || s.flags & STONE_GIANT) shakeCamera(st, time, 4.5 * o.s * Math.min(1, strength + (s.flags & STONE_GIANT ? 0.4 : 0)));
      if (s.flags & STONE_SPECIAL) {
        for (let i = 0; i < 16; i++) {
          const a = rand(0, Math.PI);
          st.add({ k: Kind.Spark, x: s.x, y: s.y, vx: Math.cos(a) * rand(1.5, 4), vy: Math.sin(a) * rand(1.5, 4.5), life: rand(450, 850), size: rand(0.1, 0.2), color: pick(LIGHT_MAGIC) });
        }
      }
    }
    if (added & STONE_SHRUNK) {
      st.shrinkAt.set(s.id, time);
      burst(st, s.x, s.y, 12, LIGHT_MAGIC, 0.8, 0.3);
    }
    if (added & STONE_GLUED) burst(st, s.x, s.y, 7, VINE_MAGIC, 0.8, 0.6);
    if (added & STONE_PETRIFIED) {
      burst(st, s.x, s.y, 5, LIGHT_MAGIC, 0.7, 0.4);
      crumbs(st, s.x, s.y, 3, '#8d8780');
    }
    if (added & STONE_ICY && Math.random() < 0.5) burst(st, s.x, s.y, 3, ['#dff4ff', '#b38cff'], 0.6, 0.2);
    // Bewegungsspur für taumelnde Steine
    const speed = Math.hypot(p.vx, p.vy);
    if (!(s.flags & STONE_FALLING) && speed > 3) {
      if (time - p.trailAt > 40) {
        p.trail.unshift({ x: p.x, y: p.y, a: p.a });
        if (p.trail.length > 3) p.trail.pop();
        p.trailAt = time;
      }
      if (Math.random() < 0.08) crumbs(st, s.x, s.y, 1, '#c9c0b4');
    } else if (p.trail.length && time - p.trailAt > 60) {
      p.trail.pop();
      p.trailAt = time;
    }
    p.x = s.x;
    p.y = s.y;
    p.a = s.a;
    p.flags = s.flags;
    p.form = s.form;
    p.t = time;
  }
  for (const [id, p] of st.tracks) {
    if (seen.has(id)) continue;
    st.tracks.delete(id);
    if (!st.primed) continue;
    const ghostStone: TowerStone = { id, form: p.form, x: p.x, y: p.y, a: p.a, flags: p.flags & ~STONE_FALLING };
    if (p.form === TOWER_BEAM) {
      // Balken läuft ab: löst sich golden auf.
      burst(st, p.x, p.y, 18, LIGHT_MAGIC, 3, 0.3);
      st.ghosts.push({ st: ghostStone, vx: 0, vy: 0, va: 0, age: 0, life: 450, mode: 'vanish' });
      continue;
    }
    const fell = p.y < -3 || Math.abs(p.x) > 10.5 || p.vy < -2.2 || Math.abs(p.vx) > 3;
    if (fell) {
      st.ghosts.push({ st: ghostStone, vx: p.vx, vy: Math.min(p.vy, -1), va: (Math.random() - 0.5) * 4, age: 0, life: 900, mode: 'fall' });
    } else {
      // Wegzaubern: Stein verschwindet ohne Fall, mit goldenem Puff.
      st.ghosts.push({ st: ghostStone, vx: 0, vy: 0, va: 0, age: 0, life: 520, mode: 'vanish' });
      burst(st, p.x, p.y, 26, LIGHT_MAGIC, 1.4, 0.8);
      for (let i = 0; i < 6; i++) st.add({ k: Kind.Dust, x: p.x + rand(-0.6, 0.6), y: p.y + rand(-0.5, 0.5), vx: rand(-0.8, 0.8), vy: rand(0.2, 1), life: rand(500, 800), size: rand(0.35, 0.6), color: '#fff1cc' });
      st.add({ k: Kind.Ring, x: p.x, y: p.y, vx: 0, vy: 0, life: 520, size: 1.6, color: '#ffe7a6' });
    }
  }

  // Effekte des ganzen Turms: neu gesetzte Bits zeigen, ob helle oder dunkle Magie wirkt.
  const fxAdded = o.fx & ~st.fxPrev;
  if (st.primed && fxAdded) {
    const top = Math.max(1, o.height);
    if (fxAdded & FX_SHIELD) {
      st.shieldAt = time;
      burst(st, 0, top * 0.6, 26, LIGHT_MAGIC, 3, 0.6);
    }
    if (fxAdded & (FX_GLUE | FX_BEAM)) burst(st, 0, top, 10, LIGHT_MAGIC, 1.5);
    if (fxAdded & (FX_ICE | FX_TURBO | FX_FOG | FX_BOULDER)) burst(st, 0, top + 1, 22, DARK_MAGIC, 2.4, 0.2);
  }
  st.fxPrev = o.fx;

  // Windstoß: Blätter und dunkle Schlieren
  // Am Fernseher wird der Zeitpunkt jedes Bild neu aus der Serverzeit berechnet und zittert leicht.
  if (o.gust && Math.abs(o.gust.at - st.gustAt) > 400) {
    st.gustAt = o.gust.at;
    if (st.primed && time - o.gust.at < 1200) {
      const dir = o.gust.dir;
      for (let i = 0; i < 14; i++) {
        st.add({ k: Kind.Leaf, x: dir > 0 ? rand(-60, -10) : o.w + rand(10, 60), y: rand(o.h * 0.15, o.h * 0.85), vx: dir * rand(260, 460) * o.s, vy: rand(-40, 40), life: rand(1300, 1900), size: rand(9, 14) * o.s, color: pick(['#d98b2b', '#b5651d', '#8aa04a', '#c9a227']), rot: rand(0, 6), vr: rand(-8, 8) });
      }
      burst(st, 0, Math.max(1, o.height * 0.6), 12, DARK_MAGIC, 3, 0);
      shakeCamera(st, time, 5 * o.s, dir, 0);
    }
  }

  // Erreichte Höhenmarken blitzen kurz auf.
  for (const m of o.reached) {
    if (st.reached.has(m)) continue;
    st.reached.add(m);
    if (st.primed) {
      st.markFlash.set(m, time);
      for (let i = 0; i < 10; i++) st.add({ k: Kind.Spark, x: rand(-6, 6), y: m, vx: rand(-0.5, 0.5), vy: rand(0.5, 1.5), life: rand(500, 900), size: rand(0.08, 0.16), color: pick(LIGHT_MAGIC) });
    }
  }

  // Sieg: Konfetti einmal, danach sanfter Lichtregen.
  if (o.won && !st.won) {
    for (let i = 0; i < 70; i++) {
      st.add({ k: Kind.Confetti, x: rand(0, o.w), y: rand(-o.h * 0.3, 0), vx: rand(-30, 30), vy: rand(60, 180), life: rand(2200, 3600), size: rand(5, 9) * o.s, color: pick(CONFETTI), rot: rand(0, 6), vr: rand(-6, 6) });
    }
  }
  st.won = o.won;
  st.primed = true;
}

/** Laufende Erzeugung (Lichtregen beim Sieg, Funkeln an Spezialsteinen). */
export function emit(st: FxState, o: { won: boolean; w: number; h: number; s: number; dt: number; specials: TowerStone[] }): void {
  st.emitAcc += o.dt;
  if (st.emitAcc < 50) return;
  const steps = Math.min(4, Math.floor(st.emitAcc / 50));
  st.emitAcc -= steps * 50;
  for (let k = 0; k < steps; k++) {
    if (o.won) st.add({ k: Kind.Mote, x: rand(0, o.w), y: rand(-10, o.h * 0.4), vx: rand(-6, 6), vy: rand(14, 34), life: rand(1800, 3000), size: rand(2, 4.5) * o.s, color: pick(LIGHT_MAGIC) });
    for (const s of o.specials) {
      if (Math.random() > 0.18) continue;
      const b = stoneBoxes(s);
      const c = pick(b);
      st.add({ k: Kind.Spark, x: c.x + rand(-0.5, 0.5), y: c.y + rand(-0.5, 0.5), vx: 0, vy: rand(0.2, 0.6), life: rand(400, 700), size: rand(0.08, 0.15), color: pick(LIGHT_MAGIC) });
    }
  }
}

/** Bewegt alle Partikel und Geister. */
export function step(st: FxState, dt: number, wind: number): void {
  const t = dt / 1000;
  let w = 0;
  for (const p of st.particles) {
    p.age += dt;
    if (p.age >= p.life) continue;
    switch (p.k) {
      case Kind.Dust:
        p.vx *= Math.exp(-t * 3);
        p.vy *= Math.exp(-t * 2);
        p.size *= 1 + t * 0.9;
        break;
      case Kind.Spark:
        p.vy -= 3 * t;
        p.vx *= Math.exp(-t * 2);
        break;
      case Kind.Magic:
        p.vx *= Math.exp(-t * 2.4);
        p.vy = p.vy * Math.exp(-t * 2.4) + 0.9 * t;
        break;
      case Kind.Crumb:
        p.vy -= 20 * t;
        break;
      case Kind.Confetti:
        p.vy = Math.min(p.vy + 60 * t, 140);
        p.vx += Math.sin(p.age / 260 + p.rot) * 30 * t;
        break;
      case Kind.Mote:
        p.vx += Math.sin(p.age / 400) * 4 * t;
        break;
      case Kind.Leaf:
        p.vy += Math.sin(p.age / 180) * 160 * t + 30 * t;
        p.vx += wind * 40 * t;
        break;
    }
    p.x += p.vx * t;
    p.y += p.vy * t;
    p.rot += p.vr * t;
    st.particles[w++] = p;
  }
  st.particles.length = w;
  let g = 0;
  for (const gh of st.ghosts) {
    gh.age += dt;
    if (gh.age >= gh.life) continue;
    if (gh.mode === 'fall') {
      gh.vy -= 22 * t;
      gh.st = { ...gh.st, x: gh.st.x + gh.vx * t, y: gh.st.y + gh.vy * t, a: gh.st.a + gh.va * t };
    }
    st.ghosts[g++] = gh;
  }
  st.ghosts.length = g;
}

export interface View {
  /** Gerätepixel */
  W: number;
  H: number;
  /** Gerätepixel je Einheit */
  ppd: number;
  dpr: number;
  camY: number;
  /** Wackeln in Gerätepixeln */
  sx: number;
  sy: number;
}

/** Zeichnet Partikel in der Welt (`world`) oder vor allem anderen (`screen`). */
export function drawParticles(ctx: CanvasRenderingContext2D, st: FxState, v: View, layer: 'world' | 'screen'): void {
  const wx = (x: number) => v.W / 2 + x * v.ppd + v.sx;
  const wy = (y: number) => v.H - (y - v.camY) * v.ppd + v.sy;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const p of st.particles) {
    const f = p.age / p.life;
    if (layer === 'world') {
      if (p.k === Kind.Dust) {
        const r = p.size * v.ppd;
        ctx.globalAlpha = 0.8 * (1 - f) * Math.min(1, p.age / 50);
        ctx.drawImage(softDot(p.color), wx(p.x) - r, wy(p.y) - r, r * 2, r * 2);
      } else if (p.k === Kind.Crumb) {
        const r = p.size * v.ppd;
        ctx.globalAlpha = 1 - f * f;
        ctx.fillStyle = p.color;
        ctx.setTransform(Math.cos(p.rot), Math.sin(p.rot), -Math.sin(p.rot), Math.cos(p.rot), wx(p.x), wy(p.y));
        ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else if (p.k === Kind.Ring) {
        const r = p.size * v.ppd * (0.3 + 0.9 * Math.sqrt(f));
        ctx.globalAlpha = 0.7 * (1 - f);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.5 * v.dpr * (1 - f);
        ctx.beginPath();
        ctx.arc(wx(p.x), wy(p.y), r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (p.k === Kind.Confetti) {
      const c = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const flip = Math.cos(p.age / 120 + p.rot * 3);
      ctx.globalAlpha = Math.min(1, (1 - f) * 3);
      ctx.fillStyle = p.color;
      ctx.setTransform(c * v.dpr, sn * v.dpr, -sn * flip * v.dpr, c * flip * v.dpr, p.x * v.dpr, p.y * v.dpr);
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else if (p.k === Kind.Leaf) {
      const img = leafSprite(p.color);
      const c = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const k = (p.size * v.dpr) / img.width;
      ctx.globalAlpha = Math.min(1, (1 - f) * 4, p.age / 100);
      ctx.setTransform(c * k, sn * k, -sn * k * Math.cos(p.age / 150), c * k * Math.cos(p.age / 150), p.x * v.dpr, p.y * v.dpr);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  // Leuchtende Teile additiv
  ctx.globalCompositeOperation = 'lighter';
  for (const p of st.particles) {
    const f = p.age / p.life;
    if (layer === 'world' && (p.k === Kind.Spark || p.k === Kind.Magic)) {
      const r = p.size * v.ppd * (p.k === Kind.Magic ? 1 - f * 0.5 : 1);
      ctx.globalAlpha = (1 - f) * Math.min(1, p.age / 80) * (p.k === Kind.Magic ? 0.85 + 0.15 * Math.sin(p.age / 40 + p.rot) : 1);
      const x = wx(p.x);
      const y = wy(p.y);
      ctx.drawImage(softDot(p.color), x - r, y - r, r * 2, r * 2);
      // Kleines Kreuz für Glitzer
      ctx.fillStyle = '#ffffff';
      const l = r * 0.9;
      const th = Math.max(1, r * 0.12);
      ctx.fillRect(x - l, y - th / 2, l * 2, th);
      ctx.fillRect(x - th / 2, y - l, th, l * 2);
    } else if (layer === 'screen' && p.k === Kind.Mote) {
      const r = p.size * v.dpr * 2;
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.8;
      ctx.drawImage(softDot(p.color), p.x * v.dpr - r, p.y * v.dpr - r, r * 2, r * 2);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
