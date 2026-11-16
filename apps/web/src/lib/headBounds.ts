import { HEAD_INSET, RIG } from '@quiz/shared';

/** Rechteck in Koordinaten der Kopfbedeckungs-Fläche (200 × 180). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Die Kopfform selbst, ohne Kopfbedeckung. */
export const HEAD_SHAPE_BOX: Box = {
  x: RIG.head.at.x - RIG.hat.at.x + HEAD_INSET,
  y: RIG.head.at.y - RIG.hat.at.y + HEAD_INSET,
  w: RIG.head.w - 2 * HEAD_INSET,
  h: RIG.head.h - 2 * HEAD_INSET,
};

const cache = new Map<string, Promise<Box | null>>();

/** Gemalter Bereich der Kopfbedeckung (null, wenn leer oder nicht ladbar). Einmal je Bild berechnet. */
export function hatBounds(url: string): Promise<Box | null> {
  let hit = cache.get(url);
  if (!hit) {
    hit = measure(url);
    cache.set(url, hit);
  }
  return hit;
}

function measure(url: string): Promise<Box | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { w, h } = RIG.hat;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let x0 = w;
      let y0 = h;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3]! > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      resolve(x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function union(a: Box, b: Box | null): Box {
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
