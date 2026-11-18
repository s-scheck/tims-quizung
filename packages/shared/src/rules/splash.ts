/**
 * Splash!: Regeln für Kanone, Wind, Hindernisse, Fleckform und Flächenzählung.
 * Rein und deterministisch, damit Server und Clients dasselbe rechnen. Das Feld ist das Einheitsquadrat
 * von oben gesehen, x nach rechts, y nach unten. Die Kanone steht unten mittig vor dem Feld.
 */

import type { Point } from '../avatar.ts';

export type SplashMode = 'together' | 'turns';
export const SPLASH_MODES: readonly SplashMode[] = ['together', 'turns'];
export type SplashSpeed = 'slow' | 'medium' | 'fast';
export const SPLASH_SPEEDS: readonly SplashSpeed[] = ['slow', 'medium', 'fast'];
export type SplashAnswerSeconds = 0 | 10 | 20 | 30;
export const SPLASH_ANSWER_SECONDS: readonly SplashAnswerSeconds[] = [0, 10, 20, 30];
export const SPLASH_MAX_OBSTACLES = 3;
export const SPLASH_COUNT_MAX = 30;

/** Vom Host vor der Runde gewählt; der Raum merkt sich die letzte Wahl. */
export interface SplashOptions {
  mode: SplashMode;
  /** Fragen insgesamt (gleichzeitig) bzw. je Spieler (nacheinander). */
  count: number;
  answerSeconds: SplashAnswerSeconds;
  speed: SplashSpeed;
  countdown: boolean;
  wind: boolean;
  obstacles: number;
  reactions: boolean;
}

export const SPLASH_DEFAULTS: SplashOptions = {
  mode: 'together',
  count: 5,
  answerSeconds: 20,
  speed: 'medium',
  countdown: true,
  wind: false,
  obstacles: 0,
  reactions: true,
};

export function isSplashOptions(x: unknown): x is SplashOptions {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    SPLASH_MODES.includes(o.mode as SplashMode) &&
    Number.isInteger(o.count) &&
    (o.count as number) >= 1 &&
    (o.count as number) <= SPLASH_COUNT_MAX &&
    SPLASH_ANSWER_SECONDS.includes(o.answerSeconds as SplashAnswerSeconds) &&
    SPLASH_SPEEDS.includes(o.speed as SplashSpeed) &&
    typeof o.countdown === 'boolean' &&
    typeof o.wind === 'boolean' &&
    typeof o.reactions === 'boolean' &&
    Number.isInteger(o.obstacles) &&
    (o.obstacles as number) >= 0 &&
    (o.obstacles as number) <= SPLASH_MAX_OBSTACLES
  );
}

/** Zeit für einmal von Ende zu Ende des Zielbalkens, je Tempo. */
export const AIM_PERIOD_MS: Record<SplashSpeed, number> = { slow: 1800, medium: 1200, fast: 750 };
/** Balkenwert zum Zeitpunkt t (ms seit Start): läuft gleichmäßig hin und her zwischen 0 und 1. */
export function aimBarValue(t: number, speed: SplashSpeed): number {
  const period = AIM_PERIOD_MS[speed];
  const phase = (((t / period) % 2) + 2) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

export const SPLASH_COUNTDOWN_MS = 3000;
/** Flugzeit wächst mit der Weite: kurze Schüsse knallen, weite Schüsse fliegen einen Hauch länger. */
export const SPLASH_FLIGHT_BASE_MS = 300;
export const SPLASH_FLIGHT_PER_UNIT_MS = 380;
export const SPLASH_BOUNCE_MS = 320;
export function flightMs(distance: number): number {
  return Math.round(SPLASH_FLIGHT_BASE_MS + SPLASH_FLIGHT_PER_UNIT_MS * distance);
}
/** Pause nach der Landung, bevor der Nächste zielt (Reaktion der Figur). */
export const SPLASH_AFTER_LAND_MS = 1600;

// ------------------------------------------------------------------ Zufall

/** Deterministischer Zufall aus einer Ganzzahl (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ Kanone

export const CANNON: Point = { x: 0.5, y: 1.06 };
export const AIM_MAX_DEG = 60;
export const RANGE_MIN = 0.12;
export const RANGE_MAX = 1.2;

/** Ziel ohne Wind und Hindernisse: `power` und `aim` jeweils 0 bis 1, aim 0,5 ist geradeaus. */
export function aimToTarget(power: number, aim: number): Point {
  const angle = ((aim - 0.5) * 2 * AIM_MAX_DEG * Math.PI) / 180;
  const dist = RANGE_MIN + power * (RANGE_MAX - RANGE_MIN);
  return { x: CANNON.x + Math.sin(angle) * dist, y: CANNON.y - Math.cos(angle) * dist };
}

/** Wind als Verschiebung je Einheit Flugweite. */
export function windFor(seed: number): Point {
  const rnd = seededRandom(seed);
  const angle = rnd() * Math.PI * 2;
  const strength = 0.04 + rnd() * 0.14;
  return { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength };
}

/** Windstärke 1 bis 3 für die Anzeige. */
export function windLevel(wind: Point): number {
  const s = Math.hypot(wind.x, wind.y);
  return s < 0.08 ? 1 : s < 0.13 ? 2 : 3;
}

// ------------------------------------------------------------- Hindernisse

export interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

const OBSTACLE_ROWS: Record<number, number[]> = { 1: [0.5], 2: [0.36, 0.66], 3: [0.3, 0.52, 0.74] };
const OBSTACLE_PERIODS = [3.4, 4.3, 2.8];
const OBSTACLE_PHASES = [0, 2.1, 4.2];
export const OBSTACLE_W = 0.22;
export const OBSTACLE_H = 0.035;
const BALL_RADIUS = 0.012;

/** Pendelnde Balken zur Zeit `t` (ms seit Rundenstart), Mittelpunkt und Maße. */
export function obstaclesAt(n: number, t: number): Obstacle[] {
  const rows = OBSTACLE_ROWS[Math.max(0, Math.min(SPLASH_MAX_OBSTACLES, n))] ?? [];
  return rows.map((y, i) => ({
    x: 0.5 + 0.34 * Math.sin((2 * Math.PI * (t / 1000)) / OBSTACLE_PERIODS[i]! + OBSTACLE_PHASES[i]!),
    y,
    w: OBSTACLE_W,
    h: OBSTACLE_H,
  }));
}

// ------------------------------------------------------------------- Flug

export interface ShotInput {
  power: number;
  aim: number;
  wind: Point | null;
  obstacles: number;
  /** Abschuss in ms seit Rundenstart, für die Lage der Hindernisse. */
  firedAt: number;
}

export interface ShotResult {
  /** Kanone, ggf. Abprallpunkt, Landepunkt. */
  path: Point[];
  landing: Point;
  /** Flugzeit bis zur Landung. */
  durationMs: number;
  /** Anteil der Flugzeit bis zum Abprall (nur mit Abprall). */
  bounceAt: number | null;
  onField: boolean;
}

export function isOnField(p: Point): boolean {
  return p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
}

export function simulateShot(input: ShotInput): ShotResult {
  const aimed = aimToTarget(input.power, input.aim);
  const dist = Math.hypot(aimed.x - CANNON.x, aimed.y - CANNON.y);
  const target = input.wind ? { x: aimed.x + input.wind.x * dist, y: aimed.y + input.wind.y * dist } : aimed;
  const dx = target.x - CANNON.x;
  const dy = target.y - CANNON.y;
  const flight = flightMs(Math.hypot(dx, dy));

  // Die Kugel kreuzt die Balkenhöhen von unten nach oben, der erste getroffene Balken lenkt ab.
  const rows = obstaclesAt(input.obstacles, 0).map((o, i) => ({ y: o.y, i })).sort((a, b) => b.y - a.y);
  for (const row of rows) {
    if (dy === 0) break;
    const s = (row.y - CANNON.y) / dy;
    if (s <= 0 || s >= 1) continue;
    const hit = { x: CANNON.x + dx * s, y: row.y };
    const bar = obstaclesAt(input.obstacles, input.firedAt + s * flight)[row.i]!;
    if (Math.abs(hit.x - bar.x) > bar.w / 2 + BALL_RADIUS) continue;
    // Abprall: zurück nach unten, seitlich je nachdem, wo die Kugel den Balken trifft; halbe Restweite.
    const len = Math.hypot(dx, dy);
    const side = (hit.x - bar.x) / (bar.w / 2);
    const vx = dx / len + side * 0.6;
    const vy = -dy / len;
    const vlen = Math.hypot(vx, vy);
    const rest = (1 - s) * len * 0.5;
    const landing = { x: hit.x + (vx / vlen) * rest, y: hit.y + (vy / vlen) * rest };
    return {
      path: [CANNON, hit, landing],
      landing,
      durationMs: Math.round(s * flight) + SPLASH_BOUNCE_MS,
      bounceAt: Math.round(s * flight) / (Math.round(s * flight) + SPLASH_BOUNCE_MS),
      onField: isOnField(landing),
    };
  }
  return { path: [CANNON, target], landing: target, durationMs: flight, bounceAt: null, onField: isOnField(target) };
}

// ------------------------------------------------------------------- Fleck

/** Grundfläche eines Flecks als Anteil des Felds; je Fleck ±5 %. */
export const SPLASH_BASE_AREA = 0.03;
export const SPLASH_AREA_JITTER = 0.05;
const BLOB_POINTS = 48;

/** Ein Fleck als Polygone (Hauptfleck plus Tropfen) in Feldkoordinaten. */
export interface Blob {
  polygons: Point[][];
  area: number;
}

export function polygonArea(poly: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Unregelmäßiger Fleck mit Tropfen. Form und Fläche hängen nur von `seed` ab. */
export function blobFor(seed: number, center: Point): Blob {
  const rnd = seededRandom(seed);
  const target = SPLASH_BASE_AREA * (1 + (rnd() * 2 - 1) * SPLASH_AREA_JITTER);

  // Hauptfleck: Radius mit überlagerten Wellen, damit er nach Klecks und nicht nach Kreis aussieht.
  const waves = [2, 3, 4, 5, 7].map((k) => ({ k, amp: (0.05 + rnd() * 0.1) / Math.sqrt(k / 2), phase: rnd() * Math.PI * 2 }));
  const radii = Array.from({ length: BLOB_POINTS }, (_, i) => {
    const phi = (i / BLOB_POINTS) * Math.PI * 2;
    return 1 + waves.reduce((acc, w) => acc + w.amp * Math.sin(w.k * phi + w.phase), 0);
  });
  const rMax = Math.max(...radii);
  const main = radii.map((r, i) => {
    const phi = (i / BLOB_POINTS) * Math.PI * 2;
    return { x: Math.cos(phi) * r, y: Math.sin(phi) * r };
  });

  // Tropfen außerhalb des Hauptflecks, damit sich nichts doppelt zählt.
  const drops: Point[][] = [];
  const count = 3 + Math.floor(rnd() * 4);
  for (let d = 0; d < count; d++) {
    const phi = rnd() * Math.PI * 2;
    const rd = 0.08 + rnd() * 0.1;
    const dist = rMax * 1.06 + rd + rnd() * 0.45;
    const c = { x: Math.cos(phi) * dist, y: Math.sin(phi) * dist };
    drops.push(Array.from({ length: 12 }, (_, i) => ({ x: c.x + Math.cos((i / 12) * Math.PI * 2) * rd, y: c.y + Math.sin((i / 12) * Math.PI * 2) * rd })));
  }

  const unit = [main, ...drops];
  const area = unit.reduce((acc, p) => acc + polygonArea(p), 0);
  const scale = Math.sqrt(target / area);
  const polygons = unit.map((poly) => poly.map((p) => ({ x: center.x + p.x * scale, y: center.y + p.y * scale })));
  return { polygons, area: target };
}

// ----------------------------------------------------------------- Zählen

export const GRID_SIZE = 200;

export function emptyGrid(): Uint8Array {
  return new Uint8Array(GRID_SIZE * GRID_SIZE);
}

function inside(poly: readonly Point[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Malt den Fleck mit `owner` (1 bis 255) ins Raster. Spätere Flecken übermalen frühere, außerhalb des Felds zählt nichts. */
export function paintGrid(grid: Uint8Array, blob: Blob, owner: number): void {
  for (const poly of blob.polygons) {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) * GRID_SIZE));
    const x1 = Math.min(GRID_SIZE - 1, Math.ceil(Math.max(...xs) * GRID_SIZE));
    const y0 = Math.max(0, Math.floor(Math.min(...ys) * GRID_SIZE));
    const y1 = Math.min(GRID_SIZE - 1, Math.ceil(Math.max(...ys) * GRID_SIZE));
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        if (inside(poly, (gx + 0.5) / GRID_SIZE, (gy + 0.5) / GRID_SIZE)) grid[gy * GRID_SIZE + gx] = owner;
      }
    }
  }
}

/** Sichtbare Fläche je Besitzer in Prozent des Felds. */
export function coverage(grid: Uint8Array): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const owner of grid) if (owner) counts[owner] = (counts[owner] ?? 0) + 1;
  const total = GRID_SIZE * GRID_SIZE;
  return Object.fromEntries(Object.entries(counts).map(([o, c]) => [Number(o), (c / total) * 100]));
}
