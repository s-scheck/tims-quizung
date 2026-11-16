import { AVATAR_RES, HEAD_INSET, RIG, type HeadShape } from '@quiz/shared';

const OUTLINE = '#1f1f1f';

/** Umriss der Kopfform in Pixeln der Zeichenfläche (doppelte Auflösung). */
export function headPath(ctx: CanvasRenderingContext2D, shape: HeadShape): void {
  const { w, h } = RIG.head;
  const inset = HEAD_INSET * AVATAR_RES;
  const W = w * AVATAR_RES;
  const H = h * AVATAR_RES;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(W / 2, H / 2, W / 2 - inset, 0, Math.PI * 2);
  else ctx.roundRect(inset, inset, W - 2 * inset, H - 2 * inset, 10 * AVATAR_RES);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild nicht ladbar'));
    img.src = src;
  });
}

/** Fertiger Kopf: Form in der Grundfarbe, darauf das Gesicht (auf die Form beschnitten), dann der Umriss. */
export async function composeHead(shape: HeadShape, color: string, drawing: string | null): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = RIG.head.w * AVATAR_RES;
  canvas.height = RIG.head.h * AVATAR_RES;
  const ctx = canvas.getContext('2d')!;
  headPath(ctx, shape);
  ctx.fillStyle = color;
  ctx.fill();
  if (drawing) {
    ctx.save();
    headPath(ctx, shape);
    ctx.clip();
    ctx.drawImage(await loadImage(drawing), 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
  headPath(ctx, shape);
  ctx.lineWidth = 3 * AVATAR_RES;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

/** Ist auf der Fläche etwas gemalt? */
export function isBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) return false;
  return true;
}
