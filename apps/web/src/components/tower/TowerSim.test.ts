import { describe, expect, test } from 'bun:test';
import { AABB, testOverlap, Vec2, type Body } from 'planck';
import {
  FX_BEAM,
  FX_BOULDER,
  FX_GLUE,
  FX_HEAVY,
  FX_PICK,
  STONE_FALLING,
  STONE_GIANT,
  STONE_GLUED,
  STONE_HEAVY,
  STONE_PETRIFIED,
  STONE_SHRUNK,
  TOWER_BEAM,
  TOWER_BEAM_HALF,
  TOWER_ROUND,
  towerAltForm,
  towerPiece,
} from '@quiz/shared';
import { FALL_SPEED, LOST_DELAY_MS, SPAWN_GAP, TowerSim, type SimEvent } from './TowerSim.ts';

const I = 0;
const O = 1;
const STEP = 1000 / 60;

/** Sim mit fester Formfolge. */
function sim(forms: number[], goal = 50, spawn?: (i: number) => { x: number; turns: number }) {
  return new TowerSim({ seed: 1, goalHeight: goal, marks: [3], stream: (i) => ({ form: forms[i % forms.length]!, ...spawn?.(i) }) });
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

  test('Ranken: die nächsten 5 Steine verschweißen sich mit allen Nachbarn, mehrere Ranken addieren sich', () => {
    const s = sim([O]);
    s.applySpecial('glue');
    expect(s.charges.glue).toBe(5);
    expect(s.effectFlags() & FX_GLUE).toBe(FX_GLUE);
    for (let k = 0; k < 6; k++) drop(s, 800);
    const [p1, p2, p3, p4, p5, p6] = s.pieces;
    const joints = (p: NonNullable<typeof p1>) => {
      const out = [];
      for (let j = p.body.getJointList(); j; j = j.next) out.push(j.other);
      return out;
    };
    // Der erste rankt sich an den Sockel, jeder weitere an den darunter; der sechste ist wieder ein normaler Stein.
    expect(joints(p1!)).toContain(s.base);
    for (const [a, b] of [[p2, p1], [p3, p2], [p4, p3], [p5, p4]] as const) expect(joints(a!)).toContain(b!.body);
    expect(joints(p6!)).not.toContain(p5!.body);
    expect(p6!.vine).toBe(false);
    for (const p of [p1, p2, p3, p4, p5]) expect(stone(s, p!.id).flags & STONE_GLUED).toBe(STONE_GLUED);
    expect(stone(s, p6!.id).flags & STONE_GLUED).toBe(0);
    expect(s.effectFlags() & FX_GLUE).toBe(0);
    expect(ofType(s.drain(), 'vines').reduce((n, e) => n + e.count, 0)).toBe(5);
    // Zweimal Ranken: zehn Ladungen.
    const t = sim([O]);
    t.applySpecial('glue');
    t.applySpecial('glue');
    expect(t.charges.glue).toBe(10);
  });

  test('Ranken halten: ein verketteter Turm übersteht Glatteis und Windstöße, ein loser nicht', () => {
    const run = (vines: boolean) => {
      const s = sim([O, I]);
      if (vines) s.applySpecial('glue');
      drop(s);
      drop(s, 1000);
      const bar = s.pieces[1]!;
      s.advance(20);
      // Den nächsten Stein seitlich wegwerfen, damit er nicht stört.
      for (let i = 0; i < 11; i++) s.move(1);
      s.setIce(true);
      for (let k = 0; k < 3; k++) {
        s.gust(1);
        s.advance(300);
      }
      return stone(s, bar.id);
    };
    const tied = run(true);
    expect(tied.flags & STONE_GLUED).toBe(STONE_GLUED);
    expect(tied.x).toBeCloseTo(0, 1);
    const loose = run(false);
    expect(!loose || Math.abs(loose.x) > 0.3).toBe(true);
  });

  test('Ranken greifen schon beim fallenden Stein', () => {
    const s = sim([O]);
    s.advance(20);
    const p = s.current!;
    s.applySpecial('glue');
    expect(p.vine).toBe(true);
    expect(s.charges.glue).toBe(4);
    expect(stone(s, p.id).flags & STONE_GLUED).toBe(STONE_GLUED);
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

  test('Vergrößern: die nächsten 3 Steine anderthalbfach, danach wieder normal', () => {
    const s = sim([O]);
    s.applySpecial('grow');
    expect(s.effectFlags() & FX_BOULDER).toBe(FX_BOULDER);
    for (let k = 0; k < 4; k++) drop(s, 800);
    expect(s.pieces.slice(0, 4).map((p) => p.scale)).toEqual([1.5, 1.5, 1.5, 1]);
    for (const p of s.pieces.slice(0, 3)) expect(stone(s, p.id).flags & STONE_GIANT).toBe(STONE_GIANT);
    expect(stone(s, s.pieces[3]!.id).flags & STONE_GIANT).toBe(0);
    expect(s.effectFlags() & FX_BOULDER).toBe(0);
    // Drei große O (je 3 hoch) und ein normales
    expect(s.height).toBeCloseTo(11, 1);
  });

  test('Mini-Steine: die nächsten 3 Steine auf 0,6; trifft Vergrößern dazu, heben sie sich auf', () => {
    const s = sim([O]);
    s.applySpecial('mini');
    expect(s.effectFlags() & FX_BOULDER).toBe(FX_BOULDER);
    for (let k = 0; k < 4; k++) drop(s, 800);
    expect(s.pieces.slice(0, 4).map((p) => p.scale)).toEqual([0.6, 0.6, 0.6, 1]);
    for (const p of s.pieces.slice(0, 3)) expect(stone(s, p.id).flags & STONE_SHRUNK).toBe(STONE_SHRUNK);
    expect(s.height).toBeCloseTo(3 * 1.2 + 2, 1);
    const t = sim([O]);
    t.applySpecial('mini');
    t.applySpecial('grow');
    drop(t);
    // Erster gelandet, zweiter fällt schon: beide normal groß, je eine Ladung beider Zauber verbraucht.
    expect(t.pieces.slice(0, 2).map((p) => p.scale)).toEqual([1, 1]);
    expect(t.charges).toMatchObject({ mini: 1, grow: 1 });
  });

  test('Schwerer Stein: bleibt bei Windstößen stehen, wo ein normaler kippt; nur ein Stein', () => {
    const run = (heavy: boolean) => {
      // Vier O als Säule, darauf ein senkrechtes I.
      const s = sim([O, O, O, O, I, O], 50, (i) => (i === 4 ? { x: 0, turns: 1 } : i > 4 ? { x: 5.5, turns: 0 } : { x: 0, turns: 0 }));
      for (let k = 0; k < 4; k++) drop(s, 600);
      if (heavy) {
        s.applySpecial('heavy');
        expect(s.effectFlags() & FX_HEAVY).toBe(FX_HEAVY);
      }
      drop(s);
      const bar = s.pieces[4]!;
      for (let k = 0; k < 3; k++) {
        s.gust(1);
        s.advance(250);
      }
      s.advance(1500);
      return { s, bar };
    };
    const heavy = run(true);
    expect(heavy.bar.heavy).toBe(true);
    expect(stone(heavy.s, heavy.bar.id).flags & STONE_HEAVY).toBe(STONE_HEAVY);
    expect(Math.abs(heavy.bar.body.getAngle() + Math.PI / 2)).toBeLessThan(0.1);
    expect(heavy.bar.body.getPosition().y).toBeGreaterThan(9.5);
    // Nur dieser eine Stein ist schwer.
    expect(heavy.s.pieces.filter((p) => p.heavy)).toHaveLength(1);
    expect(heavy.s.effectFlags() & FX_HEAVY).toBe(0);
    const plain = run(false);
    expect(Math.abs(plain.bar.body.getAngle() + Math.PI / 2) > 0.5 || plain.bar.body.getPosition().y < 9).toBe(true);
  });

  test('Steinwahl: zwei Formen für die nächsten 3 Steine, die Wahl wirkt', () => {
    const s = new TowerSim({ seed: 42, goalHeight: 50 });
    expect(s.pickOptions()).toBeNull();
    s.applySpecial('pick');
    expect(s.effectFlags() & FX_PICK).toBe(FX_PICK);
    const opts = s.pickOptions()!;
    expect(opts).toEqual([towerPiece(42, 0).form, towerAltForm(42, 0)]);
    expect(opts[0]).not.toBe(opts[1]);
    expect(s.peekNext()).toBe(opts[0]);
    s.choosePick(1);
    expect(s.peekNext()).toBe(opts[1]);
    s.advance(20);
    expect(s.current!.form).toBe(opts[1]);
    // Ohne Wahl kommt die normale Form (Steine können danebenfallen, darum über die Meldungen).
    const spawned = () => new Map(ofType(s.drain(), 'spawn').map((e) => [e.index, e.form]));
    const second = s.pickOptions()!;
    expect(second).toEqual([towerPiece(42, 1).form, towerAltForm(42, 1)]);
    s.drain();
    drop(s, 300);
    expect(spawned().get(1)).toBe(second[0]);
    s.choosePick(1);
    const third = s.pickOptions()!;
    drop(s, 300);
    expect(spawned().get(2)).toBe(third[1]);
    // Nach drei Steinen ist Schluss, eine Wahl ändert nichts mehr.
    expect(s.pickOptions()).toBeNull();
    expect(s.effectFlags() & FX_PICK).toBe(0);
    s.choosePick(1);
    expect(s.current!.index).toBe(2);
    expect(s.peekNext()).toBe(towerPiece(42, 3).form);
  });

  test('Rundstein rollt als Kreis', () => {
    const s = sim([O]);
    drop(s);
    s.applySpecial('round');
    expect(s.peekNext()).toBe(TOWER_ROUND);
    // Der zweite Stein fällt schon, der Rundstein kommt danach.
    drop(s);
    drop(s);
    const ball = s.pieces.find((p) => p.form === TOWER_ROUND)!;
    expect(ball).toBeDefined();
    expect(ball.body.getFixtureList()!.getShape().getType()).toBe('circle');
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

  test('Höhenmarke meldet sich', () => {
    const s = sim([O]);
    drop(s);
    drop(s);
    expect(s.drain().some((e) => e.type === 'mark')).toBe(true);
  });

  test('Stützbalken: liegt ohne Überlappung auf dem Turm, trägt neue Steine und hält auch liegende auf', () => {
    const s = sim([O]);
    drop(s);
    const h = s.height;
    s.applySpecial('beam');
    expect(ofType(s.drain(), 'beam')).toHaveLength(1);
    expect(s.stones().some((x) => x.form === TOWER_BEAM)).toBe(true);
    expect(s.effectFlags() & FX_BEAM).toBe(FX_BEAM);
    // Der Balken sinkt bis knapp über den Stein, nichts wird weggeschoben.
    const beamY = s.beams[0]!.body.getPosition().y;
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
  });

  test('Stützbalken sind dauerhaft: jeder Einsatz legt einen weiteren unter die Spitze, keiner überlappt', () => {
    const s = sim([O]);
    drop(s, 800);
    s.applySpecial('beam');
    s.advance(60_000);
    expect(s.beams).toHaveLength(1);
    const overlaps = (b: TowerSim['beams'][number], others: Body[]) => {
      const shape = b.body.getFixtureList()!.getShape();
      let n = 0;
      for (const o of others) for (let f = o.getFixtureList(); f; f = f.getNext()) if (testOverlap(shape, 0, f.getShape(), 0, b.body.getTransform(), o.getTransform())) n++;
      return n;
    };
    for (let k = 0; k < 3; k++) drop(s, 800);
    s.applySpecial('beam');
    expect(overlaps(s.beams[1]!, s.pieces.map((p) => p.body))).toBe(0);
    drop(s, 800);
    s.applySpecial('beam');
    expect(overlaps(s.beams[2]!, s.pieces.map((p) => p.body))).toBe(0);
    expect(s.beams).toHaveLength(3);
    const ys = s.beams.map((b) => b.body.getPosition().y);
    expect(ys[1]!).toBeGreaterThan(ys[0]! + 0.5);
    expect(ys[2]!).toBeGreaterThan(ys[1]! - 0.01);
    const ids = s.stones().filter((x) => x.form === TOWER_BEAM).map((x) => x.id);
    expect(new Set(ids).size).toBe(3);
    // Keine zwei Balken überlappen sich.
    for (const b of s.beams) expect(overlaps(b, s.beams.filter((x) => x !== b).map((x) => x.body))).toBe(0);
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
    const beam = s.beams[0]!.body;
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

  test('Schnappschuss und Wiederherstellen: gleiche Höhe, gleiche Steine, Magie und Ranken bleiben', () => {
    const s = sim([O, I, 2, 5, O]);
    s.applySpecial('glue');
    for (let k = 0; k < 5; k++) {
      s.advance(20);
      for (let i = 0; i < k % 3; i++) s.move(k % 2 ? 1 : -1);
      drop(s, 900);
    }
    s.applySpecial('beam');
    s.applySpecial('petrify');
    s.applySpecial('grow');
    s.applySpecial('mini');
    s.applySpecial('pick');
    drop(s, 900);
    s.advance(20);
    // Gerade fällt ein Stein: Er kommt nach dem Wiederherstellen noch einmal, samt seinen Ladungen.
    s.advance(1500);
    expect(s.current).not.toBeNull();
    const snap = JSON.parse(JSON.stringify(s.snapshot()));
    const r = TowerSim.restore({ seed: 1, goalHeight: 50, marks: [3], stream: (i) => ({ form: [O, I, 2, 5, O][i % 5]! }) }, snap);
    const settledIds = (t: TowerSim) => t.stones().filter((x) => !(x.flags & STONE_FALLING)).map((x) => x.id).sort((a, b) => a - b);
    expect(settledIds(r)).toEqual(settledIds(s));
    expect(r.height).toBeCloseTo(s.height, 2);
    expect(r.beams.map((b) => b.id)).toEqual(s.beams.map((b) => b.id));
    expect(r.pieces.filter((p) => p.petrified).length).toBe(s.pieces.filter((p) => p.petrified).length);
    expect(r.time).toBe(s.time);
    // Ladungen: was der fallende Stein verbraucht hatte, ist wieder da.
    expect(r.charges.grow + r.charges.mini).toBe(s.charges.grow + s.charges.mini + (s.current?.growUsed ? 1 : 0) + (s.current?.miniUsed ? 1 : 0));
    const joints = (t: TowerSim) => {
      let n = 0;
      for (let j = t.world.getJointList(); j; j = j.getNext()) if (j.getBodyA() !== t.current?.body && j.getBodyB() !== t.current?.body) n++;
      return n;
    };
    expect(joints(r)).toBe(joints(s));
    // Nach einer Weile steht der wiederhergestellte Turm genauso, und der fallende Stein kommt mit demselben Platz im Strom.
    r.advance(2000);
    expect(r.height).toBeCloseTo(s.height, 1);
    expect(r.lostCount).toBe(s.lostCount);
    expect(ofType(r.drain(), 'spawn')[0]!.index).toBe(s.current!.index);
    // Ein fremder Seed passt nicht: frischer Turm.
    expect(TowerSim.restore({ seed: 2, goalHeight: 50 }, snap).pieces).toHaveLength(0);
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
    const s = sim([I], 50, () => ({ x: -2.5, turns: 1 }));
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
    const s = sim([O], 50, () => ({ x: 5, turns: 0 }));
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
    const s = new TowerSim({ seed: 1, goalHeight: 1.5, stream: () => ({ form: O }) });
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

/**
 * Passgenauigkeit: Steine, die laut Zeichnung genau passen, müssen auch physikalisch passen. Früher war jede Zelle
 * durch die Polygon-Haut von planck 1,02 breit; ein Stein blieb an Ecken hängen, setzte schief auf oder kippte.
 */
describe('TowerSim: Passgenauigkeit', () => {
  const T = 2;
  const S = 3;
  const Z = 4;
  const L = 5;
  const J = 6;
  const Q = -Math.PI / 2;
  type Piece = NonNullable<TowerSim['current']>;

  interface Spec {
    form: number;
    x: number;
    turns: number;
  }

  /** Setzt die Steine der Reihe nach (fallen lassen, ruhen lassen); nur der letzte fällt ohne ▼, wenn `fast` aus ist. */
  function build(specs: Spec[], fast = true) {
    const s = new TowerSim({ seed: 1, goalHeight: 50, stream: (i) => ({ ...specs[Math.min(i, specs.length - 1)]! }) });
    const placed: Piece[] = [];
    for (let k = 0; k < specs.length; k++) {
      for (let i = 0; i < 100 && !s.current; i++) s.advance(STEP);
      const p = s.current!;
      p.steered = true;
      s.fast = fast || k < specs.length - 1;
      for (let i = 0; i < 900 && s.current === p; i++) s.advance(STEP);
      s.fast = false;
      s.advance(1500);
      placed.push(p);
    }
    return { s, placed, last: placed.at(-1)! };
  }

  function expectAt(p: Piece, x: number, y: number, a: number, tol = 0.02) {
    const pos = p.body.getPosition();
    expect(Math.abs(pos.x - x)).toBeLessThan(tol);
    expect(Math.abs(pos.y - y)).toBeLessThan(tol);
    expect(Math.abs(p.body.getAngle() - a)).toBeLessThan(tol);
  }

  const cases: { name: string; specs: Spec[]; at: [number, number, number] }[] = [
    { name: 'I senkrecht in eine 1 breite Lücke zwischen zwei Säulen', specs: [{ form: O, x: -1.5, turns: 0 }, { form: O, x: 1.5, turns: 0 }, { form: I, x: 0, turns: 1 }], at: [0, 2, Q] },
    { name: 'O in eine 2 breite Lücke', specs: [{ form: O, x: -2, turns: 0 }, { form: O, x: 2, turns: 0 }, { form: O, x: 0, turns: 0 }], at: [0, 1, 0] },
    { name: 'L kopfüber auf eine passende Stufe', specs: [{ form: I, x: 0.5, turns: 0 }, { form: L, x: -1, turns: 2 }], at: [-1, 1, 2 * Q] },
    { name: 'J kopfüber auf eine passende Stufe', specs: [{ form: I, x: -0.5, turns: 0 }, { form: J, x: 1, turns: 2 }], at: [1, 1, 2 * Q] },
    { name: 'T kopfüber mit dem Stiel in eine Lücke', specs: [{ form: O, x: -1.5, turns: 0 }, { form: O, x: 1.5, turns: 0 }, { form: T, x: 0, turns: 2 }], at: [0, 2, 2 * Q] },
    { name: 'S senkrecht in die Stufe eines Z', specs: [{ form: Z, x: 0, turns: 0 }, { form: S, x: 0.5, turns: 1 }], at: [0.5, 2.5, Q] },
    { name: 'O landet bündig neben einem O', specs: [{ form: O, x: -1, turns: 0 }, { form: O, x: 1, turns: 0 }], at: [1, 1, 0] },
    { name: 'I senkrecht landet bündig neben einem O', specs: [{ form: O, x: -1, turns: 0 }, { form: I, x: 0.5, turns: 1 }], at: [0.5, 2, Q] },
  ];
  for (const c of cases) {
    for (const fast of [true, false]) {
      test(`${c.name}${fast ? ' (mit ▼)' : ''}`, () => {
        const { s, placed, last } = build(c.specs, fast);
        expect(s.lostCount).toBe(0);
        expectAt(last, ...c.at);
        // Die liegenden Steine wurden nicht verschoben.
        for (let k = 0; k < placed.length - 1; k++) expect(Math.abs(placed[k]!.body.getPosition().x - c.specs[k]!.x)).toBeLessThan(0.02);
      });
    }
  }

  test('Lagen liegen bündig wie gezeichnet: Höhe genau ganzzahlig', () => {
    const { s, placed } = build([{ form: O, x: 0, turns: 0 }, { form: O, x: 0, turns: 0 }, { form: O, x: 0, turns: 0 }, { form: I, x: 0, turns: 0 }]);
    expect(Math.abs(s.height - 7)).toBeLessThan(0.005);
    expect(Math.abs(placed[0]!.body.getPosition().y - 1)).toBeLessThan(0.005);
  });

  test('Säule steht etwas neben dem Raster: der Stein passt trotzdem', () => {
    // Lücke 0,08 zu schmal (gut zwei Pixel)
    const narrow = build([{ form: O, x: -1.5, turns: 0 }, { form: O, x: 1.42, turns: 0 }, { form: I, x: 0, turns: 1 }]);
    expect(narrow.s.lostCount).toBe(0);
    expectAt(narrow.last, 0, 2, Q, 0.05);
    // Nachbar ragt 0,08 unter den neuen Stein: der rückt minimal zur Seite und kippt nicht.
    const flush = build([{ form: O, x: -0.92, turns: 0 }, { form: O, x: 1, turns: 0 }]);
    expect(flush.s.lostCount).toBe(0);
    expectAt(flush.last, 1, 1, 0, 0.05);
  });

  test('seitlich an eine Kante heranrücken: kein Aufsetzen in der Luft, der Stein gleitet bis zum Boden', () => {
    const s = new TowerSim({ seed: 1, goalHeight: 50, stream: (i) => (i === 0 ? { form: O, x: -1, turns: 0 } : { form: I, x: 2, turns: 1 }) });
    drop(s);
    s.advance(20);
    const p = s.current!;
    s.drain();
    // Erst rechts neben der Säule hinunter, dann bündig heranrücken, solange der Stein noch neben ihr ist.
    s.fast = true;
    for (let i = 0; i < 300 && p.body.getPosition().y > 3.4; i++) s.advance(STEP);
    s.fast = false;
    for (let i = 0; i < 3; i++) s.move(-1);
    for (let i = 0; i < 600 && s.current === p; i++) s.advance(STEP);
    const land = ofType(s.drain(), 'land')[0]!;
    // Erst unten am Sockel aufgesetzt, nicht an der Säule hängen geblieben.
    expect(land.y).toBeLessThan(2.1);
    s.advance(1500);
    expectAt(p, 0.5, 2, Q);
  });

  test('ehrlich bleibt ehrlich: ein Stein, der nur knapp auf einer Kante liegt, kippt herunter', () => {
    const { s, last } = build([{ form: O, x: -1, turns: 0 }, { form: O, x: 0.8, turns: 0 }]);
    // Der zweite Stein bekäme oben nur 0,2 Auflage, der Schwerpunkt liegt weit draußen: Er bleibt nicht oben liegen.
    const pos = last.body.getPosition();
    expect(s.lostCount > 0 || pos.y < 2.5 || Math.abs(last.body.getAngle()) > 0.5).toBe(true);
  });

  test('Hitbox: wenige konvexe Teile, waagrecht schmaler als gezeichnet, senkrecht fast bündig', () => {
    const s = sim([I, O, T]);
    s.advance(20);
    const parts = (p: Piece) => {
      let n = 0;
      for (let f = p.body.getFixtureList(); f; f = f.getNext()) n++;
      return n;
    };
    const bar = s.current!;
    expect(parts(bar)).toBe(1);
    // Ausdehnung samt Haut in der aktuellen Lage
    const size = () => {
      const box = new AABB();
      bar.body.getFixtureList()!.getShape().computeAABB(box, bar.body.getTransform(), 0);
      return { w: box.upperBound.x - box.lowerBound.x, h: box.upperBound.y - box.lowerBound.y };
    };
    expect(size().w).toBeLessThan(4 - 0.03);
    expect(Math.abs(size().h - 1)).toBeLessThan(0.01);
    // Gedreht liegt die schmale Seite der Hitbox wieder waagrecht.
    s.rotate();
    s.advance(300);
    expect(size().w).toBeLessThan(1 - 0.03);
    expect(Math.abs(size().h - 4)).toBeLessThan(0.01);
    drop(s);
    expect(parts(s.current!)).toBe(1);
    drop(s);
    // T: Balken, Stiel und ein Verbindungsstück
    expect(parts(s.current!)).toBe(3);
  });
});
