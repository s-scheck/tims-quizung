/**
 * Dungeon: Geometrie und Steine für die Szene, rein gerechnet in echten Pixeln (kein Verzerren bei beliebigem
 * Seitenverhältnis). Alles mit festem Zufall je Raum, damit die Wand bei jedem Zeichnen gleich aussieht.
 */

export interface SceneGeo {
  w: number;
  h: number;
  /** Linie, an der Wand und Boden sich treffen. */
  hy: number;
  /** Türbreite, Türhöhe (mit Rundbogen), Stärke des Steinrahmens. */
  dw: number;
  dh: number;
  fw: number;
  slot: number;
  pad: number;
  /** Höhe des Schilds über der Tür. */
  ph: number;
  /** Fluchtpunkt für die Bodenfugen. */
  vpx: number;
  vpy: number;
  /** Fußlinie der vorderen Reihe. */
  front: number;
}

/** Türen, Wand und Boden für eine Fläche von `w`×`h` px mit `n` Türen. */
export function sceneGeo(w: number, h: number, n: number, compact: boolean): SceneGeo {
  const pad = w * (compact ? 0.05 : 0.045);
  const slot = (w - 2 * pad) / n;
  const ph = compact ? Math.max(11, h * 0.085) : Math.min(54, Math.max(40, h * 0.11));
  const top = h * 0.045 + ph + (compact ? 3 : 6);
  const hyMax = h * (compact ? 0.62 : 0.6);
  const ratio = 1.6;
  const dw = Math.min(slot * (compact ? 0.66 : 0.64), (hyMax - top) / ratio);
  const dh = dw * ratio;
  // Hohe Flächen (Handy hochkant): Türreihe bleibt oben, der Boden wird tiefer statt die Wand leer.
  const hy = Math.max(h * (compact ? 0.5 : 0.32), top + dh);
  const fw = Math.max(2.5, dw * 0.14);
  const vpy = hy - (h - hy) * 1.1;
  const front = h - Math.max(4, (h - hy) * 0.07);
  return { w, h, hy, dw, dh, fw, slot, pad, ph, vpx: w / 2, vpy, front };
}

export const doorCx = (g: SceneGeo, i: number) => g.pad + (i + 0.5) * g.slot;
export const doorTop = (g: SceneGeo) => g.hy - g.dh;

/** Umriss der Türöffnung: gerade Laibung, oben Rundbogen. */
export function archPath(cx: number, bottom: number, w: number, h: number): string {
  const r = w / 2;
  const l = cx - r;
  const rt = cx + r;
  const yr = bottom - h + r;
  return `M${l} ${bottom}V${yr}A${r} ${r} 0 0 1 ${rt} ${yr}V${bottom}Z`;
}

/** Bogensteine um die Öffnung (Keilsteine im Bogen, Quader an den Seiten). */
export function archStones(cx: number, bottom: number, w: number, h: number, fw: number): { d: string; shade: number }[] {
  const r = w / 2;
  const R = r + fw;
  const yr = bottom - h + r;
  const out: { d: string; shade: number }[] = [];
  const k = 7;
  for (let i = 0; i < k; i++) {
    const a0 = Math.PI + (i / k) * Math.PI;
    const a1 = Math.PI + ((i + 1) / k) * Math.PI;
    const big = i === (k - 1) / 2 ? 1.25 : 1;
    const p = (a: number, rad: number) => `${cx + Math.cos(a) * rad} ${yr + Math.sin(a) * rad}`;
    out.push({ d: `M${p(a0, r)}L${p(a0, r + (R - r) * big)}L${p(a1, r + (R - r) * big)}L${p(a1, r)}Z`, shade: i === (k - 1) / 2 ? 0.1 : ((i * 37) % 5) / 40 });
  }
  // Seitliche Quader, abwechselnd breit und schmal (verzahnt).
  const jamb = bottom - yr;
  const rows = Math.max(2, Math.round(jamb / (fw * 1.5)));
  const rh = jamb / rows;
  for (let j = 0; j < rows; j++) {
    const y0 = yr + j * rh;
    const wide = j % 2 === 0 ? fw * 1.35 : fw;
    out.push({ d: `M${cx - r - wide} ${y0}H${cx - r}V${y0 + rh}H${cx - r - wide}Z`, shade: ((j * 13) % 4) / 40 });
    const wide2 = j % 2 === 1 ? fw * 1.35 : fw;
    out.push({ d: `M${cx + r} ${y0}H${cx + r + wide2}V${y0 + rh}H${cx + r}Z`, shade: ((j * 7) % 4) / 40 });
  }
  return out;
}

/** Einfacher fester Zufall (für Steine, Platten, Staub). */
export function seeded(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface Stone {
  x: number;
  y: number;
  w: number;
  h: number;
  l: number;
}

/** Unregelmäßige Quader in Reihen bis zur Bodenlinie. */
export function wallStones(g: SceneGeo, seed: number, compact: boolean): Stone[] {
  const rnd = seeded(seed * 7919 + 13);
  const rowH = Math.max(compact ? 6 : 9, Math.min(22, g.h * 0.048));
  const out: Stone[] = [];
  for (let y = g.hy; y > -rowH; y -= rowH) {
    const rh = rowH * (0.85 + rnd() * 0.3);
    let x = -rnd() * rowH * 2;
    while (x < g.w) {
      const sw = rowH * (1.5 + rnd() * 1.9);
      out.push({ x, y: y - rh, w: sw, h: rh, l: rnd() });
      x += sw;
    }
  }
  return out;
}

export interface Plate {
  d: string;
  l: number;
}

/** Bodenplatten in echter Perspektive: gleich tiefe Reihen, versetzte Fugen zum Fluchtpunkt. */
export function floorPlates(g: SceneGeo, seed: number): Plate[] {
  const rnd = seeded(seed * 104729 + 7);
  const rows = 8;
  const zA = 1 / (g.hy - g.vpy);
  const zB = 1 / (g.h - g.vpy);
  const ys = Array.from({ length: rows + 1 }, (_, i) => g.vpy + 1 / (zA + ((zB - zA) * i) / rows));
  const plateW = g.w / 5 / (g.h - g.vpy);
  const proj = (X: number, y: number) => `${(g.vpx + X * (y - g.vpy)).toFixed(1)} ${y.toFixed(1)}`;
  const reach = Math.ceil(g.w / 2 / (plateW * (g.hy - g.vpy))) + 1;
  const out: Plate[] = [];
  for (let r = 0; r < rows; r++) {
    const y0 = ys[r]!;
    const y1 = ys[r + 1]!;
    const off = r % 2 === 0 ? 0 : 0.5;
    for (let j = -reach; j < reach; j++) {
      const a = (j + off) * plateW;
      const b = (j + 1 + off) * plateW;
      if (g.vpx + b * (y1 - g.vpy) < -10 || g.vpx + a * (y1 - g.vpy) > g.w + 10) continue;
      out.push({ d: `M${proj(a, y0)}L${proj(b, y0)}L${proj(b, y1)}L${proj(a, y1)}Z`, l: rnd() });
    }
  }
  return out;
}
