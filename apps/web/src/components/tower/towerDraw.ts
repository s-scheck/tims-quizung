import {
  FX_ICE,
  FX_SHIELD,
  FX_TURBO,
  STONE_FALLING,
  STONE_GIANT,
  STONE_GLUED,
  STONE_ICY,
  STONE_PETRIFIED,
  STONE_SPECIAL,
  TOWER_BASE_HALF,
  TOWER_BEAM,
  TOWER_FORM_COUNT,
  TOWER_ROUND,
  TOWER_ROUND_RADIUS,
  type TowerStone,
} from '@quiz/shared';
import {
  bandStrip,
  beamSprite,
  bucketPx,
  css,
  formOutlinePath,
  glowSprite,
  hexRgb,
  lift,
  lightColumn,
  plinthSprite,
  roundSprites,
  shieldDome,
  softDot,
  stoneSprite,
  Backdrop,
  CAM_START,
  V_GLUED,
  V_ICY,
  V_SPECIAL,
  V_STONE,
  windStreak,
} from './towerArt.ts';
import { DARK_MAGIC, drawParticles, emit, FxState, observe, shakeOffset, step, stoneBoxes, stoneScale, type CellBox, type View } from './towerFx.ts';

export { GIANT_SCALE } from './towerFx.ts';

/**
 * Zeichnet einen Hochstapler-Turm: Landschaft mit Parallaxe (aus Offscreen-Bildern), Kalkstein-Sockel,
 * glasierte Steine als vorgebackene Bilder, Lineal am Rand, Ziellinie als Lichtband, Effekte und Partikel.
 * Die Kamera folgt mit kritisch gedämpften Federn. Der Zustand über die Bilder hinweg hängt an der Kamera.
 */

export interface TowerScene {
  stones: TowerStone[];
  height: number;
  goal: number;
  marks: number[];
  reached: number[];
  color: string;
  fx: number;
  /** Fortschritt der Ruheprüfung über der Linie, 0 bis 1. */
  hold: number;
  /** Nebel über der oberen Turmhälfte. */
  fog: boolean;
  /** Zeitpunkt (performance.now) und Richtung eines Windstoßes, für die Böen-Striche. */
  gust?: { at: number; dir: number } | null;
  /** Turm steht als Sieger. */
  won?: boolean;
}

export interface TowerCamera {
  y: number;
  ready: boolean;
  /** Effekt- und Kamerazustand dieser Zeichenfläche, legt `drawTower` selbst an. */
  fx?: FxState;
}

export interface DrawOptions {
  /** Sichtbare Breite in Steineinheiten. */
  worldWidth: number;
  /** Platz über der Turmspitze, den die Kamera freihält. */
  headroom: number;
  /** Feine Beschriftung (Höhenmarken) zeigen. */
  labels: boolean;
  /** Mindestens so viel Höhe zeigen (Fernseher: Sockel bis Ziellinie), notfalls wird kleiner gezeichnet. */
  minVisible?: number;
  /** Am unteren Rand verdeckt (CSS-Pixel, z. B. Zauberkarten): Die Kamera hebt den Turm darüber. */
  insetBottom?: number;
}

const meters = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Höhe mit einer Nachkommastelle, deutsch geschrieben. */
export function formatMeters(h: number): string {
  return meters.format(h);
}

/** Heller (amt > 0) oder dunkler (amt < 0). */
export function shade(hex: string, amt: number, alpha = 1): string {
  return css(lift(hexRgb(hex), amt), alpha);
}

const FONT = '"Nunito Variable", system-ui, sans-serif';
const HALF_PI = Math.PI / 2;
const INK = 'rgba(28,42,78,';

/** Gedämpfte Feder ohne Überschwingen (kritisch gedämpft), stabil auch bei großen Schritten. */
function smoothDamp(cur: number, target: number, vel: number, smooth: number, dtMs: number): [number, number] {
  const dt = Math.max(0.0001, dtMs / 1000);
  const omega = 2 / smooth;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  return [target + (change + temp) * exp, (vel - omega * temp) * exp];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const approach = (cur: number, target: number, dt: number, ms: number) => cur + (target - cur) * Math.min(1, dt / ms);

// ------------------------------------------------------------------ Steine

function variantOf(flags: number): number {
  let v = 0;
  if (flags & STONE_SPECIAL) v |= V_SPECIAL;
  if (flags & STONE_PETRIFIED) v |= V_STONE;
  else if (flags & STONE_ICY) v |= V_ICY;
  if (flags & STONE_GLUED) v |= V_GLUED;
  return v;
}

/**
 * Stein an Gerätepixel (X, Y) mit `ppd` Pixeln je Einheit. Die Viertelumdrehung steckt im Bild (Licht bleibt
 * oben), die Restdrehung macht die Transformation.
 */
function blitStone(ctx: CanvasRenderingContext2D, st: TowerStone, color: string, X: number, Y: number, ppd: number, scale: number): void {
  const variant = variantOf(st.flags);
  if (st.form === TOWER_BEAM) {
    const sp = beamSprite(bucketPx(ppd));
    const k = ppd / sp.px;
    const c = Math.cos(-st.a) * k;
    const s = Math.sin(-st.a) * k;
    ctx.setTransform(c, s, -s, c, X, Y);
    ctx.drawImage(sp.img, -sp.ox, -sp.oy);
    return;
  }
  const target = ppd * scale;
  const px = bucketPx(target);
  const k = target / px;
  if (st.form === TOWER_ROUND) {
    const rs = roundSprites(color, TOWER_ROUND_RADIUS, px, variant);
    ctx.setTransform(k, 0, 0, k, X, Y);
    ctx.drawImage(rs.base.img, -rs.base.ox, -rs.base.oy);
    const c = Math.cos(-st.a) * k;
    const s = Math.sin(-st.a) * k;
    ctx.setTransform(c, s, -s, c, X, Y);
    ctx.drawImage(rs.spin.img, -rs.spin.ox, -rs.spin.oy);
    ctx.setTransform(k, 0, 0, k, X, Y);
    ctx.drawImage(rs.gloss.img, -rs.gloss.ox, -rs.gloss.oy);
    return;
  }
  if (st.form < 0 || st.form >= TOWER_FORM_COUNT) return;
  const qi = Math.round(st.a / HALF_PI);
  const q = ((qi % 4) + 4) % 4;
  const r = st.a - qi * HALF_PI;
  const sp = stoneSprite(st.form, q, color, px, variant);
  const c = Math.cos(-r) * k;
  const s = Math.sin(-r) * k;
  ctx.setTransform(c, s, -s, c, X, Y);
  ctx.drawImage(sp.img, -sp.ox, -sp.oy);
}

/** Lichthof hinter einem Stein (Spezialstein golden, dunkle Magie violett). */
function blitGlow(ctx: CanvasRenderingContext2D, st: TowerStone, color: string, X: number, Y: number, ppd: number, scale: number): void {
  const target = ppd * scale;
  const px = bucketPx(Math.min(target, 72));
  const k = target / px;
  if (st.form === TOWER_ROUND) {
    const r = TOWER_ROUND_RADIUS * target * 1.5;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(softDot(color), X - r, Y - r, r * 2, r * 2);
    return;
  }
  if (st.form < 0 || st.form >= TOWER_FORM_COUNT || st.form === TOWER_BEAM) return;
  const qi = Math.round(st.a / HALF_PI);
  const q = ((qi % 4) + 4) % 4;
  const r = st.a - qi * HALF_PI;
  const sp = glowSprite(st.form, q, color, px);
  const c = Math.cos(-r) * k;
  const s = Math.sin(-r) * k;
  ctx.setTransform(c, s, -s, c, X, Y);
  ctx.drawImage(sp.img, -sp.ox, -sp.oy);
}

// --------------------------------------------------------------- Landepunkt

/** Wie weit der fallende Stein noch fällt, bis er etwas berührt; null, wenn er am Turm vorbeifällt. */
function dropDistance(falling: CellBox[], support: CellBox[]): number | null {
  let best: number | null = null;
  for (const f of falling) {
    const bottom = f.y - f.ey;
    let top = -Infinity;
    if (Math.abs(f.x) < TOWER_BASE_HALF + f.ex * 0.6) top = 0;
    for (const s of support) {
      const st = s.y + s.ey;
      if (st > bottom + 0.05 || st <= top) continue;
      if (Math.abs(f.x - s.x) < (f.ex + s.ex) * 0.92) top = st;
    }
    if (top === -Infinity) continue;
    const d = bottom - top;
    if (best === null || d < best) best = d;
  }
  return best === null ? null : Math.max(0, best);
}

// ------------------------------------------------------------- Gesamtbild

const passing = [
  { alt: 5, x: 0.15, k: 0.72, img: 0, speed: 1 },
  { alt: 10.5, x: 0.7, k: 0.78, img: 1, speed: 0.7 },
  { alt: 16, x: 0.35, k: 0.74, img: 2, speed: 1.2 },
  { alt: 22, x: 0.85, k: 0.8, img: 0, speed: 0.8 },
  { alt: 28, x: 0.05, k: 0.76, img: 1, speed: 1.1 },
  { alt: 35, x: 0.55, k: 0.8, img: 2, speed: 0.9 },
];

const sorted: TowerStone[] = [];
const boxes: CellBox[] = [];
const fallBoxes: CellBox[] = [];

/** Zeichnet die ganze Szene. `w`/`h` in CSS-Pixeln, `dpr` Pixeldichte, `time` aus performance.now(). */
export function drawTower(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, scene: TowerScene, cam: TowerCamera, time: number, dt: number, opts: DrawOptions): void {
  const st = (cam.fx ??= new FxState());
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  /** Maßstab für Linien und Schrift, an der Breite ausgerichtet. */
  const s = clamp(w / 360, 0.75, 1.6);
  const S = s * dpr;

  // Steine sortieren: unten zuerst, damit Schatten oberer Steine auf die unteren fallen.
  let falling: TowerStone | null = null;
  sorted.length = 0;
  boxes.length = 0;
  let spanX = 0;
  for (const stn of scene.stones) {
    if (stn.flags & STONE_FALLING) {
      falling = stn;
      continue;
    }
    sorted.push(stn);
    const before = boxes.length;
    stoneBoxes(stn, boxes);
    if (stn.y > -0.5 && stn.form !== TOWER_BEAM) for (let i = before; i < boxes.length; i++) spanX = Math.max(spanX, Math.abs(boxes[i]!.x) + boxes[i]!.ex);
  }
  sorted.sort((a, b) => a.y - b.y);

  // Kamera: Zoom weich nach Breite und Höhe des Turms, Höhe weich zur Spitze.
  const zt = clamp(Math.max(1 + 0.15 * clamp(scene.height / Math.max(1, scene.goal), 0, 1), (2 * (spanX + 1.3)) / opts.worldWidth), 1, 1.6);
  if (!cam.ready) st.zoom = zt;
  else [st.zoom, st.vz] = smoothDamp(st.zoom, zt, st.vz, 0.7, dt);
  const ppu = Math.min(w / (opts.worldWidth * st.zoom), opts.minVisible ? h / opts.minVisible : Infinity);
  const visible = h / ppu;
  const target = Math.max(CAM_START - (opts.insetBottom ?? 0) / ppu, scene.height + opts.headroom - visible);
  if (!cam.ready) {
    cam.y = target;
    st.vy = 0;
    cam.ready = true;
  } else [cam.y, st.vy] = smoothDamp(cam.y, target, st.vy, 0.38, dt);
  const camY = cam.y;
  const ppd = ppu * dpr;

  // Ereignisse und Partikel
  observe(st, { stones: scene.stones, fx: scene.fx, reached: scene.reached, gust: scene.gust, won: !!scene.won, height: scene.height, color: scene.color, time, s, w, h });
  const gustT = scene.gust ? (time - scene.gust.at) / 1600 : 2;
  step(st, dt, gustT < 1 ? (scene.gust?.dir ?? 0) : 0);
  emit(st, { won: !!scene.won, w, h, s, dt, specials: sorted.filter((x) => x.flags & STONE_SPECIAL) });
  st.fogA = approach(st.fogA, scene.fog ? 1 : 0, dt, 350);
  st.iceA = approach(st.iceA, scene.fx & FX_ICE ? 1 : 0, dt, 400);
  st.shieldA = approach(st.shieldA, scene.fx & FX_SHIELD ? 1 : 0, dt, 300);
  st.holdA = scene.hold > st.holdA ? approach(st.holdA, scene.hold, dt, 120) : approach(st.holdA, scene.hold, dt, 250);
  st.goalA = approach(st.goalA, scene.won ? 1 : 0, dt, 500);

  const [shx, shy] = shakeOffset(st, time);
  const sx = shx * dpr;
  const sy = shy * dpr;
  const X = (x: number) => W / 2 + x * ppd + sx;
  const Y = (y: number) => H - (y - camY) * ppd + sy;
  const view: View = { W, H, ppd, dpr, camY, sx, sy };

  // Landschaft
  if (!st.backdrop || st.backdrop.W !== W || st.backdrop.H !== H) st.backdrop = new Backdrop(W, H);
  const bd = st.backdrop;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(bd.image(camY, ppd), 0, 0);
  for (const c of passing) {
    const img = bd.clouds[c.img]!;
    const y = H - (c.alt - c.k * (camY - CAM_START)) * ppd * 0.8 - img.height * 0.5;
    if (y > H || y + img.height < 0) continue;
    const span = W + img.width;
    const x = ((((c.x * span + time * 0.004 * dpr * c.speed) % span) + span) % span) - img.width;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(img, x, y);
  }
  ctx.globalAlpha = 1;

  // Sockel
  const pl = plinthSprite(bucketPx(ppd), scene.color);
  const pk = ppd / pl.px;
  ctx.setTransform(pk, 0, 0, pk, X(0), Y(0));
  ctx.drawImage(pl.img, -pl.ox, -pl.oy);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Feine Linien der offenen Höhenmarken hinter dem Turm
  for (const m of scene.marks) {
    if (scene.reached.includes(m)) continue;
    const y = Math.round(Y(m)) + 0.5;
    if (y < 0 || y > H) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(0, y - dpr, W, dpr);
    ctx.fillStyle = `${INK}0.07)`;
    ctx.fillRect(0, y, W, dpr);
  }
  // Aufblitzen erreichter Marken
  for (const [m, at] of st.markFlash) {
    const t = (time - at) / 900;
    if (t >= 1) {
      st.markFlash.delete(m);
      continue;
    }
    const y = Y(m);
    const band = bandStrip('#ffe7a6', 0.9, 'band');
    ctx.globalAlpha = Math.sin(Math.PI * t);
    ctx.drawImage(band, 0, y - 14 * S, W, 28 * S);
    const x = t * (W + 200 * S) - 100 * S;
    ctx.drawImage(softDot('#fff4d6'), x - 60 * S, y - 6 * S, 120 * S, 12 * S);
    ctx.globalAlpha = 1;
  }

  // Ziellinie: Lichtband hinter dem Turm
  const gy = Y(scene.goal);
  const goalColor = st.holdA > 0.01 ? '#7ff0b4' : '#ffd36b';
  ctx.drawImage(bandStrip(goalColor, 0.55 + 0.35 * st.goalA, 'band'), 0, gy - 22 * S, W, 44 * S);

  // Fallhilfe: Lichtsäule bis zum Landepunkt und die Silhouette dort
  fallBoxes.length = 0;
  let drop: number | null = null;
  if (falling) {
    stoneBoxes(falling, fallBoxes);
    drop = dropDistance(fallBoxes, boxes);
    let minX = Infinity;
    let maxX = -Infinity;
    let bottom = Infinity;
    for (const b of fallBoxes) {
      minX = Math.min(minX, b.x - b.ex);
      maxX = Math.max(maxX, b.x + b.ex);
      bottom = Math.min(bottom, b.y - b.ey);
    }
    const yTop = Y(bottom);
    const yBot = drop === null ? H : Y(bottom - drop);
    if (yBot > yTop) {
      ctx.globalAlpha = drop === null ? 0.1 : 0.2;
      ctx.drawImage(lightColumn(), X(minX) - 4 * S, yTop, X(maxX) - X(minX) + 8 * S, yBot - yTop);
      ctx.globalAlpha = 1;
    }
    if (drop !== null && drop > 0.15 && st.fogA < 0.5) {
      const sc = stoneScale(falling.flags);
      const gx = X(falling.x);
      const gyy = Y(falling.y - drop);
      const k = sc * ppd;
      const ca = Math.cos(falling.a);
      const sa = Math.sin(falling.a);
      ctx.setTransform(k * ca, -k * sa, -k * sa, -k * ca, gx, gyy);
      ctx.lineWidth = (1.6 * dpr) / k;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.setLineDash([(5 * dpr) / k, (4 * dpr) / k]);
      ctx.lineDashOffset = -time / 40 / k;
      if (falling.form === TOWER_ROUND) {
        ctx.beginPath();
        ctx.arc(0, 0, TOWER_ROUND_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (falling.form !== TOWER_BEAM) {
        const path = formOutlinePath(falling.form);
        ctx.fill(path);
        ctx.stroke(path);
      }
      ctx.setLineDash([]);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Leuchten auf der Auflage
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      const lw = X(maxX) - X(minX);
      ctx.drawImage(softDot('#fff4d6'), X(minX) - lw * 0.15, Y(bottom - drop) - 6 * S, lw * 1.3, 12 * S);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  // Ruhende Steine mit Spuren, Lichthöfen und Schimmer
  for (const stn of sorted) {
    const tr = st.tracks.get(stn.id);
    let scale = stoneScale(stn.flags);
    const sAt = st.shrinkAt.get(stn.id);
    if (sAt !== undefined) {
      const t = (time - sAt) / 380;
      if (t >= 1) st.shrinkAt.delete(stn.id);
      else scale = 1 + (scale - 1) * (1 - Math.pow(1 - t, 3)) + Math.sin(t * Math.PI) * 0.08;
    }
    if (tr && tr.trail.length) {
      tr.trail.forEach((p, i) => {
        ctx.globalAlpha = 0.22 / (i + 1);
        blitStone(ctx, { ...stn, x: p.x, y: p.y, a: p.a }, scene.color, X(p.x), Y(p.y), ppd, scale);
      });
      ctx.globalAlpha = 1;
    }
    if (stn.flags & STONE_SPECIAL) {
      ctx.globalAlpha = 0.45 + 0.25 * Math.sin(time / 260 + stn.id);
      blitGlow(ctx, stn, '#ffd36b', X(stn.x), Y(stn.y), ppd, scale);
      ctx.globalAlpha = 1;
    }
    blitStone(ctx, stn, scene.color, X(stn.x), Y(stn.y), ppd, scale);
    if (stn.flags & STONE_ICY && !(stn.flags & STONE_PETRIFIED)) {
      // Eisglanz wandert über den Stein
      const t = ((time / 1500 + stn.id * 0.37) % 1.6) - 0.3;
      if (t > 0 && t < 1) {
        const ca = Math.cos(stn.a);
        const sa = Math.sin(stn.a);
        const u = (t - 0.5) * 2.4;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.sin(Math.PI * t) * 0.6;
        const r = 0.35 * ppd;
        ctx.drawImage(softDot('#e8f8ff'), X(stn.x + u * ca) - r, Y(stn.y + u * sa) - r, r * 2, r * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Geister: herunterfallende Steine und weggezauberte, die sich auflösen
  for (const g of st.ghosts) {
    const f = g.age / g.life;
    const sc = stoneScale(g.st.flags) * (g.mode === 'vanish' ? 1 + f * 0.35 : 1);
    ctx.globalAlpha = g.mode === 'vanish' ? (1 - f) * (1 - f) : 1 - f * f;
    blitStone(ctx, g.st, scene.color, X(g.st.x), Y(g.st.y), ppd, sc);
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  drawParticles(ctx, st, view, 'world');

  // Dunst im Tal: der Schaft des Sockels verliert sich unten.
  const mistTop = Y(-0.35);
  if (mistTop < H) {
    const mist = bandStrip('#ecdccb', 0.95, 'rise');
    const mb = Y(-2.4);
    ctx.drawImage(mist, 0, mistTop, W, mb - mistTop);
    if (mb < H) {
      ctx.fillStyle = 'rgba(236,220,203,0.95)';
      ctx.fillRect(0, mb, W, H - mb);
    }
  }


  // Nebel über der oberen Turmhälfte
  if (st.fogA > 0.01) {
    const yb = Y(scene.height * 0.5) + 30 * S;
    const yt = Y(scene.height + 2.6) - 40 * S;
    if (yb > yt) {
      ctx.globalAlpha = st.fogA;
      ctx.drawImage(bandStrip('#edf1f7', 0.93, 'plateau'), 0, yt, W, yb - yt);
      const tile = bd.fogTile();
      for (const [speed, off, a] of [[0.012, 0, 0.9], [-0.02, 0.4, 0.7]] as const) {
        const x = ((((time * speed * dpr + off * W) % W) + W) % W) - W;
        ctx.globalAlpha = st.fogA * a;
        ctx.drawImage(tile, x, yt, W, yb - yt);
        ctx.drawImage(tile, x + W, yt, W, yb - yt);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Ziellinie vorne (auch über dem Nebel): feine Lichtkante, Halte-Fortschritt, Wimpel
  drawGoal(ctx, st, scene, W, gy, S, dpr, time, opts.labels);

  // Der fallende Stein bleibt auch im Nebel sichtbar, sonst wäre er nicht zu steuern.
  if (falling) {
    const sc = stoneScale(falling.flags);
    const fx = X(falling.x);
    const fy = Y(falling.y);
    if (scene.fx & FX_TURBO) {
      // Fahrtstreifen nach oben
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      let minX = Infinity;
      let maxX = -Infinity;
      for (const b of fallBoxes) {
        minX = Math.min(minX, b.x - b.ex);
        maxX = Math.max(maxX, b.x + b.ex);
      }
      for (let i = 0; i < 9; i++) {
        const u = (i * 0.618) % 1;
        const x = X(minX - 0.4) + u * (X(maxX + 0.4) - X(minX - 0.4));
        const len = (40 + (i % 3) * 25) * S;
        const off = ((time * 0.9 * dpr + i * 53 * S) % (160 * S)) - 30 * S;
        const y0 = fy - off - len;
        ctx.globalAlpha = 0.5 * (1 - off / (130 * S));
        ctx.fillStyle = i % 2 ? '#ffffff' : '#d6c8ff';
        ctx.fillRect(x, y0, Math.max(1, 1.4 * S), len);
      }
      ctx.globalAlpha = 1;
    }
    if (falling.flags & (STONE_SPECIAL | STONE_GIANT) || falling.form === TOWER_ROUND) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time / 200);
      blitGlow(ctx, falling, falling.flags & STONE_SPECIAL ? '#ffd36b' : DARK_MAGIC[1], fx, fy, ppd, sc);
      ctx.globalAlpha = 1;
    }
    blitStone(ctx, falling, scene.color, fx, fy, ppd, sc);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Schutzschild: flache Lichtkuppel über der Turmspitze
  if (st.shieldA > 0.01) {
    const grow = clamp((time - st.shieldAt) / 600, 0, 1);
    const e = 1 - Math.pow(1 - grow, 3);
    const half = Math.max(3.4, spanX + 1.4) * (0.7 + 0.3 * e);
    const dw = half * 2 * ppd;
    const dh = half * 0.62 * ppd;
    const base = Y(Math.max(0.5, scene.height) + 0.5) + dh * 0.55;
    ctx.globalAlpha = st.shieldA * e * (0.82 + 0.18 * Math.sin(time / 520));
    ctx.drawImage(shieldDome(), X(0) - dw / 2, base - dh, dw, dh);
    // Lichtpunkt, der über die Kuppel wandert
    const t = ((time / 2400) % 1) * Math.PI;
    const gx = X(0) - Math.cos(t) * dw * 0.47;
    const gy2 = base - Math.sin(t) * dh * 0.95;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = st.shieldA * e * 0.85 * Math.sin(t);
    ctx.drawImage(softDot('#fff1c4'), gx - 12 * S, gy2 - 12 * S, 24 * S, 24 * S);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // Windstoß: Streifen in Windrichtung
  if (scene.gust && gustT >= 0 && gustT < 1) {
    const dir = scene.gust.dir;
    const img = windStreak();
    const fade = Math.sin(Math.PI * gustT);
    for (let i = 0; i < 10; i++) {
      const yy = Y(Math.max(0.5, scene.height) * ((i + 0.5) / 10)) + Math.sin(i * 7) * 10 * S;
      const len = (90 + (i % 3) * 50) * S;
      const p = (gustT * 1.5 + i * 0.13) % 1;
      const x = -len + (W + len * 2) * p;
      ctx.globalAlpha = 0.75 * fade;
      ctx.setTransform(dir * (len / img.width), 0, 0, (14 * S) / img.height, dir > 0 ? x : W - x, yy);
      ctx.drawImage(img, 0, -img.height / 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  // Glatteis: Raureif am Rand
  if (st.iceA > 0.01) {
    ctx.globalAlpha = st.iceA;
    ctx.drawImage(bd.frostFrame(), 0, 0);
    ctx.globalAlpha = 1;
  }

  drawRuler(ctx, scene, st, Y, camY, ppd, H, S, dpr, opts.labels, time);
  drawParticles(ctx, st, view, 'screen');

  if (st.goalA > 0.01) {
    // Warmer Schein über der Siegerlinie
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25 * st.goalA;
    ctx.drawImage(softDot('#ffd36b'), -W * 0.2, gy - H * 0.4, W * 1.4, H * 0.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}

function drawGoal(ctx: CanvasRenderingContext2D, st: FxState, scene: TowerScene, W: number, y: number, S: number, dpr: number, time: number, labels: boolean): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (y < -40 * S || y > ctx.canvas.height + 40 * S) return;
  const hold = st.holdA;
  // Feine Kernlinie
  ctx.fillStyle = 'rgba(255,246,214,0.95)';
  ctx.fillRect(0, y - 0.75 * S, W, 1.5 * S);
  ctx.fillStyle = 'rgba(150,100,10,0.25)';
  ctx.fillRect(0, y + 0.75 * S, W, Math.max(1, 0.6 * S));
  // Lichtreflex wandert über die Linie
  const sx = ((time * 0.16 * dpr) % (W + 300 * S)) - 150 * S;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(softDot('#fff4d6'), sx - 80 * S, y - 4 * S, 160 * S, 8 * S);
  // Halten: Linie lädt sich von beiden Seiten zur Mitte grün auf
  if (hold > 0.01) {
    const len = (W / 2) * Math.min(1, hold);
    ctx.globalAlpha = 0.9;
    const band = bandStrip('#5ef0a4', 0.9, 'band');
    ctx.drawImage(band, 0, y - 9 * S, len, 18 * S);
    ctx.drawImage(band, W - len, y - 9 * S, len, 18 * S);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#c9ffe2';
    ctx.fillRect(0, y - 1.2 * S, len, 2.4 * S);
    ctx.fillRect(W - len, y - 1.2 * S, len, 2.4 * S);
    for (const x of [len, W - len]) ctx.drawImage(softDot('#e6fff1'), x - 10 * S, y - 10 * S, 20 * S, 20 * S);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Wimpel am rechten Rand
  const px = W - 16 * S;
  const pole = 26 * S;
  ctx.fillStyle = 'rgba(70,52,20,0.75)';
  ctx.fillRect(px - 0.8 * S, y - pole, 1.6 * S, pole);
  ctx.fillStyle = '#fff4d6';
  ctx.beginPath();
  ctx.arc(px, y - pole, 2 * S, 0, Math.PI * 2);
  ctx.fill();
  const wave = Math.sin(time / 260) * 2 * S;
  const flagCol = scene.won ? '#ffcf4a' : hold > 0.01 ? '#36c98a' : '#f2b934';
  ctx.fillStyle = flagCol;
  ctx.beginPath();
  ctx.moveTo(px - 0.8 * S, y - pole + 1 * S);
  ctx.quadraticCurveTo(px - 9 * S, y - pole + 3 * S + wave, px - 18 * S, y - pole + 6 * S + wave * 1.5);
  ctx.quadraticCurveTo(px - 9 * S, y - pole + 9 * S + wave, px - 0.8 * S, y - pole + 12 * S);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.moveTo(px - 0.8 * S, y - pole + 1 * S);
  ctx.quadraticCurveTo(px - 9 * S, y - pole + 3 * S + wave, px - 18 * S, y - pole + 6 * S + wave * 1.5);
  ctx.quadraticCurveTo(px - 9 * S, y - pole + 5 * S + wave, px - 0.8 * S, y - pole + 5 * S);
  ctx.closePath();
  ctx.fill();

  if (!labels) {
    if (hold > 0.01) ring(ctx, px - 30 * S, y - 14 * S, 7 * S, hold, S);
    return;
  }
  ctx.font = `800 ${10.5 * S}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'right';
  const text = hold > 0.01 ? `HALTEN ${formatMeters(Math.max(0, 3 * (1 - hold)))} s` : scene.won ? 'GESCHAFFT' : `ZIEL ${scene.goal} m`;
  const tx = px - 24 * S;
  const ty = y - 6 * S;
  ctx.fillStyle = 'rgba(40,30,10,0.25)';
  ctx.fillText(text, tx + 0.6 * S, ty + 0.8 * S);
  ctx.fillStyle = hold > 0.01 ? '#0d5c39' : '#5b3d00';
  ctx.fillText(text, tx, ty);
  if (hold > 0.01) {
    const tw = ctx.measureText(text).width;
    ring(ctx, tx - tw - 12 * S, ty - 4 * S, 6.5 * S, hold, S);
  }
}

/** Kleiner Fortschrittsring. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, f: number, S: number): void {
  ctx.lineWidth = 2.2 * S;
  ctx.strokeStyle = 'rgba(13,92,57,0.25)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#1fbf77';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, -HALF_PI, -HALF_PI + Math.PI * 2 * Math.min(1, f));
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Lineal am linken Rand: Meter-Striche, Marken mit Zahl, Marke für die aktuelle Turmhöhe. */
function drawRuler(ctx: CanvasRenderingContext2D, scene: TowerScene, st: FxState, Y: (y: number) => number, camY: number, ppd: number, H: number, S: number, dpr: number, labels: boolean, time: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `${INK}0.30)`;
  const hi = camY + H / ppd + 1;
  for (let m = Math.max(0, Math.floor(camY)); m <= hi; m++) {
    const y = Y(m);
    const big = m % 3 === 0;
    ctx.fillRect(0, Math.round(y), (big ? 9 : 5) * S, Math.max(1, dpr * 0.75));
  }
  // Marken
  ctx.font = `800 ${9.5 * S}px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const m of scene.marks) {
    const y = Y(m);
    if (y < -10 || y > H + 10) continue;
    const done = scene.reached.includes(m);
    const flash = st.markFlash.get(m);
    const pop = flash !== undefined ? 1 + 0.6 * Math.sin(Math.min(1, (time - flash) / 400) * Math.PI) : 1;
    let x = 12 * S;
    if (labels) {
      const t = String(m);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 * S;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.strokeText(t, x, y);
      ctx.fillStyle = done ? `${INK}0.45)` : `${INK}0.78)`;
      ctx.fillText(t, x, y);
      x += ctx.measureText(t).width + 4 * S;
    }
    if (done) {
      ctx.fillStyle = 'rgba(38,150,98,0.75)';
      ctx.beginPath();
      ctx.arc(x + 2.5 * S, y, 2.4 * S * pop, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Kleine goldene Raute: hier gibt es Magie
      const r = 3.6 * S;
      ctx.fillStyle = '#e8a91c';
      ctx.beginPath();
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x + 2 * r, y);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff1c4';
      ctx.beginPath();
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x + 1.5 * r, y - r * 0.5);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + 0.5 * r, y - r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Aktuelle Höhe: kleiner Pfeil in der Spielerfarbe
  const hy = Y(scene.height);
  if (hy > 0 && hy < H && scene.height > 0.2) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, hy - 6 * S);
    ctx.lineTo(8 * S, hy);
    ctx.lineTo(0, hy + 6 * S);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = scene.color;
    ctx.beginPath();
    ctx.moveTo(0, hy - 4.2 * S);
    ctx.lineTo(5.6 * S, hy);
    ctx.lineTo(0, hy + 4.2 * S);
    ctx.closePath();
    ctx.fill();
  }
}

/** Einzelner Stein mittig, für die Vorschau. */
export function drawPreview(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, form: number, color: string, time: number): void {
  void time;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const ppd = (Math.min(w, h) / 3.6) * dpr;
  blitStone(ctx, { id: 0, form, x: 0, y: 0, a: 0, flags: 0 }, color, (w * dpr) / 2, (h * dpr) / 2, ppd, 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
