import {
  formCells,
  formOutline,
  FX_GLUE,
  FX_TURBO,
  seededRandom,
  STONE_FALLING,
  STONE_GLUED,
  STONE_ICY,
  STONE_SHRUNK,
  STONE_SPECIAL,
  TOWER_BASE_HALF,
  TOWER_BEAM,
  TOWER_BEAM_HALF,
  type TowerStone,
} from '@quiz/shared';

/**
 * Zeichnet einen Hochstapler-Turm auf ein Canvas: Himmel mit Wolken in Parallaxe, Sockel, Höhenmarken,
 * leuchtende Ziellinie, Steine in der Spielerfarbe mit Glanzkante und weichem Schatten, dazu die Effekte.
 * Reine Funktionen, die Komponente liefert Szene, Kamera und Zeit.
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
}

const meters = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Höhe mit einer Nachkommastelle, deutsch geschrieben. */
export function formatMeters(h: number): string {
  return meters.format(h);
}

// ------------------------------------------------------------------ Farben

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Heller (amt > 0) oder dunkler (amt < 0). */
export function shade(hex: string, amt: number, alpha = 1): string {
  const [r, g, b] = parseHex(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const mix = (c: number) => Math.round(c + (t - c) * k);
  return `rgba(${mix(r)},${mix(g)},${mix(b)},${alpha})`;
}

// ---------------------------------------------------------------- Himmel

interface Cloud {
  x: number;
  y: number;
  s: number;
  a: number;
  puffs: { dx: number; dy: number; r: number }[];
}

const CLOUDS: Cloud[] = (() => {
  const rnd = seededRandom(20261118);
  return Array.from({ length: 22 }, (_, i) => {
    const s = 1 + rnd() * 1.6;
    return {
      x: -12 + rnd() * 24,
      y: 3 + i * 3.4 + rnd() * 2,
      s,
      a: 0.45 + rnd() * 0.35,
      puffs: Array.from({ length: 5 }, (_, k) => ({ dx: (k - 2) * 0.75 + (rnd() - 0.5) * 0.4, dy: (k === 1 || k === 3 ? 0.35 : 0) + (rnd() - 0.5) * 0.2, r: 0.7 + rnd() * 0.5 })),
    };
  });
})();

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number, camY: number, ppu: number, time: number): void {
  // Je höher, desto tiefer das Blau.
  const alt = Math.min(1, Math.max(0, camY / 40));
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `rgb(${Math.round(118 - 40 * alt)},${Math.round(176 - 40 * alt)},${Math.round(236 - 20 * alt)})`);
  sky.addColorStop(0.55, `rgb(${Math.round(178 - 40 * alt)},${Math.round(214 - 30 * alt)},${Math.round(245 - 10 * alt)})`);
  sky.addColorStop(1, '#eef6fd');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Weiches Sonnenlicht oben rechts.
  const sun = ctx.createRadialGradient(w * 0.85, h * 0.08, 0, w * 0.85, h * 0.08, Math.max(w, h) * 0.7);
  sun.addColorStop(0, 'rgba(255,248,225,0.75)');
  sun.addColorStop(0.25, 'rgba(255,244,214,0.25)');
  sun.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // Wolken in Parallaxe: Sie ziehen langsamer vorbei als der Turm und treiben leicht zur Seite.
  const k = 0.45;
  for (const c of CLOUDS) {
    const cy = h - (c.y - k * camY) * ppu * 0.8;
    const span = 26;
    const x = ((((c.x + time * 0.00012 * c.s + 13) % span) + span) % span) - 13;
    const cx = w / 2 + x * ppu * 0.8;
    const r0 = c.s * ppu * 0.8;
    if (cy < -r0 * 2 || cy > h + r0 * 2) continue;
    for (const p of c.puffs) {
      const px = cx + p.dx * r0;
      const py = cy + p.dy * r0;
      const r = p.r * r0;
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(255,255,255,${c.a})`);
      g.addColorStop(0.55, `rgba(255,255,255,${c.a * 0.55})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ferne Hügel nahe am Boden, ebenfalls mit Parallaxe.
  for (const [layer, kk, base, col] of [
    [0, 0.25, -1.2, 'rgba(176,206,232,0.85)'],
    [1, 0.5, -2.4, 'rgba(150,190,222,0.9)'],
  ] as const) {
    const y0 = h - (base - kk * camY) * ppu;
    if (y0 - 4 * ppu > h) continue;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const u = x / ppu;
      const yy = y0 - (Math.sin(u * 0.42 + layer * 2) * 0.9 + Math.sin(u * 0.17 + layer) * 1.4 + 1.6) * ppu * 0.6;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

// ----------------------------------------------------------------- Sockel

function drawBase(ctx: CanvasRenderingContext2D, color: string): void {
  const hw = TOWER_BASE_HALF;
  // Säule unter der Platte, leicht verjüngt, mit seitlichem Licht.
  const col = ctx.createLinearGradient(-hw, 0, hw, 0);
  col.addColorStop(0, '#f3efe7');
  col.addColorStop(0.45, '#e2dccf');
  col.addColorStop(1, '#bfb6a6');
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-hw + 0.45, -0.5);
  ctx.lineTo(hw - 0.45, -0.5);
  ctx.lineTo(hw - 0.8, -12);
  ctx.lineTo(-hw + 0.8, -12);
  ctx.closePath();
  ctx.fill();
  // Schatten der Platte auf der Säule.
  const sh = ctx.createLinearGradient(0, -0.5, 0, -1.6);
  sh.addColorStop(0, 'rgba(60,50,40,0.28)');
  sh.addColorStop(1, 'rgba(60,50,40,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(-hw + 0.45, -1.6, 2 * hw - 0.9, 1.1);

  // Platte: Front und Oberkante.
  const slab = ctx.createLinearGradient(0, 0, 0, -0.55);
  slab.addColorStop(0, '#faf8f3');
  slab.addColorStop(0.15, '#ebe6dc');
  slab.addColorStop(1, '#cfc7b8');
  ctx.fillStyle = slab;
  ctx.beginPath();
  ctx.roundRect(-hw - 0.08, -0.55, 2 * hw + 0.16, 0.55, 0.08);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(-hw - 0.02, -0.035, 2 * hw + 0.04, 0.035);
  // Feine Linie in der Spielerfarbe.
  ctx.fillStyle = shade(color, -0.05, 0.9);
  ctx.fillRect(-hw + 0.1, -0.36, 2 * hw - 0.2, 0.06);
}

// ------------------------------------------------------------- Höhenlinien

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, opts: { bg: string; fg: string; align: 'left' | 'right'; size: number }): void {
  ctx.font = `800 ${opts.size}px "Nunito Variable", system-ui, sans-serif`;
  const tw = ctx.measureText(text).width;
  const ph = opts.size + 8;
  const pw = tw + 14;
  const px = opts.align === 'left' ? x : x - pw;
  ctx.fillStyle = opts.bg;
  ctx.beginPath();
  ctx.roundRect(px, y - ph / 2, pw, ph, ph / 2);
  ctx.fill();
  ctx.fillStyle = opts.fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, px + 7, y + 0.5);
}

function drawMarks(ctx: CanvasRenderingContext2D, w: number, toY: (y: number) => number, scene: TowerScene, labels: boolean, s: number): void {
  for (const m of scene.marks) {
    const y = toY(m);
    const done = scene.reached.includes(m);
    ctx.strokeStyle = done ? 'rgba(40,110,70,0.28)' : 'rgba(25,55,105,0.26)';
    ctx.lineWidth = 1.2 * s;
    ctx.setLineDash([6 * s, 6 * s]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!labels) continue;
    pill(ctx, 6 * s, y, done ? `✓ ${m}` : `◆ ${m}`, { bg: done ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.9)', fg: done ? '#3f7d57' : '#b07a00', align: 'left', size: 10 * s });
  }
}

function drawGoal(ctx: CanvasRenderingContext2D, w: number, y: number, scene: TowerScene, time: number, s: number, labels: boolean): void {
  const band = 16 * s;
  const glow = ctx.createLinearGradient(0, y - band, 0, y + band);
  glow.addColorStop(0, 'rgba(255,205,80,0)');
  glow.addColorStop(0.5, scene.hold > 0 ? 'rgba(120,230,160,0.55)' : 'rgba(255,205,80,0.5)');
  glow.addColorStop(1, 'rgba(255,205,80,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, y - band, w, band * 2);

  ctx.save();
  ctx.shadowColor = 'rgba(255,190,40,0.9)';
  ctx.shadowBlur = 10 * s;
  ctx.strokeStyle = '#ffd25e';
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(w, y);
  ctx.stroke();
  ctx.restore();

  // Lichtreflex, der über die Linie wandert.
  const sx = ((time * 0.18) % (w + 240)) - 120;
  const sheen = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.95)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = sheen;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.moveTo(Math.max(0, sx - 90), y);
  ctx.lineTo(Math.min(w, sx + 90), y);
  ctx.stroke();

  if (scene.hold > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(40,200,120,0.9)';
    ctx.shadowBlur = 12 * s;
    ctx.strokeStyle = '#2fd18a';
    ctx.lineWidth = 4.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w * Math.min(1, scene.hold), y);
    ctx.stroke();
    ctx.restore();
  }
  if (labels) pill(ctx, w - 6 * s, y - 13 * s, scene.hold > 0 ? 'HALTEN' : 'ZIEL', { bg: scene.hold > 0 ? '#2fd18a' : '#ffcf4a', fg: scene.hold > 0 ? '#06351f' : '#4a3300', align: 'right', size: 10 * s });
}

// ------------------------------------------------------------------ Steine

const pathCache = new Map<string, Path2D>();
function formPath(form: number): Path2D {
  const key = String(form);
  let p = pathCache.get(key);
  if (!p) {
    p = new Path2D();
    for (const c of formCells(form)) p.roundRect(c.x - 0.5, c.y - 0.5, 1, 1, 0.14);
    pathCache.set(key, p);
  }
  return p;
}

function drawBeam(ctx: CanvasRenderingContext2D, st: TowerStone, s: number): void {
  const { w, h } = TOWER_BEAM_HALF;
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.shadowColor = 'rgba(20,30,60,0.35)';
  ctx.shadowBlur = 10 * s;
  ctx.shadowOffsetY = 3 * s;
  const g = ctx.createLinearGradient(0, h, 0, -h);
  g.addColorStop(0, '#6b7790');
  g.addColorStop(0.35, '#465269');
  g.addColorStop(1, '#2a3243');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-w, -h, 2 * w, 2 * h, 0.06);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(190,225,255,0.85)';
  ctx.fillRect(-w + 0.05, h - 0.05, 2 * w - 0.1, 0.035);
  ctx.fillStyle = 'rgba(200,215,235,0.75)';
  for (let x = -w + 0.35; x < w - 0.2; x += 0.7) {
    ctx.beginPath();
    ctx.arc(x, 0, 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStone(ctx: CanvasRenderingContext2D, st: TowerStone, color: string, fx: number, time: number, s: number): void {
  if (st.form === TOWER_BEAM) return drawBeam(ctx, st, s);
  const scale = st.flags & STONE_SHRUNK ? 0.7 : 1;
  const path = formPath(st.form);
  const a = st.a;
  // Weltoben in Steinkoordinaten, damit Licht immer von oben kommt.
  const ux = Math.sin(a);
  const uy = Math.cos(a);
  ctx.save();
  ctx.translate(st.x, st.y);
  ctx.rotate(a);
  ctx.scale(scale, scale);

  const falling = (st.flags & STONE_FALLING) !== 0;
  const fill = ctx.createLinearGradient(-ux * 1.8, -uy * 1.8, ux * 1.8, uy * 1.8);
  fill.addColorStop(0, shade(color, -0.3));
  fill.addColorStop(0.5, shade(color, 0));
  fill.addColorStop(1, shade(color, 0.32));
  ctx.shadowColor = 'rgba(25,40,80,0.28)';
  ctx.shadowBlur = 9 * s;
  ctx.shadowOffsetY = 4 * s;
  if (falling && fx & FX_GLUE) {
    ctx.shadowColor = 'rgba(255,170,20,0.95)';
    ctx.shadowBlur = 16 * s;
    ctx.shadowOffsetY = 0;
  }
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.shadowColor = 'transparent';

  // Glasiger Glanz in der oberen Hälfte.
  ctx.save();
  ctx.clip(path);
  const sheen = ctx.createLinearGradient(0, 0, ux * 1.6, uy * 1.6);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.22)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-3, -3, 6, 6);

  if (st.flags & STONE_SPECIAL) {
    // Spezialstein: goldener Schimmer, der über den Stein läuft.
    const t = ((time / 900) % 1) * 6 - 3;
    const band = ctx.createLinearGradient(t - 0.8, -1, t + 0.8, 1);
    band.addColorStop(0, 'rgba(255,230,140,0)');
    band.addColorStop(0.5, 'rgba(255,240,180,0.8)');
    band.addColorStop(1, 'rgba(255,230,140,0)');
    ctx.fillStyle = band;
    ctx.fillRect(-3, -3, 6, 6);
  }
  if (st.flags & STONE_ICY) {
    // Eis: kalter, heller Überzug mit wanderndem Schimmer.
    const frost = ctx.createLinearGradient(-ux * 1.6, -uy * 1.6, ux * 1.6, uy * 1.6);
    frost.addColorStop(0, 'rgba(170,220,255,0.18)');
    frost.addColorStop(1, 'rgba(235,250,255,0.5)');
    ctx.fillStyle = frost;
    ctx.fillRect(-3, -3, 6, 6);
    const t = ((time / 1400 + st.id * 0.37) % 1) * 7 - 3.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(t - 1.2, -2.5);
    ctx.lineTo(t + 1.2, 2.5);
    ctx.moveTo(t - 0.8, -2.5);
    ctx.lineTo(t + 1.6, 2.5);
    ctx.stroke();
  }
  ctx.restore();

  // Fugen zwischen den Quadraten, ganz zart.
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 0.035;
  for (const c of formCells(st.form)) {
    ctx.beginPath();
    ctx.roundRect(c.x - 0.41, c.y - 0.41, 0.82, 0.82, 0.08);
    ctx.stroke();
  }

  // Glanzkante oben, dunklere Kante unten.
  for (const [x1, y1, x2, y2, nx, ny] of formOutline(st.form)) {
    const wy = nx * Math.sin(a) + ny * Math.cos(a);
    const inset = 0.04;
    if (wy > 0.5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.78)';
      ctx.lineWidth = 0.075;
    } else if (wy < -0.5) {
      ctx.strokeStyle = shade(color, -0.55, 0.55);
      ctx.lineWidth = 0.07;
    } else {
      ctx.strokeStyle = shade(color, -0.45, 0.35);
      ctx.lineWidth = 0.05;
    }
    ctx.beginPath();
    ctx.moveTo(x1 - nx * inset, y1 - ny * inset);
    ctx.lineTo(x2 - nx * inset, y2 - ny * inset);
    ctx.stroke();
  }

  if (st.flags & STONE_GLUED) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,170,30,0.9)';
    ctx.shadowBlur = 8 * s;
    ctx.strokeStyle = 'rgba(255,184,40,0.95)';
    ctx.lineWidth = 0.07;
    ctx.stroke(path);
    ctx.restore();
  } else if (st.flags & STONE_SPECIAL) {
    ctx.strokeStyle = '#f7c948';
    ctx.lineWidth = 0.07;
    ctx.stroke(path);
  } else if (st.flags & STONE_ICY) {
    ctx.strokeStyle = 'rgba(205,240,255,0.95)';
    ctx.lineWidth = 0.05;
    ctx.stroke(path);
  }

  if (st.flags & STONE_SPECIAL) {
    // Funkelnder Stern auf dem Spezialstein.
    const c = formCells(st.form)[1] ?? { x: 0, y: 0 };
    const pulse = 0.85 + 0.15 * Math.sin(time / 180);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(-a);
    ctx.scale(0.32 * pulse, 0.32 * pulse);
    ctx.fillStyle = '#fff6d6';
    ctx.strokeStyle = '#d99a00';
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 1 : 0.32;
      const ang = (i / 8) * Math.PI * 2;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

/** Breite und Unterkante eines Steins in Weltkoordinaten. */
function stoneBounds(st: TowerStone): { minX: number; maxX: number; minY: number } {
  const scale = st.flags & STONE_SHRUNK ? 0.7 : 1;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  const ca = Math.cos(st.a);
  const sa = Math.sin(st.a);
  for (const c of formCells(st.form)) {
    for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
      const lx = (c.x + dx) * scale;
      const ly = (c.y + dy) * scale;
      const x = st.x + lx * ca - ly * sa;
      const y = st.y + lx * sa + ly * ca;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
    }
  }
  return { minX, maxX, minY };
}

/** Nebelbank über der oberen Turmhälfte: weiche Ränder, treibende Schwaden. `bottom`/`top` in Bildschirm-y. */
function drawFog(ctx: CanvasRenderingContext2D, w: number, bottom: number, top: number, time: number, s: number): void {
  const fade = 46 * s;
  const lo = bottom;
  const hi = Math.min(top, bottom - fade * 2);
  const g = ctx.createLinearGradient(0, lo, 0, hi - fade);
  const span = lo - (hi - fade);
  g.addColorStop(0, 'rgba(238,243,249,0)');
  g.addColorStop(Math.min(0.45, fade / span), 'rgba(238,243,249,0.94)');
  g.addColorStop(Math.max(0.55, 1 - fade / span), 'rgba(238,243,249,0.94)');
  g.addColorStop(1, 'rgba(238,243,249,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, hi - fade, w, span);
  for (let i = 0; i < 9; i++) {
    const px = ((i * 113 + time * 0.025 * (i % 2 ? 1 : -1)) % (w + 200) + w + 200) % (w + 200) - 100;
    const py = lo - ((i % 3) + 0.5) / 3 * (lo - hi);
    const r = (60 + (i % 3) * 22) * s;
    const pg = ctx.createRadialGradient(px, py, 0, px, py, r);
    pg.addColorStop(0, 'rgba(255,255,255,0.85)');
    pg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// -------------------------------------------------------------- Gesamtbild

/** Zeichnet die ganze Szene. `w`/`h` in CSS-Pixeln, `dpr` Pixeldichte, `time` aus performance.now(). */
export function drawTower(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, scene: TowerScene, cam: TowerCamera, time: number, dt: number, opts: DrawOptions): void {
  const ppu = Math.min(w / opts.worldWidth, opts.minVisible ? h / opts.minVisible : Infinity);
  const visible = h / ppu;
  const target = Math.max(-1.6, scene.height + opts.headroom - visible);
  if (!cam.ready) {
    cam.y = target;
    cam.ready = true;
  } else cam.y += (target - cam.y) * Math.min(1, dt / 450);
  const camY = cam.y;
  const toY = (y: number) => h - (y - camY) * ppu;
  /** Maßstab für Linien und Schrift, an der Breite ausgerichtet. */
  const s = Math.max(0.75, Math.min(1.6, w / 360));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky(ctx, w, h, camY, ppu, time);
  drawMarks(ctx, w, toY, scene, opts.labels, s);

  // Welt: y nach oben, eine Einheit = ein Steinquadrat.
  ctx.setTransform(dpr * ppu, 0, 0, -dpr * ppu, (dpr * w) / 2, dpr * (h + camY * ppu));
  drawBase(ctx, scene.color);

  // Fallhilfe: zarte Spur unter dem fallenden Stein.
  const falling = scene.stones.find((st) => st.flags & STONE_FALLING);
  if (falling) {
    const b = stoneBounds(falling);
    const g = ctx.createLinearGradient(0, b.minY, 0, Math.max(camY, b.minY - 9));
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(b.minX, Math.max(camY, b.minY - 9), b.maxX - b.minX, b.minY - Math.max(camY, b.minY - 9));
    if (scene.fx & FX_TURBO) {
      ctx.strokeStyle = 'rgba(255,120,60,0.55)';
      ctx.lineWidth = 0.06;
      for (let i = 0; i < 4; i++) {
        const x = b.minX + ((i + 0.5) / 4) * (b.maxX - b.minX);
        const off = ((time / 90 + i * 0.7) % 1) * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, falling.y + 1.2 + off);
        ctx.lineTo(x, falling.y + 2.6 + off);
        ctx.stroke();
      }
    }
  }

  for (const st of scene.stones) if (!(st.flags & STONE_FALLING)) drawStone(ctx, st, scene.color, scene.fx, time, s);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawGoal(ctx, w, toY(scene.goal), scene, time, s, opts.labels);
  if (scene.fog) drawFog(ctx, w, toY(scene.height * 0.5), toY(scene.height + 2.2), time, s);

  // Der fallende Stein bleibt auch im Nebel sichtbar, sonst wäre er nicht zu steuern.
  if (falling) {
    ctx.setTransform(dpr * ppu, 0, 0, -dpr * ppu, (dpr * w) / 2, dpr * (h + camY * ppu));
    drawStone(ctx, falling, scene.color, scene.fx, time, s);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Windstoß: Böen-Striche über den Turm.
  if (scene.gust && time - scene.gust.at < 1600) {
    const t = (time - scene.gust.at) / 1600;
    const alpha = Math.sin(Math.PI * t);
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * alpha})`;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const y = toY(scene.height * ((i + 0.5) / 9)) + Math.sin(i * 7) * 6;
      const len = (60 + (i % 3) * 30) * s;
      const x = scene.gust.dir > 0 ? -len + (w + len * 2) * ((t * 1.4 + i * 0.13) % 1) : w + len - (w + len * 2) * ((t * 1.4 + i * 0.13) % 1);
      ctx.lineWidth = (2 + (i % 2)) * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (len / 2) * scene.gust.dir, y - 6 * s, x + len * scene.gust.dir, y);
      ctx.stroke();
    }
  }

  if (scene.won) {
    const g = ctx.createRadialGradient(w / 2, toY(scene.goal), 0, w / 2, toY(scene.goal), w * 0.8);
    g.addColorStop(0, 'rgba(255,225,120,0.16)');
    g.addColorStop(1, 'rgba(255,225,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Einzelner Stein mittig, für die Vorschau. */
export function drawPreview(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, form: number, color: string, time: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const ppu = Math.min(w, h) / 3.6;
  ctx.setTransform(dpr * ppu, 0, 0, -dpr * ppu, (dpr * w) / 2, (dpr * h) / 2);
  drawStone(ctx, { id: 0, form, x: 0, y: 0, a: 0, flags: 0 }, color, 0, time, 0.6);
}
