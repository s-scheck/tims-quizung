import { describe, expect, test } from 'bun:test';
import { STONE_FALLING, STONE_GLUED, TOWER_BEAM } from '@quiz/shared';
import { SPAWN_GAP, TowerSim } from './TowerSim.ts';

const I = 0;
const O = 1;

/** Sim mit fester Formfolge. */
function sim(forms: number[], goal = 50, specials: number[] = []) {
  return new TowerSim({ seed: 1, goalHeight: goal, marks: [3], stream: (i) => ({ form: forms[i % forms.length]!, special: specials.includes(i) }) });
}

/** Lässt den aktuellen Stein schnell fallen, bis er liegt, und wartet dann. */
function drop(s: TowerSim, settleMs = 1500) {
  s.advance(20);
  const id = s.current?.id;
  s.fast = true;
  for (let i = 0; i < 600 && s.current?.id === id; i++) s.advance(1000 / 60);
  s.fast = false;
  s.advance(settleMs);
}

function stone(s: TowerSim, id: number) {
  return s.stones().find((x) => x.id === id)!;
}

describe('TowerSim', () => {
  test('ein Stein fällt auf den Sockel und bleibt liegen', () => {
    const s = sim([O]);
    s.advance(20);
    const first = s.current!;
    expect(first.body.getPosition().y).toBeCloseTo(SPAWN_GAP, 0);
    expect(stone(s, first.id).flags & STONE_FALLING).toBe(STONE_FALLING);
    drop(s, 2000);
    const st = stone(s, first.id);
    expect(st.flags & STONE_FALLING).toBe(0);
    expect(st.y).toBeCloseTo(1, 1);
    expect(st.x).toBeCloseTo(0, 1);
    expect(Math.abs(st.a)).toBeLessThan(0.01);
    expect(s.height).toBeCloseTo(2, 1);
    expect(s.calm).toBe(true);
    // Nach dem Aufsetzen kommt der nächste Stein oben dazu.
    expect(s.current).not.toBeNull();
    expect(s.drain().some((e) => e.type === 'land')).toBe(true);
  });

  test('steuern: schieben und drehen in halben Schritten bzw. Vierteldrehungen', () => {
    const s = sim([I]);
    s.advance(20);
    for (let i = 0; i < 4; i++) s.move(1);
    s.rotate();
    s.advance(500);
    expect(s.current!.body.getPosition().x).toBeCloseTo(2, 1);
    expect(s.current!.body.getAngle()).toBeCloseTo(-Math.PI / 2, 1);
  });

  test('Kleber hält einen überhängenden Stein, ohne Kleber kippt er', () => {
    const run = (glue: boolean) => {
      const s = sim([O, I]);
      drop(s);
      s.advance(20);
      const bar = s.current!;
      for (let i = 0; i < 3; i++) s.move(1);
      s.advance(400);
      if (glue) s.glueArmed = true;
      drop(s, 3000);
      return { s, bar: stone(s, bar.id) };
    };
    const glued = run(true);
    expect(glued.bar.flags & STONE_GLUED).toBe(STONE_GLUED);
    expect(Math.abs(glued.bar.a)).toBeLessThan(0.05);
    expect(glued.bar.y).toBeGreaterThan(2.3);
    const loose = run(false);
    // Ohne Kleber kippt der Balken über die Kante und fällt herunter oder hängt schräg.
    expect(!loose.bar || Math.abs(loose.bar.a) > 0.3 || loose.bar.y < 2).toBe(true);
  });

  test('Glatteis: ein Windstoß schiebt die Steine viel weiter', () => {
    const slide = (ice: boolean) => {
      const s = sim([O]);
      drop(s);
      const id = s.pieces[0]!.id;
      s.setIce(ice);
      s.gust(1);
      s.advance(1000);
      return stone(s, id)?.x ?? 99;
    };
    const dry = slide(false);
    const icy = slide(true);
    expect(dry).toBeLessThan(0.1);
    expect(icy).toBeGreaterThan(dry + 0.2);
  });

  test('Spezialstein und Höhenmarke melden sich, Brocken und Schrumpfen ändern den Stein', () => {
    const s = sim([O], 50, [1]);
    drop(s);
    drop(s);
    const events = s.drain();
    expect(events.find((e) => e.type === 'special')).toMatchObject({ type: 'special', index: 1 });
    expect(events.some((e) => e.type === 'mark')).toBe(true);

    s.boulderArmed = true;
    expect(s.peekNext()).toBe(7);
    drop(s);
    expect(s.pieces.some((p) => p.form === 7)).toBe(true);
    s.advance(20);
    s.shrink();
    expect(s.current!.scale).toBe(0.7);
  });

  test('Stützbalken: neue Steine landen darauf, liegende gehen hindurch', () => {
    const s = sim([O]);
    drop(s);
    const h = s.height;
    s.addBeam();
    expect(s.stones().some((x) => x.form === TOWER_BEAM)).toBe(true);
    // Der liegende Stein wird nicht weggeschoben.
    s.advance(1000);
    expect(s.pieces[0]!.body.getPosition().y).toBeCloseTo(1, 1);
    s.advance(20);
    for (let i = 0; i < 5; i++) s.move(1);
    s.advance(500);
    drop(s);
    const second = s.pieces[1]!;
    // Landet auf dem Balken neben dem ersten Stein statt auf dem Sockel.
    expect(second.body.getPosition().y).toBeGreaterThan(h);
    s.removeBeam();
    expect(s.beam).toBeNull();
  });

  test('ruhig über der Linie: nach drei Sekunden fertig', () => {
    const s = sim([O], 1.5);
    drop(s, 100);
    expect(s.finished).toBe(false);
    s.advance(3200);
    expect(s.finished).toBe(true);
    expect(s.drain().filter((e) => e.type === 'finish')).toHaveLength(1);
    // Bleibt das Rennen offen, kommt die Meldung nach anderthalb Sekunden noch einmal.
    s.advance(1600);
    expect(s.drain().filter((e) => e.type === 'finish')).toHaveLength(1);
    const f = s.frame(1000);
    expect(f.hold).toBeGreaterThan(0);
    expect(f.s.length % 6).toBe(0);
  });
});
