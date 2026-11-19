import { formCells, seededRandom, TOWER_BASE_HALF, TOWER_BEAM_HALF, type CellPoint } from '@quiz/shared';

/**
 * Hochstapler: vorgerenderte Bildteile. Alles, was teuer ist (Verläufe, weiche Schatten, Fasen, Landschaft),
 * entsteht hier einmal in Offscreen-Canvas und wird beim Zeichnen nur noch kopiert. Steine gibt es je Form,
 * Viertelumdrehung, Farbe, Pixelgröße und Variante; die Restdrehung macht `drawImage`.
 */

// ------------------------------------------------------------------ Farben

export type Rgb = readonly [number, number, number];

/** Tiefe Tinte statt Schwarz, damit Schatten farbig bleiben. */
const INK: Rgb = [18, 24, 46];
const WHITE: Rgb = [255, 255, 255];

export function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Heller (amt > 0, Richtung Weiß) oder dunkler (amt < 0, Richtung Tinte). */
export function lift(c: Rgb, amt: number): Rgb {
  return amt >= 0 ? mix(c, WHITE, Math.min(1, amt)) : mix(c, INK, Math.min(1, -amt));
}

export function css(c: Rgb, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

// ------------------------------------------------------------------ Werkzeug

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D fehlt');
  return g;
}

/** Pixel je Einheit in Vierteloktaven, damit Zoomen nicht ständig neu backt. Aufgerundet: Verkleinern bleibt scharf. */
export function bucketPx(v: number): number {
  return Math.pow(2, Math.ceil(Math.log2(Math.max(6, v)) * 4) / 4);
}

/** Begrenzter Zwischenspeicher, älteste Einträge fliegen zuerst. */
class SpriteCache<T> {
  private map = new Map<string, T>();
  constructor(private limit: number) {}
  get(key: string, make: () => T): T {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const v = make();
    this.map.set(key, v);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value as string);
    return v;
  }
}

export interface Sprite {
  img: HTMLCanvasElement;
  /** Ankerpunkt (Steinmitte bzw. Weltursprung) im Bild. */
  ox: number;
  oy: number;
  /** Pixel je Einheit, mit denen gebacken wurde. */
  px: number;
}

/**
 * Weicher Schatten einer Fläche ohne die Fläche selbst: Die Form liegt weit links außerhalb, der Schatten wird
 * zurückversetzt. Nur beim Backen, nie pro Bild.
 */
function castShadow(g: CanvasRenderingContext2D, path: Path2D, px: number, blur: number, offX: number, offY: number, color: string): void {
  const far = g.canvas.width + g.canvas.height + 200;
  g.save();
  g.shadowColor = color;
  g.shadowBlur = blur * px;
  g.shadowOffsetX = far + offX * px;
  g.shadowOffsetY = offY * px;
  g.translate(-far / px, 0);
  g.fillStyle = '#000';
  g.fill(path);
  g.restore();
}

// --------------------------------------------------------------- Geometrie

type Pt = [number, number];
const HALF_PI = Math.PI / 2;

/** Licht von links oben, in Weltrichtung. */
const LIGHT: Pt = (() => {
  const x = -0.42;
  const y = 1;
  const l = Math.hypot(x, y);
  return [x / l, y / l];
})();

function rot90(p: Pt, q: number): Pt {
  let [x, y] = p;
  for (let i = 0; i < ((q % 4) + 4) % 4; i++) [x, y] = [-y, x];
  return [x, y];
}

/** Zellen einer Form, um `q` Viertel gegen den Uhrzeigersinn gedreht. */
export function rotatedCells(form: number, q: number): CellPoint[] {
  return formCells(form).map((c) => {
    const [x, y] = rot90([c.x, c.y], q);
    return { x, y };
  });
}

interface Loop {
  pts: Pt[];
  /** Außennormale der Kante von pts[i] nach pts[i+1]. */
  normals: Pt[];
}

/** Umriss als geschlossener Linienzug, gerade Strecken zusammengefasst. */
function loopOf(cells: CellPoint[]): Loop {
  const key = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const edges: { a: Pt; b: Pt; n: Pt }[] = [];
  for (const c of cells) {
    const l = c.x - 0.5;
    const r = c.x + 0.5;
    const b = c.y - 0.5;
    const t = c.y + 0.5;
    if (!set.has(key(c.x, c.y + 1))) edges.push({ a: [l, t], b: [r, t], n: [0, 1] });
    if (!set.has(key(c.x, c.y - 1))) edges.push({ a: [r, b], b: [l, b], n: [0, -1] });
    if (!set.has(key(c.x - 1, c.y))) edges.push({ a: [l, b], b: [l, t], n: [-1, 0] });
    if (!set.has(key(c.x + 1, c.y))) edges.push({ a: [r, t], b: [r, b], n: [1, 0] });
  }
  const byStart = new Map(edges.map((e) => [key(e.a[0], e.a[1]), e]));
  const pts: Pt[] = [];
  const normals: Pt[] = [];
  const first = edges[0];
  if (!first) return { pts, normals };
  let e = first;
  for (let guard = 0; guard < edges.length; guard++) {
    const prev = normals[normals.length - 1];
    if (!prev || prev[0] !== e.n[0] || prev[1] !== e.n[1]) {
      pts.push(e.a);
      normals.push(e.n);
    }
    const next = byStart.get(key(e.b[0], e.b[1]));
    if (!next || next === first) break;
    e = next;
  }
  const n0 = normals[0];
  const nl = normals[normals.length - 1];
  if (n0 && nl && normals.length > 1 && n0[0] === nl[0] && n0[1] === nl[1]) {
    pts.shift();
    normals.shift();
  }
  return { pts, normals };
}

/** Linienzug nach innen versetzt (rechtwinklige Formen: Ecke minus Summe der Normalen). */
function insetLoop(loop: Loop, d: number): Pt[] {
  const n = loop.pts.length;
  return loop.pts.map((p, i) => {
    const a = loop.normals[(i - 1 + n) % n]!;
    const b = loop.normals[i]!;
    return [p[0] - d * (a[0] + b[0]), p[1] - d * (a[1] + b[1])];
  });
}

function roundedPath(pts: Pt[], r: number): Path2D {
  const p = new Path2D();
  const n = pts.length;
  const mid = (i: number): Pt => {
    const a = pts[i % n]!;
    const b = pts[(i + 1) % n]!;
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m = mid(n - 1);
  p.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) {
    const c = pts[i]!;
    const nm = mid(i);
    p.arcTo(c[0], c[1], nm[0], nm[1], r);
  }
  p.closePath();
  return p;
}

function polyPath(pts: Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach((q, i) => (i === 0 ? p.moveTo(q[0], q[1]) : p.lineTo(q[0], q[1])));
  p.closePath();
  return p;
}

const outlineCache = new Map<number, Path2D>();
/** Umriss einer Form in Steinkoordinaten (ungedreht), für Landepunkt und Nebel-Silhouette. */
export function formOutlinePath(form: number): Path2D {
  let p = outlineCache.get(form);
  if (!p) {
    p = roundedPath(loopOf(formCells(form)).pts, 0.09);
    outlineCache.set(form, p);
  }
  return p;
}

// ------------------------------------------------------------------ Steine

export const V_SPECIAL = 1;
export const V_ICY = 2;
export const V_GLUED = 4;
export const V_STONE = 8;

const stones = new SpriteCache<Sprite>(360);

/** Stein als Bild: Form `form` um `q` Viertel gedreht, Licht von oben links, mit Fase, Glasur und Schatten. */
export function stoneSprite(form: number, q: number, color: string, px: number, variant: number): Sprite {
  return stones.get(`${form}|${q}|${color}|${px}|${variant}`, () => bakeStone(form, q, color, px, variant));
}

const glows = new SpriteCache<Sprite>(48);
/** Weicher Lichthof um eine Form (Spezialstein, Kleber), ohne die Form selbst. */
export function glowSprite(form: number, q: number, color: string, px: number): Sprite {
  return glows.get(`${form}|${q}|${color}|${px}`, () => {
    const cells = rotatedCells(form, q);
    const pad = 0.75;
    const { minX, maxX, minY, maxY } = cellBounds(cells);
    const img = makeCanvas((maxX - minX + 2 * pad) * px, (maxY - minY + 2 * pad) * px);
    const g = ctx2d(img);
    const ox = (pad - minX) * px;
    const oy = (pad + maxY) * px;
    g.setTransform(px, 0, 0, -px, ox, oy);
    const path = roundedPath(loopOf(cells).pts, 0.1);
    castShadow(g, path, px, 0.55, 0, 0, color);
    castShadow(g, path, px, 0.22, 0, 0, color);
    return { img, ox, oy, px };
  });
}

function cellBounds(cells: CellPoint[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x - 0.5);
    maxX = Math.max(maxX, c.x + 0.5);
    minY = Math.min(minY, c.y - 0.5);
    maxY = Math.max(maxY, c.y + 0.5);
  }
  return { minX, maxX, minY, maxY };
}

const GOLD: Rgb = [232, 178, 52];
const GRANITE: Rgb = [132, 128, 124];
const LEAF: Rgb = [74, 140, 62];

/** Granitkorn und ein paar Haarrisse, für versteinerte Steine. */
function granite(g: CanvasRenderingContext2D, cells: CellPoint[], rnd: () => number): void {
  for (const c of cells) {
    for (let i = 0; i < 70; i++) {
      const s = 0.015 + rnd() * 0.035;
      const r = rnd();
      g.fillStyle = r < 0.4 ? 'rgba(255,255,255,0.16)' : r < 0.85 ? 'rgba(20,20,26,0.18)' : 'rgba(196,150,130,0.25)';
      g.fillRect(c.x - 0.48 + rnd() * 0.96, c.y - 0.48 + rnd() * 0.96, s, s * (0.6 + rnd() * 0.8));
    }
    if (rnd() < 0.55) {
      let x = c.x - 0.4 + rnd() * 0.3;
      let y = c.y - 0.3 + rnd() * 0.6;
      g.strokeStyle = 'rgba(30,28,30,0.4)';
      g.lineWidth = 0.014;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += 0.12 + rnd() * 0.08;
        y += (rnd() - 0.5) * 0.18;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
}

/** Ranken: eine Ranke folgt einem Teil der Kontur, eine zweite quert die Fläche, dazu Blätter und Locken. */
function vines(g: CanvasRenderingContext2D, ring: Pt[], cells: CellPoint[], rnd: () => number): void {
  // Punkte entlang der Kontur
  const pts: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 0.08));
    for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const total = pts.length;
  const startAt = Math.floor(rnd() * total);
  const run = Math.floor(total * (0.55 + rnd() * 0.25));
  const path: Pt[] = [];
  for (let k = 0; k < run; k++) {
    const p = pts[(startAt + k) % total]!;
    const w = Math.sin(k * 0.9 + startAt) * 0.035;
    path.push([p[0] + w, p[1] - w * 0.6]);
  }
  // Quer über die Fläche, von einer Zelle zur anderen
  const a = cells[0]!;
  const b = cells[cells.length - 1]!;
  const cross: Pt[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const x = a.x + (b.x - a.x) * t + Math.sin(t * 9) * 0.12;
    const y = a.y + (b.y - a.y) * t + Math.cos(t * 7) * 0.12;
    cross.push([x, y]);
  }
  const stroke = (line: Pt[], wid: number, col: string) => {
    g.strokeStyle = col;
    g.lineWidth = wid;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    line.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
    g.stroke();
  };
  for (const line of [path, cross]) {
    stroke(line, 0.11, 'rgba(18,40,20,0.35)');
    stroke(line, 0.075, css(lift(LEAF, -0.25)));
    stroke(line, 0.025, css(lift(LEAF, 0.4), 0.85));
  }
  const leaf = (x: number, y: number, ang: number, size: number) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    const lg = g.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
    lg.addColorStop(0, css(lift(LEAF, 0.35)));
    lg.addColorStop(1, css(lift(LEAF, -0.2)));
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(size * 0.5, size * 0.42, size, 0);
    g.quadraticCurveTo(size * 0.5, -size * 0.42, 0, 0);
    g.fill();
    g.strokeStyle = css(lift(LEAF, -0.45), 0.6);
    g.lineWidth = 0.012;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(size * 0.9, 0);
    g.stroke();
    g.restore();
  };
  for (const line of [path, cross]) {
    for (let k = 2; k < line.length - 1; k += 3 + Math.floor(rnd() * 3)) {
      const p = line[k]!;
      const q = line[k + 1]!;
      const dir = Math.atan2(q[1] - p[1], q[0] - p[0]);
      leaf(p[0], p[1], dir + (k % 2 ? 1 : -1) * (0.7 + rnd() * 0.5), 0.24 + rnd() * 0.1);
    }
    // Locke am Ende
    const e = line[line.length - 1]!;
    g.strokeStyle = css(lift(LEAF, -0.1));
    g.lineWidth = 0.016;
    g.beginPath();
    for (let k = 0; k <= 16; k++) {
      const t = k / 16;
      const r = 0.07 * (1 - t);
      const ang = t * Math.PI * 3;
      const x = e[0] + Math.cos(ang) * r;
      const y = e[1] + Math.sin(ang) * r;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
}

function bakeStone(form: number, q: number, color: string, px: number, variant: number): Sprite {
  const cells = rotatedCells(form, q);
  const loop = loopOf(cells);
  const { minX, maxX, minY, maxY } = cellBounds(cells);
  const pad = 0.42;
  const img = makeCanvas((maxX - minX + 2 * pad) * px, (maxY - minY + 2 * pad) * px);
  const g = ctx2d(img);
  const ox = (pad - minX) * px;
  const oy = (pad + maxY) * px;
  g.setTransform(px, 0, 0, -px, ox, oy);
  const L = rot90(LIGHT, -q);
  const up = rot90([0, 1], -q);
  const icy = (variant & V_ICY) !== 0;
  const rock = (variant & V_STONE) !== 0;
  const base = rock ? mix(GRANITE, hexRgb(color), 0.2) : hexRgb(color);
  const body = icy ? mix(lift(base, 0.08), [196, 232, 255], 0.35) : lift(base, -0.04);
  const outer = roundedPath(loop.pts, rock ? 0.05 : 0.085);
  const rnd = seededRandom(form * 31 + q * 7 + 3);

  // Schlagschatten nach rechts unten und dichter Kontaktschatten direkt darunter.
  castShadow(g, outer, px, 0.3, 0.06, 0.14, 'rgba(14,20,44,0.36)');
  castShadow(g, outer, px, 0.07, 0.015, 0.05, 'rgba(10,14,34,0.42)');

  g.save();
  g.clip(outer);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ext = Math.max(maxX - minX, maxY - minY) / 2 + 0.3;
  const grad = g.createLinearGradient(cx - L[0] * ext, cy - L[1] * ext, cx + L[0] * ext, cy + L[1] * ext);
  grad.addColorStop(0, css(lift(body, -0.2)));
  grad.addColorStop(0.5, css(body));
  grad.addColorStop(1, css(lift(body, 0.16)));
  g.fillStyle = grad;
  g.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);

  // Jede Zelle leicht gewölbt, wie gebrannte Kacheln.
  for (const c of cells) {
    const rg = g.createRadialGradient(c.x + L[0] * 0.2, c.y + L[1] * 0.2, 0, c.x, c.y, 0.75);
    rg.addColorStop(0, 'rgba(255,255,255,0.16)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.03)');
    rg.addColorStop(1, 'rgba(0,0,0,0.06)');
    g.fillStyle = rg;
    g.fillRect(c.x - 0.5, c.y - 0.5, 1, 1);
  }

  // Feine Körnung der Glasur, beim Fels grobes Granitkorn mit Rissen.
  if (rock) granite(g, cells, rnd);
  else
    for (const c of cells) {
      for (let i = 0; i < 26; i++) {
        const s = 0.012 + rnd() * 0.022;
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : css(lift(body, -0.5), 0.08);
        g.fillRect(c.x - 0.45 + rnd() * 0.9, c.y - 0.45 + rnd() * 0.9, s, s);
      }
    }

  // Fugen zwischen den Zellen: dunkle Kerbe mit Lichtkante.
  const has = new Set(cells.map((c) => `${Math.round(c.x * 2)},${Math.round(c.y * 2)}`));
  g.lineCap = 'butt';
  for (const c of cells) {
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      if (!has.has(`${Math.round((c.x + dx) * 2)},${Math.round((c.y + dy) * 2)}`)) continue;
      const mx = c.x + dx / 2;
      const my = c.y + dy / 2;
      const ax = dy;
      const ay = dx;
      const side = -Math.sign(dx * L[0] + dy * L[1]) || 1;
      g.strokeStyle = css(lift(body, -0.5), 0.5);
      g.lineWidth = 0.032;
      g.beginPath();
      g.moveTo(mx - ax * 0.5, my - ay * 0.5);
      g.lineTo(mx + ax * 0.5, my + ay * 0.5);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.32)';
      g.lineWidth = 0.02;
      g.beginPath();
      g.moveTo(mx - ax * 0.5 + dx * 0.03 * side, my - ay * 0.5 + dy * 0.03 * side);
      g.lineTo(mx + ax * 0.5 + dx * 0.03 * side, my + ay * 0.5 + dy * 0.03 * side);
      g.stroke();
    }
  }

  // Fase: vier Lichtstufen je nach Ausrichtung der Kante.
  const bevel = 0.115;
  const inner = insetLoop(loop, bevel);
  const n = loop.pts.length;
  for (let i = 0; i < n; i++) {
    const nrm = loop.normals[i]!;
    const d = nrm[0] * L[0] + nrm[1] * L[1];
    const tone = d >= 0 ? lift(body, 0.1 + 0.46 * d) : lift(body, -0.06 + 0.5 * d);
    g.fillStyle = css(tone);
    const a = loop.pts[i]!;
    const b = loop.pts[(i + 1) % n]!;
    const ib = inner[(i + 1) % n]!;
    const ia = inner[i]!;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(ib[0], ib[1]);
    g.lineTo(ia[0], ia[1]);
    g.closePath();
    g.fill();
    // Lichtkante ganz außen an den oberen Kanten.
    if (d > 0.4) {
      g.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * d})`;
      g.lineWidth = 0.028;
      g.beginPath();
      g.moveTo(a[0] - nrm[0] * 0.02, a[1] - nrm[1] * 0.02);
      g.lineTo(b[0] - nrm[0] * 0.02, b[1] - nrm[1] * 0.02);
      g.stroke();
    }
  }
  // Übergang Fase zu Fläche, ganz fein.
  const face = polyPath(inner);
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.lineWidth = 0.016;
  g.stroke(face);

  // Glasur: breiter Glanz zum Licht hin und ein kleiner Spitzlicht-Punkt (Fels bleibt matt).
  g.save();
  g.clip(face);
  if (!rock) {
    const gl = g.createLinearGradient(cx - L[0] * ext, cy - L[1] * ext, cx + L[0] * ext, cy + L[1] * ext);
    gl.addColorStop(0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.58, 'rgba(255,255,255,0)');
    gl.addColorStop(0.66, 'rgba(255,255,255,0.17)');
    gl.addColorStop(0.75, 'rgba(255,255,255,0.04)');
    gl.addColorStop(1, 'rgba(255,255,255,0.12)');
    g.fillStyle = gl;
    g.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
    let best = cells[0]!;
    for (const c of cells) if (c.x * L[0] + c.y * L[1] > best.x * L[0] + best.y * L[1]) best = c;
    const sx = best.x + L[0] * 0.17 - L[1] * 0.12;
    const sy = best.y + L[1] * 0.17 + L[0] * 0.12;
    const spec = g.createRadialGradient(sx, sy, 0, sx, sy, 0.2);
    spec.addColorStop(0, 'rgba(255,255,255,0.55)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec;
    g.fillRect(sx - 0.25, sy - 0.25, 0.5, 0.5);
  }

  if (icy) {
    // Raureif: kalter Überzug, nach oben dichter, dazu feine Eisnadeln.
    const fr = g.createLinearGradient(cx - up[0] * ext, cy - up[1] * ext, cx + up[0] * ext, cy + up[1] * ext);
    fr.addColorStop(0, 'rgba(225,245,255,0.08)');
    fr.addColorStop(1, 'rgba(240,250,255,0.42)');
    g.fillStyle = fr;
    g.fillRect(minX - 1, minY - 1, maxX - minX + 2, maxY - minY + 2);
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 0.016;
    g.lineCap = 'round';
    for (const c of cells) {
      for (let i = 0; i < 4; i++) {
        const x0 = c.x - 0.38 + rnd() * 0.76;
        const y0 = c.y - 0.38 + rnd() * 0.76;
        const ang = rnd() * Math.PI;
        const len = 0.1 + rnd() * 0.16;
        const ex = x0 + Math.cos(ang) * len;
        const ey = y0 + Math.sin(ang) * len;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(ex, ey);
        const mx = (x0 + ex) / 2;
        const my = (y0 + ey) / 2;
        g.moveTo(mx, my);
        g.lineTo(mx + Math.cos(ang + 0.8) * len * 0.4, my + Math.sin(ang + 0.8) * len * 0.4);
        g.moveTo(mx, my);
        g.lineTo(mx + Math.cos(ang - 0.8) * len * 0.4, my + Math.sin(ang - 0.8) * len * 0.4);
        g.stroke();
      }
    }
  }
  g.restore();

  if (variant & V_SPECIAL) {
    // Goldene Einlage nahe der Fase und ein geschliffener Edelstein.
    const inlay = polyPath(insetLoop(loop, bevel + 0.06));
    const gg = g.createLinearGradient(cx - L[0] * ext, cy - L[1] * ext, cx + L[0] * ext, cy + L[1] * ext);
    gg.addColorStop(0, css(lift(GOLD, -0.35)));
    gg.addColorStop(0.55, css(GOLD));
    gg.addColorStop(1, css(lift(GOLD, 0.55)));
    g.strokeStyle = gg;
    g.lineWidth = 0.045;
    g.lineJoin = 'miter';
    g.stroke(inlay);
    let mid = cells[0]!;
    for (const c of cells) if (Math.hypot(c.x - cx, c.y - cy) < Math.hypot(mid.x - cx, mid.y - cy)) mid = c;
    const r = 0.25;
    const tips: Pt[] = [rot90([0, r], -q), rot90([r * 0.8, 0], -q), rot90([0, -r], -q), rot90([-r * 0.8, 0], -q)];
    for (let i = 0; i < 4; i++) {
      const a = tips[i]!;
      const b = tips[(i + 1) % 4]!;
      const nx = a[0] + b[0];
      const ny = a[1] + b[1];
      const d = (nx * L[0] + ny * L[1]) / Math.hypot(nx, ny);
      g.fillStyle = css(d >= 0 ? lift(GOLD, 0.15 + 0.6 * d) : lift(GOLD, 0.45 * d - 0.05));
      g.beginPath();
      g.moveTo(mid.x, mid.y);
      g.lineTo(mid.x + a[0], mid.y + a[1]);
      g.lineTo(mid.x + b[0], mid.y + b[1]);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = css(lift(GOLD, -0.5), 0.8);
    g.lineWidth = 0.018;
    g.beginPath();
    tips.forEach((t, i) => (i === 0 ? g.moveTo(mid.x + t[0], mid.y + t[1]) : g.lineTo(mid.x + t[0], mid.y + t[1])));
    g.closePath();
    g.stroke();
  }
  g.restore();

  // Kontur: trennt den Stein klar vom Himmel und vom Nachbarn.
  g.strokeStyle = css(lift(base, -0.66), icy ? 0.45 : 0.62);
  g.lineWidth = 1.15 / px + 0.012;
  g.lineJoin = 'round';
  g.stroke(outer);
  if (icy) {
    g.strokeStyle = 'rgba(230,248,255,0.85)';
    g.lineWidth = 0.03;
    g.stroke(polyPath(insetLoop(loop, 0.035)));
  }

  if (variant & V_GLUED) vines(g, insetLoop(loop, 0.06), cells, rnd);
  return { img, ox, oy, px };
}

// --------------------------------------------------------------- Rundstein

export interface RoundSprites {
  /** Schatten, Körper und Fase, dreht nicht mit (Licht bleibt oben). */
  base: Sprite;
  /** Rillen, Nabe und Muster, dreht mit dem Winkel. */
  spin: Sprite;
  /** Glanz und Kontur, dreht nicht mit. */
  gloss: Sprite;
}

const rounds = new SpriteCache<RoundSprites>(40);

/** Mühlstein in drei Lagen, damit beim Rollen die Rillen drehen, das Licht aber oben bleibt. */
export function roundSprites(color: string, radius: number, px: number, variant: number): RoundSprites {
  return rounds.get(`${color}|${radius}|${px}|${variant}`, () => bakeRound(color, radius, px, variant));
}

function bakeRound(color: string, R: number, px: number, variant: number): RoundSprites {
  const pad = 0.45;
  const size = (R + pad) * 2 * px;
  const o = size / 2;
  const layer = () => {
    const img = makeCanvas(size, size);
    const g = ctx2d(img);
    g.setTransform(px, 0, 0, -px, o, o);
    return { img, g };
  };
  const rock = (variant & V_STONE) !== 0;
  const icy = (variant & V_ICY) !== 0;
  const base = rock ? mix(GRANITE, hexRgb(color), 0.2) : hexRgb(color);
  const body = icy ? mix(lift(base, 0.08), [196, 232, 255], 0.35) : lift(base, -0.04);
  const disc = new Path2D();
  disc.arc(0, 0, R, 0, Math.PI * 2);
  const rnd = seededRandom(909);

  // Untere Lage: Schatten, Körper, Fase am Rand
  const b = layer();
  castShadow(b.g, disc, px, 0.3, 0.06, 0.14, 'rgba(14,20,44,0.36)');
  castShadow(b.g, disc, px, 0.07, 0.015, 0.05, 'rgba(10,14,34,0.42)');
  const rg = b.g.createRadialGradient(LIGHT[0] * R * 0.35, LIGHT[1] * R * 0.35, 0, 0, 0, R);
  rg.addColorStop(0, css(lift(body, 0.18)));
  rg.addColorStop(0.7, css(body));
  rg.addColorStop(1, css(lift(body, -0.22)));
  b.g.fillStyle = rg;
  b.g.fill(disc);
  const ring = b.g.createLinearGradient(-LIGHT[0] * R, -LIGHT[1] * R, LIGHT[0] * R, LIGHT[1] * R);
  ring.addColorStop(0, css(lift(body, -0.42)));
  ring.addColorStop(0.5, css(lift(body, -0.05)));
  ring.addColorStop(1, css(lift(body, 0.5)));
  b.g.strokeStyle = ring;
  b.g.lineWidth = 0.13;
  b.g.beginPath();
  b.g.arc(0, 0, R - 0.065, 0, Math.PI * 2);
  b.g.stroke();

  // Mittlere Lage: Rillen im Mahlmuster, Nabe mit Loch, Kerbe als Drehmarke
  const sp = layer();
  const g = sp.g;
  g.save();
  g.clip(disc);
  if (rock) granite(g, [{ x: -0.45, y: -0.45 }, { x: 0.45, y: -0.45 }, { x: -0.45, y: 0.45 }, { x: 0.45, y: 0.45 }], rnd);
  const grooves = 10;
  for (let i = 0; i < grooves; i++) {
    const ang = (i / grooves) * Math.PI * 2;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const off = 0.16;
    const x0 = ca * 0.26 - sa * off;
    const y0 = sa * 0.26 + ca * off;
    const x1 = ca * (R - 0.16);
    const y1 = sa * (R - 0.16);
    g.lineCap = 'round';
    g.strokeStyle = css(lift(body, -0.5), 0.55);
    g.lineWidth = 0.04;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 0.018;
    g.beginPath();
    g.moveTo(x0 + 0.025, y0 - 0.02);
    g.lineTo(x1 + 0.025, y1 - 0.02);
    g.stroke();
  }
  // Nabe
  g.fillStyle = css(lift(body, -0.2));
  g.beginPath();
  g.arc(0, 0, 0.24, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 0.02;
  g.stroke();
  g.fillStyle = css(lift(body, -0.7));
  g.beginPath();
  g.arc(0, 0, 0.09, 0, Math.PI * 2);
  g.fill();
  if (variant & V_SPECIAL) {
    g.strokeStyle = css(GOLD);
    g.lineWidth = 0.045;
    g.beginPath();
    g.arc(0, 0, R - 0.19, 0, Math.PI * 2);
    g.stroke();
  }
  // Drehmarke: helle Einlage nahe am Rand
  g.fillStyle = css(lift(base, 0.6));
  g.beginPath();
  g.arc(0, R - 0.3, 0.07, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (variant & V_GLUED) {
    const ringPts: Pt[] = [];
    for (let i = 0; i < 24; i++) ringPts.push([Math.cos((i / 24) * Math.PI * 2) * (R - 0.12), Math.sin((i / 24) * Math.PI * 2) * (R - 0.12)]);
    vines(g, ringPts, [{ x: -0.4, y: -0.3 }, { x: 0.4, y: 0.35 }], rnd);
  }

  // Obere Lage: Spitzlicht, Lichtkante, Kontur
  const gl = layer();
  if (!rock) {
    const sx = LIGHT[0] * R * 0.45;
    const sy = LIGHT[1] * R * 0.45;
    const spec = gl.g.createRadialGradient(sx, sy, 0, sx, sy, R * 0.45);
    spec.addColorStop(0, 'rgba(255,255,255,0.45)');
    spec.addColorStop(1, 'rgba(255,255,255,0)');
    gl.g.fillStyle = spec;
    gl.g.fill(disc);
  }
  const top = Math.atan2(LIGHT[1], LIGHT[0]);
  gl.g.strokeStyle = 'rgba(255,255,255,0.75)';
  gl.g.lineWidth = 0.03;
  gl.g.beginPath();
  gl.g.arc(0, 0, R - 0.025, top - 0.9, top + 0.9);
  gl.g.stroke();
  if (icy) {
    gl.g.fillStyle = 'rgba(235,248,255,0.22)';
    gl.g.fill(disc);
    gl.g.strokeStyle = 'rgba(230,248,255,0.85)';
    gl.g.lineWidth = 0.03;
    gl.g.beginPath();
    gl.g.arc(0, 0, R - 0.04, 0, Math.PI * 2);
    gl.g.stroke();
  }
  gl.g.strokeStyle = css(lift(base, -0.66), 0.62);
  gl.g.lineWidth = 1.15 / px + 0.012;
  gl.g.stroke(disc);
  const anchor = (img: HTMLCanvasElement): Sprite => ({ img, ox: o, oy: o, px });
  return { base: anchor(b.img), spin: anchor(sp.img), gloss: anchor(gl.img) };
}

// ------------------------------------------------------------ Schutzschild

let dome: HTMLCanvasElement | null = null;
/**
 * Schutzschild 512×256: flache Lichtkuppel, die sich wie ein Schirm über die Turmspitze legt. Oben ein klarer
 * goldener Rand, nach unten blendet alles aus (kein Boden, keine Kontur unten). Wird gestreckt.
 */
export function shieldDome(): HTMLCanvasElement {
  if (dome) return dome;
  const W = 512;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const rx = W / 2 - 14;
  const ry = H - 14;
  const path = new Path2D();
  path.ellipse(W / 2, H, rx, ry, 0, Math.PI, Math.PI * 2);
  path.closePath();
  g.save();
  g.clip(path);
  const fill = g.createLinearGradient(0, 14, 0, H);
  fill.addColorStop(0, 'rgba(255,232,170,0.30)');
  fill.addColorStop(0.5, 'rgba(255,232,170,0.10)');
  fill.addColorStop(1, 'rgba(255,232,170,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, W, H);
  // Waben
  g.strokeStyle = 'rgba(255,244,210,0.28)';
  g.lineWidth = 1.3;
  const r = 16;
  for (let row = 0; row * r * 1.5 < H + r; row++) {
    for (let col = 0; col * r * Math.sqrt(3) < W + r; col++) {
      const cx = col * r * Math.sqrt(3) + (row % 2 ? (r * Math.sqrt(3)) / 2 : 0);
      const cy = row * r * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = Math.PI / 6 + (k * Math.PI) / 3;
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
  }
  g.restore();
  // Rand mit Leuchten (nur beim Backen), danach nach unten ausblenden
  g.save();
  g.shadowColor = 'rgba(255,214,120,0.95)';
  g.shadowBlur = 16;
  g.strokeStyle = 'rgba(255,244,210,1)';
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(W / 2, H, rx, ry, 0, Math.PI, Math.PI * 2);
  g.stroke();
  g.restore();
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 0, 0, H);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.85)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  dome = c;
  return c;
}

// ------------------------------------------------------------- Stützbalken

const beams = new SpriteCache<Sprite>(8);

/** Stahlträger mit Flanschen, Steifen und Nieten. */
export function beamSprite(px: number): Sprite {
  return beams.get(String(px), () => {
    const { w, h } = TOWER_BEAM_HALF;
    const pad = 0.45;
    const img = makeCanvas((2 * w + 2 * pad) * px, (2 * h + 2 * pad) * px);
    const g = ctx2d(img);
    const ox = (pad + w) * px;
    const oy = (pad + h) * px;
    g.setTransform(px, 0, 0, -px, ox, oy);
    const outline = new Path2D();
    outline.rect(-w, -h, 2 * w, 2 * h);
    castShadow(g, outline, px, 0.3, 0.06, 0.16, 'rgba(14,20,44,0.4)');
    castShadow(g, outline, px, 0.06, 0.01, 0.05, 'rgba(10,14,34,0.4)');
    const steel: Rgb = [116, 132, 158];
    // Steg
    const web = g.createLinearGradient(0, -h, 0, h);
    web.addColorStop(0, css(lift(steel, -0.42)));
    web.addColorStop(0.5, css(lift(steel, -0.22)));
    web.addColorStop(1, css(lift(steel, -0.3)));
    g.fillStyle = web;
    g.fillRect(-w + 0.04, -h + 0.08, 2 * w - 0.08, 2 * h - 0.16);
    // Steifen
    for (let x = -w + 0.45; x < w - 0.3; x += 0.8) {
      g.fillStyle = css(lift(steel, -0.08));
      g.fillRect(x - 0.035, -h + 0.08, 0.07, 2 * h - 0.16);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x - 0.035, -h + 0.08, 0.015, 2 * h - 0.16);
    }
    // Flansche oben und unten
    for (const [y0, lit] of [[h - 0.085, true], [-h, false]] as const) {
      const fl = g.createLinearGradient(0, y0, 0, y0 + 0.085);
      fl.addColorStop(0, css(lift(steel, lit ? 0.05 : -0.25)));
      fl.addColorStop(1, css(lift(steel, lit ? 0.5 : 0.05)));
      g.fillStyle = fl;
      g.fillRect(-w, y0, 2 * w, 0.085);
    }
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.fillRect(-w + 0.02, h - 0.022, 2 * w - 0.04, 0.016);
    // Gebürstete Struktur
    const rnd = seededRandom(77);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
      g.fillRect(-w + rnd() * 2 * w, -h + 0.09 + rnd() * (2 * h - 0.18), 0.2 + rnd() * 0.6, 0.008);
    }
    // Nieten
    for (let x = -w + 0.2; x < w - 0.1; x += 0.4) {
      for (const y of [h - 0.043, -h + 0.043]) {
        g.fillStyle = 'rgba(10,14,30,0.45)';
        g.beginPath();
        g.arc(x + 0.008, y - 0.01, 0.03, 0, Math.PI * 2);
        g.fill();
        const rv = g.createRadialGradient(x - 0.01, y + 0.012, 0, x, y, 0.028);
        rv.addColorStop(0, '#f1f5fb');
        rv.addColorStop(0.5, css(lift(steel, 0.25)));
        rv.addColorStop(1, css(lift(steel, -0.3)));
        g.fillStyle = rv;
        g.beginPath();
        g.arc(x, y, 0.026, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Stirnplatten
    for (const x of [-w, w - 0.07]) {
      g.fillStyle = css(lift(steel, -0.35));
      g.fillRect(x, -h, 0.07, 2 * h);
    }
    g.strokeStyle = css(lift(steel, -0.7), 0.7);
    g.lineWidth = 1.1 / px;
    g.strokeRect(-w, -h, 2 * w, 2 * h);
    return { img, ox, oy, px };
  });
}

// ------------------------------------------------------------------ Sockel

const plinths = new SpriteCache<Sprite>(12);
/** Untere Kante des gebackenen Sockels; darunter liegt ohnehin Dunst. */
export const PLINTH_DEPTH = 3.6;

const STONE_LIGHT: Rgb = [247, 240, 229];
const STONE_MID: Rgb = [226, 213, 194];
const STONE_DARK: Rgb = [176, 158, 134];

/** Sockel aus hellem Kalkstein: Gesims mit Fase, Einlage in der Spielerfarbe, Hals, Schaft mit vertieftem Feld. */
export function plinthSprite(px: number, color: string): Sprite {
  return plinths.get(`${px}|${color}`, () => {
    const hw = TOWER_BASE_HALF;
    const cw = hw + 0.16;
    const pad = 0.1;
    const img = makeCanvas((2 * cw + 2 * pad) * px, (PLINTH_DEPTH + 0.1 + pad) * px);
    const g = ctx2d(img);
    const ox = (pad + cw) * px;
    const oy = 0.1 * px;
    g.setTransform(px, 0, 0, -px, ox, oy);
    const rnd = seededRandom(4242);

    // Schaft
    const sw = hw - 0.2;
    const shaft = g.createLinearGradient(-sw, 0, sw, 0);
    shaft.addColorStop(0, css(STONE_MID));
    shaft.addColorStop(0.18, css(STONE_LIGHT));
    shaft.addColorStop(0.55, css(STONE_MID));
    shaft.addColorStop(1, css(STONE_DARK));
    g.fillStyle = shaft;
    g.fillRect(-sw, -PLINTH_DEPTH, 2 * sw, PLINTH_DEPTH - 0.55);
    // Vertieftes Feld mit Kanneluren
    const fw = sw - 0.36;
    const top = -1.0;
    g.fillStyle = 'rgba(120,98,70,0.07)';
    g.fillRect(-fw, -PLINTH_DEPTH, 2 * fw, PLINTH_DEPTH + top);
    for (let x = -fw + 0.28; x < fw - 0.1; x += 0.36) {
      g.fillStyle = 'rgba(110,88,60,0.10)';
      g.fillRect(x, -PLINTH_DEPTH, 0.07, PLINTH_DEPTH + top - 0.12);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(x - 0.03, -PLINTH_DEPTH, 0.03, PLINTH_DEPTH + top - 0.12);
    }
    g.fillStyle = 'rgba(110,88,60,0.32)';
    g.fillRect(-fw, top - 0.035, 2 * fw, 0.035);
    g.fillRect(fw - 0.03, -PLINTH_DEPTH, 0.03, PLINTH_DEPTH + top);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(-fw, -PLINTH_DEPTH, 0.025, PLINTH_DEPTH + top);
    // Schlagschatten des Gesimses auf dem Schaft
    const sh = g.createLinearGradient(0, -0.55, 0, -1.25);
    sh.addColorStop(0, 'rgba(70,52,34,0.34)');
    sh.addColorStop(1, 'rgba(70,52,34,0)');
    g.fillStyle = sh;
    g.fillRect(-sw, -1.25, 2 * sw, 0.7);
    // Hals: Rundstab
    const neck = g.createLinearGradient(0, -0.62, 0, -0.44);
    neck.addColorStop(0, css(lift(STONE_DARK, -0.12)));
    neck.addColorStop(0.55, css(STONE_MID));
    neck.addColorStop(1, css(STONE_DARK));
    g.fillStyle = neck;
    g.beginPath();
    g.roundRect(-hw + 0.08, -0.62, 2 * (hw - 0.08), 0.2, 0.08);
    g.fill();
    // Gesims: Fase unten, Vorderseite, helle Oberkante
    g.fillStyle = css(lift(STONE_DARK, -0.06));
    g.beginPath();
    g.moveTo(-cw, -0.36);
    g.lineTo(cw, -0.36);
    g.lineTo(cw - 0.14, -0.48);
    g.lineTo(-cw + 0.14, -0.48);
    g.closePath();
    g.fill();
    const front = g.createLinearGradient(0, 0, 0, -0.36);
    front.addColorStop(0, css(STONE_LIGHT));
    front.addColorStop(0.5, css(lift(STONE_MID, 0.25)));
    front.addColorStop(1, css(STONE_MID));
    g.fillStyle = front;
    g.fillRect(-cw, -0.36, 2 * cw, 0.36);
    const side = g.createLinearGradient(-cw, 0, cw, 0);
    side.addColorStop(0, 'rgba(255,255,255,0.18)');
    side.addColorStop(0.3, 'rgba(255,255,255,0)');
    side.addColorStop(1, 'rgba(90,70,45,0.16)');
    g.fillStyle = side;
    g.fillRect(-cw, -0.48, 2 * cw, 0.48);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(-cw, -0.03, 2 * cw, 0.03);
    // Einlage in der Spielerfarbe mit Kerbe darüber
    const pc = hexRgb(color);
    g.fillStyle = 'rgba(100,80,55,0.35)';
    g.fillRect(-cw + 0.16, -0.17, 2 * (cw - 0.16), 0.022);
    g.fillStyle = css(lift(pc, -0.1));
    g.fillRect(-cw + 0.16, -0.235, 2 * (cw - 0.16), 0.06);
    g.fillStyle = css(lift(pc, 0.45), 0.9);
    g.fillRect(-cw + 0.16, -0.19, 2 * (cw - 0.16), 0.014);
    // Steinkörnung
    for (let i = 0; i < 420; i++) {
      const x = -cw + rnd() * 2 * cw;
      const y = -PLINTH_DEPTH + rnd() * PLINTH_DEPTH;
      if (y < -0.62 && Math.abs(x) > sw) continue;
      const s = 0.01 + rnd() * 0.025;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(110,88,60,0.12)';
      g.fillRect(x, y, s, s);
    }
    // Kontur
    g.strokeStyle = 'rgba(90,70,48,0.35)';
    g.lineWidth = 1 / px;
    g.strokeRect(-cw, -0.36, 2 * cw, 0.36);
    return { img, ox, oy, px };
  });
}

// ------------------------------------------------------- Kleine Lichtteile

const dots = new SpriteCache<HTMLCanvasElement>(24);
/** Weicher Punkt in einer Farbe, 64 px. */
export function softDot(color: string): HTMLCanvasElement {
  return dots.get(color, () => {
    const c = makeCanvas(64, 64);
    const g = ctx2d(c);
    const rgb = hexRgb(color);
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, css(rgb, 1));
    rg.addColorStop(0.35, css(rgb, 0.55));
    rg.addColorStop(1, css(rgb, 0));
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    return c;
  });
}

const strips = new SpriteCache<HTMLCanvasElement>(12);
/** Senkrechter Verlauf 4×128: Mitte hell, Ränder durchsichtig (Lichtband) oder oben durchsichtig (Dunst). */
export function bandStrip(color: string, peak: number, shape: 'band' | 'rise' | 'plateau'): HTMLCanvasElement {
  return strips.get(`${color}|${peak}|${shape}`, () => {
    const c = makeCanvas(4, 128);
    const g = ctx2d(c);
    const rgb = hexRgb(color);
    const lg = g.createLinearGradient(0, 0, 0, 128);
    if (shape === 'band') {
      lg.addColorStop(0, css(rgb, 0));
      lg.addColorStop(0.3, css(rgb, peak * 0.25));
      lg.addColorStop(0.5, css(rgb, peak));
      lg.addColorStop(0.7, css(rgb, peak * 0.25));
      lg.addColorStop(1, css(rgb, 0));
    } else if (shape === 'plateau') {
      lg.addColorStop(0, css(rgb, 0));
      lg.addColorStop(0.28, css(rgb, peak));
      lg.addColorStop(0.72, css(rgb, peak));
      lg.addColorStop(1, css(rgb, 0));
    } else {
      lg.addColorStop(0, css(rgb, 0));
      lg.addColorStop(0.45, css(rgb, peak * 0.55));
      lg.addColorStop(1, css(rgb, peak));
    }
    g.fillStyle = lg;
    g.fillRect(0, 0, 4, 128);
    return c;
  });
}

let column: HTMLCanvasElement | null = null;
/** Lichtsäule unter dem fallenden Stein: oben hell, nach unten verlaufend, weiche Seiten. */
export function lightColumn(): HTMLCanvasElement {
  if (column) return column;
  const c = makeCanvas(64, 128);
  const g = ctx2d(c);
  const h = g.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  h.addColorStop(0.5, 'rgba(255,255,255,1)');
  h.addColorStop(0.8, 'rgba(255,255,255,0.8)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, 64, 128);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, 128);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = v;
  g.fillRect(0, 0, 64, 128);
  column = c;
  return c;
}

let streak: HTMLCanvasElement | null = null;
/** Windstreifen: schlanke, an beiden Enden spitze Sichel. */
export function windStreak(): HTMLCanvasElement {
  if (streak) return streak;
  const c = makeCanvas(256, 40);
  const g = ctx2d(c);
  const lg = g.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, 'rgba(255,255,255,0)');
  lg.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  lg.addColorStop(0.85, 'rgba(255,255,255,0.95)');
  lg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(4, 26);
  g.quadraticCurveTo(128, 6, 252, 20);
  g.quadraticCurveTo(128, 14, 4, 26);
  g.closePath();
  g.fill();
  streak = c;
  return c;
}

const leaves = new SpriteCache<HTMLCanvasElement>(6);
/** Blatt für den Windstoß. */
export function leafSprite(color: string): HTMLCanvasElement {
  return leaves.get(color, () => {
    const c = makeCanvas(32, 18);
    const g = ctx2d(c);
    const rgb = hexRgb(color);
    const lg = g.createLinearGradient(0, 0, 0, 18);
    lg.addColorStop(0, css(lift(rgb, 0.25)));
    lg.addColorStop(1, css(lift(rgb, -0.25)));
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(2, 9);
    g.quadraticCurveTo(14, -1, 30, 9);
    g.quadraticCurveTo(14, 19, 2, 9);
    g.fill();
    g.strokeStyle = css(lift(rgb, -0.45), 0.7);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(3, 9);
    g.lineTo(29, 9);
    g.stroke();
    return c;
  });
}

// --------------------------------------------------------------- Landschaft

/** Kamerahöhe beim Start; dort stehen alle Ebenen an ihrem Platz. */
export const CAM_START = -1.6;

interface Layer {
  img: HTMLCanvasElement;
  /** Oberkante beim Start als Anteil der Höhe. */
  top: number;
  /** Wie stark die Ebene der Kamera folgt (0 = steht, 1 = wie der Turm). */
  k: number;
}

/** Himmel von Horizont (unten) bis große Höhe (oben). */
let skyStrip: HTMLCanvasElement | null = null;
function sky(): HTMLCanvasElement {
  if (skyStrip) return skyStrip;
  const c = makeCanvas(2, 1024);
  const g = ctx2d(c);
  const lg = g.createLinearGradient(0, 1024, 0, 0);
  lg.addColorStop(0, '#f6d6b6');
  lg.addColorStop(0.08, '#f2dcc6');
  lg.addColorStop(0.2, '#d6e3ef');
  lg.addColorStop(0.38, '#abcdee');
  lg.addColorStop(0.58, '#80b2e6');
  lg.addColorStop(0.8, '#5b8fd8');
  lg.addColorStop(1, '#3a62b2');
  g.fillStyle = lg;
  g.fillRect(0, 0, 2, 1024);
  skyStrip = c;
  return c;
}

/** Gratlinie aus Mittelpunktverschiebung, Werte 0 bis 1. */
function ridge(n: number, rnd: () => number, rough: number): number[] {
  const size = 1 << Math.ceil(Math.log2(Math.max(2, n)));
  const a = new Array<number>(size + 1).fill(0);
  a[0] = rnd();
  a[size] = rnd();
  let step = size;
  let amp = 0.6;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < size; i += step) a[i] = (a[i - half]! + a[i + half]!) / 2 + (rnd() - 0.5) * amp;
    amp *= rough;
    step = half;
  }
  const lo = Math.min(...a);
  const hi = Math.max(...a);
  return a.map((v) => (v - lo) / (hi - lo || 1));
}

function mountainLayer(W: number, H: number, seed: number, opts: { peak: number; rough: number; rock: Rgb; haze: Rgb; snow?: Rgb; trees?: boolean }): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const rnd = seededRandom(seed);
  const r = ridge(64, rnd, opts.rough);
  const at = (x: number) => {
    const f = (x / W) * (r.length - 1);
    const i = Math.floor(f);
    const t = f - i;
    return (r[i] ?? 0) * (1 - t) + (r[Math.min(r.length - 1, i + 1)] ?? 0) * t;
  };
  const path = new Path2D();
  path.moveTo(0, H);
  const step = Math.max(2, W / 260);
  const yAt = (x: number) => H * (opts.peak + (1 - at(x)) * (1 - opts.peak) * 0.55);
  for (let x = 0; x <= W + step; x += step) path.lineTo(x, yAt(x));
  path.lineTo(W, H);
  path.closePath();
  if (opts.trees) {
    // Nadelbäume auf dem nahen Grat, mal dicht, mal licht
    const tw = Math.max(3, W * 0.011);
    for (let x = -tw; x < W + tw; x += tw * (0.45 + rnd() * 0.9)) {
      if (Math.sin(x / (W * 0.06)) + rnd() * 0.8 < -0.2) continue;
      const th = H * (0.035 + rnd() * 0.04);
      const y = yAt(x) + H * 0.012;
      path.moveTo(x - tw * 0.55, y);
      path.lineTo(x, y - th);
      path.lineTo(x + tw * 0.55, y);
      path.closePath();
    }
  }
  const lg = g.createLinearGradient(0, H * opts.peak, 0, H);
  if (opts.snow) {
    lg.addColorStop(0, css(opts.snow));
    lg.addColorStop(0.1, css(mix(opts.snow, opts.rock, 0.6)));
    lg.addColorStop(0.2, css(opts.rock));
  } else lg.addColorStop(0, css(opts.rock));
  lg.addColorStop(0.62, css(mix(opts.rock, opts.haze, 0.55)));
  lg.addColorStop(1, css(opts.haze));
  g.fillStyle = lg;
  g.fill(path);
  // Sonnenseite: die dunklere Kopie leicht nach links versetzt lässt rechts abfallende Hänge hell.
  g.save();
  g.clip(path);
  g.globalCompositeOperation = 'source-atop';
  g.translate(-W * 0.014, H * 0.012);
  const dark = g.createLinearGradient(0, H * opts.peak, 0, H);
  dark.addColorStop(0, 'rgba(30,40,80,0.16)');
  dark.addColorStop(0.7, 'rgba(30,40,80,0.05)');
  dark.addColorStop(1, 'rgba(30,40,80,0)');
  g.fillStyle = dark;
  g.fill(path);
  g.restore();
  // Dunst sammelt sich unten.
  const mist = g.createLinearGradient(0, H * 0.55, 0, H);
  mist.addColorStop(0, css(opts.haze, 0));
  mist.addColorStop(1, css(opts.haze, 0.85));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = mist;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Wolken: weiche Ballen mit kühler Unterseite und warmem Licht von oben rechts. */
function puffs(g: CanvasRenderingContext2D, list: { x: number; y: number; r: number }[], W: number, wrap: boolean): void {
  const each = (fn: (x: number, y: number, r: number) => void) => {
    for (const p of list) {
      fn(p.x, p.y, p.r);
      if (wrap) {
        if (p.x - p.r < 0) fn(p.x + W, p.y, p.r);
        if (p.x + p.r > W) fn(p.x - W, p.y, p.r);
      }
    }
  };
  each((x, y, r) => {
    const rg = g.createRadialGradient(x, y + r * 0.25, 0, x, y + r * 0.25, r * 1.05);
    rg.addColorStop(0, 'rgba(196,202,224,0.95)');
    rg.addColorStop(0.7, 'rgba(204,208,228,0.75)');
    rg.addColorStop(1, 'rgba(210,214,232,0)');
    g.fillStyle = rg;
    g.fillRect(x - r * 1.1, y - r * 0.85, r * 2.2, r * 2.2);
  });
  each((x, y, r) => {
    const cx = x + r * 0.12;
    const cy = y - r * 0.18;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.85);
    rg.addColorStop(0, 'rgba(255,252,247,1)');
    rg.addColorStop(0.55, 'rgba(250,246,242,0.85)');
    rg.addColorStop(1, 'rgba(244,240,240,0)');
    g.fillStyle = rg;
    g.fillRect(cx - r, cy - r, r * 2, r * 2);
  });
}

function cloudBank(W: number, H: number, seed: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const rnd = seededRandom(seed);
  const unit = Math.min(W, H * 1.4);
  const list: { x: number; y: number; r: number }[] = [];
  for (let x = -unit * 0.05; x < W + unit * 0.1; x += unit * (0.05 + rnd() * 0.05)) {
    list.push({ x, y: H * (0.14 + rnd() * 0.1), r: unit * (0.06 + rnd() * 0.07) });
    if (rnd() < 0.6) list.push({ x: x + unit * 0.03, y: H * (0.3 + rnd() * 0.1), r: unit * (0.08 + rnd() * 0.06) });
  }
  // Fester Körper unter den Ballen
  const body = g.createLinearGradient(0, H * 0.25, 0, H);
  body.addColorStop(0, 'rgba(232,232,240,0)');
  body.addColorStop(0.15, 'rgba(232,233,242,1)');
  body.addColorStop(1, 'rgba(214,218,234,1)');
  g.fillStyle = body;
  g.fillRect(0, H * 0.25, W, H * 0.75);
  puffs(g, list, W, true);
  // Warmes Licht oben
  g.globalCompositeOperation = 'source-atop';
  const warm = g.createLinearGradient(0, 0, 0, H * 0.4);
  warm.addColorStop(0, 'rgba(255,222,190,0.35)');
  warm.addColorStop(1, 'rgba(255,222,190,0)');
  g.fillStyle = warm;
  g.fillRect(0, 0, W, H * 0.4);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function cloudSprite(W: number, H: number, seed: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const rnd = seededRandom(seed);
  const list: { x: number; y: number; r: number }[] = [];
  const n = 7 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const hump = Math.sin(t * Math.PI);
    list.push({ x: W * (0.12 + 0.76 * t + (rnd() - 0.5) * 0.06), y: H * (0.62 - 0.28 * hump + (rnd() - 0.5) * 0.08), r: H * (0.18 + 0.2 * hump + rnd() * 0.06) });
  }
  puffs(g, list, W, false);
  // Flache Unterkante
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, H * 0.72, 0, H * 0.92);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, H * 0.72, W, H * 0.28);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function cirrus(W: number, H: number, seed: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const rnd = seededRandom(seed);
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W;
    const y = H * (0.15 + rnd() * 0.7);
    const len = W * (0.25 + rnd() * 0.35);
    g.save();
    g.translate(x, y);
    g.rotate(-0.08 + rnd() * 0.06);
    g.scale(1, 0.05 + rnd() * 0.04);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, len / 2);
    rg.addColorStop(0, 'rgba(255,255,255,0.2)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, len / 2, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  return c;
}

function sunSprite(S: number): HTMLCanvasElement {
  const c = makeCanvas(S, S);
  const g = ctx2d(c);
  const m = S / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, 'rgba(255,246,226,0.9)');
  glow.addColorStop(0.05, 'rgba(255,238,206,0.55)');
  glow.addColorStop(0.22, 'rgba(255,228,190,0.18)');
  glow.addColorStop(1, 'rgba(255,228,190,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // Lichtstrahlen: schmale Keile, die nach außen ausblenden.
  const rnd = seededRandom(9);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.5 + rnd() * 0.5);
    const w = 0.03 + rnd() * 0.05;
    const rg = g.createRadialGradient(m, m, 0, m, m, m);
    rg.addColorStop(0, 'rgba(255,244,222,0.07)');
    rg.addColorStop(1, 'rgba(255,244,222,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(m, m);
    g.lineTo(m + Math.cos(a - w) * m, m + Math.sin(a - w) * m);
    g.lineTo(m + Math.cos(a + w) * m, m + Math.sin(a + w) * m);
    g.closePath();
    g.fill();
  }
  const disc = g.createRadialGradient(m, m, 0, m, m, S * 0.03);
  disc.addColorStop(0, 'rgba(255,253,246,1)');
  disc.addColorStop(0.7, 'rgba(255,248,230,0.95)');
  disc.addColorStop(1, 'rgba(255,248,230,0)');
  g.fillStyle = disc;
  g.fillRect(m - S * 0.03, m - S * 0.03, S * 0.06, S * 0.06);
  return c;
}

function fogTile(W: number, H: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const rnd = seededRandom(31);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const y = H * (0.2 + rnd() * 0.6);
    const r = H * (0.18 + rnd() * 0.3);
    for (const xx of [x, x - W, x + W]) {
      if (xx + r < 0 || xx - r > W) continue;
      const rg = g.createRadialGradient(xx, y, 0, xx, y, r);
      rg.addColorStop(0, 'rgba(246,248,252,0.5)');
      rg.addColorStop(1, 'rgba(246,248,252,0)');
      g.fillStyle = rg;
      g.fillRect(xx - r, y - r, 2 * r, 2 * r);
    }
  }
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.3, 'rgba(0,0,0,1)');
  v.addColorStop(0.7, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  return c;
}

function frostFrame(W: number, H: number): HTMLCanvasElement {
  const c = makeCanvas(W, H);
  const g = ctx2d(c);
  const d = Math.min(W, H) * 0.16;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const lg = g.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0, 'rgba(236,249,255,0.92)');
    lg.addColorStop(0.3, 'rgba(214,240,255,0.42)');
    lg.addColorStop(1, 'rgba(214,240,255,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, H);
  };
  edge(0, 0, d, 0);
  edge(W, 0, W - d, 0);
  edge(0, 0, 0, d);
  edge(0, H, 0, H - d);
  // Eisblumen an den Rändern
  const rnd = seededRandom(5);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineCap = 'round';
  const unit = Math.max(1, Math.min(W, H) / 700);
  const fern = (x: number, y: number, a: number, len: number, depth: number) => {
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    g.lineWidth = Math.max(0.6, depth * 0.55) * unit;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(ex, ey);
    g.stroke();
    if (depth > 0) {
      fern(x + (ex - x) * 0.5, y + (ey - y) * 0.5, a + 0.7, len * 0.5, depth - 1);
      fern(x + (ex - x) * 0.5, y + (ey - y) * 0.5, a - 0.7, len * 0.5, depth - 1);
      fern(ex, ey, a + (rnd() - 0.5) * 0.5, len * 0.6, depth - 1);
    }
  };
  for (let i = 0; i < 44; i++) {
    const side = i % 4;
    const t = rnd();
    const len = Math.min(d * 0.3, 34 * unit) * (0.5 + rnd() * 0.6);
    if (side === 0) fern(0, t * H, (rnd() - 0.5) * 1.2, len, 2);
    else if (side === 1) fern(W, t * H, Math.PI + (rnd() - 0.5) * 1.2, len, 2);
    else if (side === 2) fern(t * W, 0, Math.PI / 2 + (rnd() - 0.5) * 1.2, len, 2);
    else fern(t * W, H, -Math.PI / 2 + (rnd() - 0.5) * 1.2, len, 2);
  }
  return c;
}

/**
 * Landschaft einer Zeichenfläche in Gerätepixeln: Himmel, Sonne, Federwolken, drei Bergketten, Wolkenmeer und
 * vorbeiziehende Wolken. Die stehenden Teile werden zu einem Hintergrundbild zusammengesetzt, das nur bei
 * Kamerafahrt neu entsteht.
 */
export class Backdrop {
  readonly W: number;
  readonly H: number;
  private sun: HTMLCanvasElement;
  private layers: Layer[];
  private composite: HTMLCanvasElement;
  private key = '';
  readonly clouds: HTMLCanvasElement[];
  private fog: HTMLCanvasElement | null = null;
  private frost: HTMLCanvasElement | null = null;

  constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
    this.sun = sunSprite(Math.max(W, H) * 1.3);
    const haze: Rgb = [236, 222, 208];
    this.layers = [
      { img: cirrus(W, H * 0.35, 3), top: 0.04, k: 0.1 },
      { img: mountainLayer(W, H * 0.62, 11, { peak: 0.05, rough: 0.55, rock: [160, 174, 205], haze, snow: [241, 244, 250] }), top: 0.4, k: 0.07 },
      { img: mountainLayer(W, H * 0.55, 23, { peak: 0.12, rough: 0.5, rock: [124, 142, 180], haze: [228, 218, 210] }), top: 0.52, k: 0.14 },
      { img: cloudBank(W, H * 0.9, 41), top: 0.66, k: 0.22 },
      { img: mountainLayer(W, H * 0.45, 57, { peak: 0.2, rough: 0.45, rock: [84, 106, 140], haze: [214, 208, 206], trees: true }), top: 0.7, k: 0.36 },
    ];
    this.clouds = [cloudSprite(W * 0.5, W * 0.2, 101), cloudSprite(W * 0.42, W * 0.17, 202), cloudSprite(W * 0.6, W * 0.22, 303)];
    this.composite = makeCanvas(W, H);
  }

  /** Nebel-Textur (nahtlos in x), erst bei Bedarf gebacken. */
  fogTile(): HTMLCanvasElement {
    return (this.fog ??= fogTile(this.W, Math.max(64, this.H * 0.45)));
  }

  /** Raureif-Rahmen für Glatteis, erst bei Bedarf gebacken. */
  frostFrame(): HTMLCanvasElement {
    return (this.frost ??= frostFrame(this.W, this.H));
  }

  /** Hintergrund für Kamerahöhe `camY` bei `ppd` Gerätepixeln je Einheit. */
  image(camY: number, ppd: number): HTMLCanvasElement {
    const key = `${Math.round((camY - CAM_START) * ppd * 3)}|${ppd.toFixed(2)}`;
    if (key === this.key) return this.composite;
    this.key = key;
    const { W, H } = this;
    const g = ctx2d(this.composite);
    const rise = (camY - CAM_START) * ppd;
    // Himmel: das Fenster wandert mit der Höhe in tieferes Blau.
    const s = sky();
    const span = 1024 * 0.5;
    const shift = Math.min(1024 - span, Math.max(0, rise * 0.018 * (1024 / H) * 0.5));
    g.drawImage(s, 0, 1024 - span - 1024 * 0.02 - shift, 2, span, 0, 0, W, H);
    const S = this.sun.width;
    g.drawImage(this.sun, W * 0.84 - S / 2, H * 0.07 + rise * 0.04 - S / 2);
    for (const l of this.layers) {
      const y = H * l.top + rise * l.k;
      if (y >= H) continue;
      g.drawImage(l.img, 0, Math.round(y));
      // Unter dem Bild geht die Ebene in ihrer untersten Farbe weiter.
      const bottom = Math.round(y) + l.img.height;
      if (bottom < H) g.drawImage(l.img, 0, l.img.height - 1, W, 1, 0, bottom, W, H - bottom);
    }
    return this.composite;
  }
}
