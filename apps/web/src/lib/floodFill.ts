export type Rgba = [number, number, number, number];

/** `#rgb` oder `#rrggbb` als deckende Farbe. */
export function hexToRgba(hex: string): Rgba {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = Number.parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/**
 * Farbeimer: füllt die zusammenhängende Fläche gleicher Farbe ab (x, y) in `img`.
 * `tolerance` lässt weiche Kanten mitfüllen. Gibt false zurück, wenn nichts zu tun war.
 */
export function floodFill(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number, color: Rgba, tolerance = 48): boolean {
  const { width, height, data } = img;
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const start = (y * width + x) * 4;
  const target: Rgba = [data[start]!, data[start + 1]!, data[start + 2]!, data[start + 3]!];
  if (target.every((v, i) => v === color[i])) return false;

  const matches = (i: number): boolean => {
    // Durchsichtige Pixel gelten unabhängig von ihrer gespeicherten Farbe als gleich. Halbdurchsichtige
    // Kantenpixel eines Strichs werden mitgefüllt, sonst bleibt ein heller Saum am Rand.
    if (target[3] === 0) return data[i + 3]! <= 160;
    return (
      Math.abs(data[i]! - target[0]) <= tolerance &&
      Math.abs(data[i + 1]! - target[1]) <= tolerance &&
      Math.abs(data[i + 2]! - target[2]) <= tolerance &&
      Math.abs(data[i + 3]! - target[3]) <= tolerance
    );
  };

  const seen = new Uint8Array(width * height);
  const stack: number[] = [x, y];
  while (stack.length > 0) {
    const cy = stack.pop()!;
    const cx = stack.pop()!;
    // Nach links bis zum Rand der Fläche, dann die Zeile nach rechts füllen.
    let lx = cx;
    while (lx > 0 && !seen[cy * width + lx - 1] && matches((cy * width + lx - 1) * 4)) lx--;
    let up = false;
    let down = false;
    for (let px = lx; px < width; px++) {
      const p = cy * width + px;
      if (seen[p] || !matches(p * 4)) break;
      seen[p] = 1;
      data.set(color, p * 4);
      if (cy > 0) {
        const q = p - width;
        const ok = !seen[q] && matches(q * 4);
        if (ok && !up) stack.push(px, cy - 1);
        up = ok;
      }
      if (cy < height - 1) {
        const q = p + width;
        const ok = !seen[q] && matches(q * 4);
        if (ok && !down) stack.push(px, cy + 1);
        down = ok;
      }
    }
  }
  return true;
}
