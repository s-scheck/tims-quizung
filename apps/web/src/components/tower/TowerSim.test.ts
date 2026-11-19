import { describe, expect, test } from 'bun:test';
import { testOverlap, Vec2 } from 'planck';
import { FX_BOULDER, FX_SHIELD, STONE_FALLING, STONE_GIANT, STONE_GLUED, STONE_PETRIFIED, TOWER_BEAM, TOWER_BEAM_HALF, TOWER_ROUND } from '@quiz/shared';
import { FALL_SPEED, LOST_DELAY_MS, SPAWN_GAP, TowerSim, type SimEvent } from './TowerSim.ts';

const I = 0;
const O = 1;
const STEP = 1000 / 60;

/** Sim mit fester Formfolge. */
function sim(forms: number[], goal = 50, specials: number[] = [], spawn?: (i: number) => { x: number; turns: number }) {
  return new TowerSim({ seed: 1, goalHeight: goal, marks: [3], stream: (i) => ({ form: forms[i % forms.length]!, special: specials.includes(i), ...spawn?.(i) }) });
}

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) => events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);

/** Lässt den aktuellen Stein schnell fallen, bis er liegt, und wartet dann. */
function drop(s: TowerSim, settleMs = 1500) {
  s.advance(20);
  const id = s.current?.id;
  // Als gesteuert markieren (wie ein Spieler, der den Stein angefasst hat), sonst zählt der Turm über der Linie nicht.
  if (s.current) s.current.steered = true;
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

  test('Ranken verschweißen die oberen Steine: ein Windstoß verschiebt nichts mehr', () => {
    const run = (vines: boolean) => {
      const s = sim([O, I]);
      drop(s);
      drop(s, 1000);
      const bar = s.pieces[1]!;
      s.advance(20);
      // Den nächsten Stein seitlich wegwerfen, damit er nicht stört.
      for (let i = 0; i < 11; i++) s.move(1);
      if (vines) s.applySpecial('glue');
      s.setIce(true);
      for (let k = 0; k < 3; k++) {
        s.gust(1);
        s.advance(300);
      }
      return { s, bar: stone(s, bar.id), events: s.drain() };
    };
    const tied = run(true);
    expect(tied.bar.flags & STONE_GLUED).toBe(STONE_GLUED);
    expect(tied.bar.x).toBeCloseTo(0, 1);
    expect(ofType(tied.events, 'vines')[0]!.count).toBe(2);
    const loose = run(false);
    expect(!loose.bar || Math.abs(loose.bar.x) > 0.3).toBe(true);
  });

  test('Versteinern macht den unteren Turm zu Fels, die Spitze bleibt beweglich', () => {
    const s = sim([O]);
    for (let k = 0; k < 3; k++) drop(s, 800);
    const [a, b, c] = s.pieces;
    const ax = a!.body.getPosition().x;
    s.applySpecial('petrify');
    expect(ofType(s.drain(), 'petrify')[0]!.count).toBe(2);
    expect(a!.body.isStatic() && b!.body.isStatic()).toBe(true);
    expect(c!.body.isStatic()).toBe(false);
    expect(stone(s, a!.id).flags & STONE_PETRIFIED).toBe(STONE_PETRIFIED);
    // Ein Windstoß bewegt den Fels nicht.
    s.gust(1);
    s.advance(500);
    expect(a!.body.getPosition().x).toBe(ax);
  });

  test('Wegzaubern nimmt den zuletzt gesetzten Stein aus der Welt', () => {
    const s = sim([O, I]);
    drop(s);
    drop(s);
    const last = s.pieces[1]!;
    const h = s.height;
    s.drain();
    s.applySpecial('vanish');
    const ev = ofType(s.drain(), 'vanish')[0]!;
    expect(ev.id).toBe(last.id);
    expect(s.pieces.includes(last)).toBe(false);
    expect(s.lostCount).toBe(0);
    s.advance(100);
    expect(s.height).toBeLessThan(h - 0.5);
  });

  test('Riesenstein, Rundstein und Schild', () => {
    const s = sim([O]);
    drop(s);
    s.applySpecial('boulder');
    expect(s.effectFlags() & FX_BOULDER).toBe(FX_BOULDER);
    // Der zweite Stein fällt schon, der Riesenstein kommt danach.
    drop(s);
    drop(s);
    const giant = s.pieces[2]!;
    expect(giant.scale).toBe(1.5);
    expect(stone(s, giant.id).flags & STONE_GIANT).toBe(STONE_GIANT);
    expect(s.height).toBeCloseTo(7, 1);
    s.applySpecial('round');
    expect(s.peekNext()).toBe(TOWER_ROUND);
    drop(s);
    const ball = s.pieces.find((p) => p.form === TOWER_ROUND)!;
    expect(ball).toBeDefined();
    expect(ball.body.getFixtureList()!.getShape().getType()).toBe('circle');
    s.applySpecial('shield');
    expect(s.effectFlags() & FX_SHIELD).toBe(FX_SHIELD);
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

  test('Spezialstein und Höhenmarke melden sich, Schrumpfen ändert den Stein', () => {
    const s = sim([O], 50, [1]);
    drop(s);
    drop(s);
    const events = s.drain();
    expect(events.find((e) => e.type === 'special')).toMatchObject({ type: 'special', index: 1 });
    expect(events.some((e) => e.type === 'mark')).toBe(true);

    s.advance(20);
    s.shrink();
    expect(s.current!.scale).toBe(0.7);
  });

  test('Stützbalken: liegt ohne Überlappung auf dem Turm, trägt neue Steine und hält auch liegende auf', () => {
    const s = sim([O]);
    drop(s);
    const h = s.height;
    s.addBeam();
    expect(s.stones().some((x) => x.form === TOWER_BEAM)).toBe(true);
    // Der Balken sinkt bis knapp über den Stein, nichts wird weggeschoben.
    const beamY = s.beam!.getPosition().y;
    expect(beamY - TOWER_BEAM_HALF.h).toBeGreaterThanOrEqual(h - 0.01);
    expect(beamY - TOWER_BEAM_HALF.h).toBeLessThan(h + 0.12);
    s.advance(1000);
    expect(s.pieces[0]!.body.getPosition().y).toBeCloseTo(1, 1);
    // Ein liegender Stein, der hochgeschleudert wird, stößt von unten an den Balken statt hindurchzugehen.
    const first = s.pieces[0]!.body;
    first.setLinearVelocity(Vec2(0, 8));
    s.advance(120);
    expect(first.getPosition().y).toBeLessThan(1.2);
    s.advance(1500);
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

  test('Stützbalken über einer schiefen Spitze überlappt keinen Stein', () => {
    const s = sim([O, I, 2, 5]);
    for (let k = 0; k < 4; k++) {
      s.advance(20);
      for (let i = 0; i < k; i++) s.move(k % 2 ? 1 : -1);
      if (k === 2) s.rotate();
      s.advance(300);
      drop(s, 1000);
    }
    s.addBeam();
    const beam = s.beam!;
    const shape = beam.getFixtureList()!.getShape();
    let touching = 0;
    for (const p of s.pieces) {
      for (let f = p.body.getFixtureList(); f; f = f.getNext()) {
        if (testOverlap(shape, 0, f.getShape(), 0, beam.getTransform(), p.body.getTransform())) touching++;
      }
    }
    expect(touching).toBe(0);
    expect(beam.getPosition().y).toBeLessThan(s.height + 0.5);
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

  test('Gleiten: halbe Schritte werden weich angefahren, ohne Überschwingen', () => {
    const s = sim([O]);
    s.advance(20);
    const p = s.current!;
    s.move(1);
    s.move(1);
    const xs: number[] = [];
    for (let i = 0; i < 20; i++) {
      s.advance(STEP);
      xs.push(p.body.getPosition().x);
    }
    // Kein Sprung: nach einem Schritt erst ein Stück weit, dann monoton bis genau aufs Ziel.
    expect(xs[0]!).toBeGreaterThan(0);
    expect(xs[0]!).toBeLessThan(0.2);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - 1e-9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1 + 1e-6);
    expect(xs.at(-1)!).toBeCloseTo(1, 3);
    // Eine ganze Einheit dauert nur gut eine Zehntelsekunde.
    expect(xs.findIndex((x) => x > 0.98)).toBeLessThan(10);
  });

  test('Drehen: weich in gut einer Zehntelsekunde, auch gegen den Uhrzeigersinn', () => {
    const s = sim([I]);
    s.advance(20);
    const p = s.current!;
    s.rotate();
    s.advance(STEP * 3);
    const mid = p.body.getAngle();
    expect(mid).toBeLessThan(-0.2);
    expect(mid).toBeGreaterThan(-Math.PI / 2 + 0.1);
    s.advance(STEP * 7);
    expect(p.body.getAngle()).toBeCloseTo(-Math.PI / 2, 2);
    s.rotate(-1);
    s.advance(250);
    expect(p.body.getAngle()).toBeCloseTo(0, 2);
    expect(ofType(s.drain(), 'turn').map((e) => e.dir)).toEqual([1, -1]);
  });

  test('Schieben meldet sich, am Feldrand blockiert ohne Meldung', () => {
    const s = sim([O]);
    s.advance(20);
    s.drain();
    let moved = 0;
    for (let i = 0; i < 30; i++) if (s.move(1)) moved++;
    expect(moved).toBe(11);
    expect(ofType(s.drain(), 'shift')).toHaveLength(11);
  });

  test('Eingaben in der Pause zwischen zwei Steinen gelten für den nächsten', () => {
    const s = sim([O]);
    s.advance(20);
    s.fast = true;
    for (let i = 0; i < 600 && s.current; i++) s.advance(STEP);
    s.fast = false;
    expect(s.current).toBeNull();
    s.move(1);
    s.move(1);
    s.rotate();
    s.advance(400);
    expect(s.current).not.toBeNull();
    expect(s.targetX).toBe(1);
    expect(s.targetAngle).toBeCloseTo(-Math.PI / 2);
  });

  test('Startlage aus dem Steinstrom: versetzt und gedreht', () => {
    const s = sim([I], 50, [], () => ({ x: -2.5, turns: 1 }));
    s.advance(20);
    expect(s.current!.body.getPosition().x).toBeCloseTo(-2.5);
    expect(s.current!.body.getAngle()).toBeCloseTo(-Math.PI / 2);
    expect(ofType(s.drain(), 'spawn')[0]).toMatchObject({ index: 0, form: I, x: -2.5 });
  });

  test('Aufsetzen meldet Ort und Stärke; schnelles Fallen schießt den Turm nicht weg', () => {
    const s = sim([O]);
    drop(s);
    const first = s.pieces[0]!;
    const land = ofType(s.drain(), 'land')[0]!;
    expect(land.impact).toBeGreaterThan(0.1);
    expect(land.impact).toBeLessThan(0.8);
    expect(land.x).toBeCloseTo(0, 1);
    expect(land.y).toBeGreaterThan(0.9);
    // Zweiter Stein mit ▼ im Turbo auf den ersten: Der erste bleibt, wo er ist.
    s.turbo = true;
    drop(s, 0);
    s.turbo = false;
    s.advance(600);
    expect(first.body.getPosition().x).toBeCloseTo(0, 1);
    expect(first.body.getPosition().y).toBeCloseTo(1, 1);
    expect(Math.abs(first.body.getAngle())).toBeLessThan(0.02);
    expect(s.height).toBeCloseTo(4, 1);
  });

  test('heruntergefallener Stein: Meldung und Strafpause bis zum nächsten', () => {
    const s = sim([O], 50, [], () => ({ x: 5, turns: 0 }));
    s.advance(20);
    const t0 = s.time;
    for (let i = 0; i < 1200 && !ofType(s.drain(), 'lost').length; i++) s.advance(STEP);
    expect(s.lostCount).toBe(1);
    const lostAt = s.time;
    expect(lostAt).toBeGreaterThan(t0);
    expect(s.current).toBeNull();
    // Normal kommt der nächste Stein nach gut 0,2 s, jetzt erst nach der Strafe.
    s.advance(LOST_DELAY_MS - 100);
    expect(s.current).toBeNull();
    s.advance(500);
    expect(s.current).not.toBeNull();
  });

  test('Grundtempo steigt langsam', () => {
    const s = sim([O]);
    expect(s.fallSpeed()).toBeCloseTo(FALL_SPEED);
    s.time = 120_000;
    expect(s.fallSpeed()).toBeGreaterThan(FALL_SPEED + 0.5);
    s.time = 3_600_000;
    expect(s.fallSpeed()).toBeLessThan(FALL_SPEED * 2);
  });

  test('Halten über der Linie: steigende Meldungen, kein neuer Stein dazwischen, Abbruch wird gemeldet', () => {
    const s = sim([O], 1.5);
    drop(s, 100);
    s.drain();
    // Der Stein danach fällt noch, lassen wir ihn weg: neuer Turm über der Linie, fallender Stein seitlich weg.
    const holds: number[] = [];
    let spawned = 0;
    for (let i = 0; i < 160; i++) {
      s.advance(STEP);
      for (const e of s.drain()) {
        if (e.type === 'hold') holds.push(e.progress);
        if (e.type === 'spawn') spawned++;
      }
    }
    expect(holds.length).toBeGreaterThan(5);
    for (let i = 1; i < holds.length; i++) expect(holds[i]!).toBeGreaterThan(holds[i - 1]!);
    expect(spawned).toBe(0);
    // Ein Stoß bricht das Halten ab.
    s.gust(1);
    s.advance(100);
    expect(ofType(s.drain(), 'holdLost')).toHaveLength(1);
  });

  test('Wanken und Klacken: ein Windstoß gegen einen hohen Turm meldet sich', () => {
    const s = sim([I, O]);
    for (let k = 0; k < 4; k++) {
      s.advance(20);
      s.rotate();
      s.advance(200);
      drop(s, 600);
    }
    s.drain();
    s.gust(1);
    s.gust(1);
    s.advance(1500);
    const events = s.drain();
    expect(ofType(events, 'wobble').length).toBeGreaterThan(0);
    expect(s.wobble).toBeGreaterThan(0);
  });

  test('Nichtstun zählt nicht: ungesteuerte Steine über der Linie starten kein Halten', () => {
    const s = new TowerSim({ seed: 1, goalHeight: 1.5, stream: () => ({ form: O, special: false }) });
    s.advance(20);
    s.fast = true;
    for (let i = 0; i < 600 && s.current; i++) s.advance(STEP);
    s.fast = false;
    s.advance(4000);
    expect(s.height).toBeGreaterThan(1.5);
    expect(s.active).toBe(false);
    expect(s.holdMs).toBe(0);
    expect(s.finished).toBe(false);
  });
});
