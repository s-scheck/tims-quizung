import { describe, expect, test } from 'bun:test';
import { floodFill, hexToRgba, type Rgba } from './floodFill.ts';

/** Bild aus Zeichen: `#` schwarz, `.` durchsichtig. */
function image(rows: string[]) {
  const width = rows[0]!.length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '#') data.set([0, 0, 0, 255], (y * width + x) * 4);
    }),
  );
  return { width, height, data };
}

function render(img: ReturnType<typeof image>, color: Rgba): string[] {
  const out: string[] = [];
  for (let y = 0; y < img.height; y++) {
    let row = '';
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const px = [...img.data.slice(i, i + 4)];
      row += px.every((v, k) => v === color[k]) ? 'o' : px[3] === 0 ? '.' : '#';
    }
    out.push(row);
  }
  return out;
}

describe('Farbeimer', () => {
  const red: Rgba = [255, 0, 0, 255];

  test('füllt nur das Innere einer geschlossenen Form', () => {
    const img = image(['.....', '.###.', '.#.#.', '.###.', '.....']);
    expect(floodFill(img, 2, 2, red)).toBe(true);
    expect(render(img, red)).toEqual(['.....', '.###.', '.#o#.', '.###.', '.....']);
  });

  test('füllt um Hindernisse herum, auch über Zeilensprünge', () => {
    const img = image(['..#..', '.##..', '.....', '#.###']);
    floodFill(img, 0, 0, red);
    expect(render(img, red)).toEqual(['oo#oo', 'o##oo', 'ooooo', '#o###']);
  });

  test('gleiche Farbe oder außerhalb: nichts zu tun', () => {
    const img = image(['##']);
    expect(floodFill(img, 0, 0, [0, 0, 0, 255])).toBe(false);
    expect(floodFill(img, 5, 0, red)).toBe(false);
  });

  test('Hexfarben', () => {
    expect(hexToRgba('#ff8000')).toEqual([255, 128, 0, 255]);
    expect(hexToRgba('#0f0')).toEqual([0, 255, 0, 255]);
  });
});
