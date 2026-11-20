import { describe, expect, test } from 'bun:test';
import { isClientMsg, packFrame, TOWER_EFFECT_SHOW_MS, TOWER_GOAL_HEIGHT, TOWER_LUCK_MAX_MS, TOWER_LUCK_MIN_MS, TOWER_SPECIALS, TOWER_STOCK_MAX, type TowerSpecial } from '@quiz/shared';
import { toView } from '../src/rooms/view.ts';
import type { TowerRound } from '../src/rooms/state.ts';
import { acceptTowerFrame, TOWER_COUNTDOWN_MS, TOWER_MIN_FINISH_MS } from '../src/games/tower/reducer.ts';
import { expectOk, makeHarness, startTower, type Harness } from './fixtures.ts';

function tr(h: Harness): TowerRound {
  const round = h.room.round;
  if (round?.game !== 'tower') throw new Error('keine Hochstapler-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'tower') throw new Error('keine Hochstapler-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

/** Legt einem Spieler genau diesen Zauber in den Vorrat. */
function give(h: Harness, id: string, special: TowerSpecial) {
  tr(h).players[id]!.stock = [special];
}

const frame = (h: number) => packFrame({ t: 1, h, fx: 0, hold: 0, next: 1, stones: [{ id: 1, form: 0, x: 0, y: 0.5, a: 0, flags: 0 }] });

describe('Hochstapler: Start', () => {
  test('ohne Kategorie, Ziellinie wird gemerkt, jeder bekommt seinen Steinstrom', () => {
    const h = moderated(['Host', 'A', 'B']);
    const [, a, b] = h.ids as [string, string, string];
    startTower(h, 'high');
    const r = tr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.turnOrder).toEqual([a, b]);
    expect(r.goalHeight).toBe(TOWER_GOAL_HEIGHT.high);
    expect(h.room.towerOptions).toEqual({ goal: 'high' });
    expect(toView(h.room, null).towerOptions).toEqual({ goal: 'high' });

    const va = viewRound(h, a);
    expect(va.my?.seed).toBe(r.players[a]!.seed);
    expect(va.my?.stock).toEqual([]);
    expect(va.my?.luck).toBeNull();
    expect(va.my?.luckAt).toBe(r.players[a]!.luckAt);
    expect(viewRound(h, b).my?.seed).toBe(r.players[b]!.seed);
    expect(viewRound(h, null).my).toBeUndefined();
    expect(viewRound(h, h.host).my).toBeUndefined();
    expect(va.marks).toEqual([3, 6, 9, 12, 15, 18, 21]);
    expect(va.players[a]).toMatchObject({ hasStock: false, stockCount: 0, hasLuck: false });
    expect(va.ranking).toBeUndefined();
  });

  test('fünf Ziellinien bis 40 m', () => {
    const h = makeHarness(['A', 'B']);
    startTower(h, 'sky');
    expect(tr(h).goalHeight).toBe(40);
    expect(viewRound(h, h.ids[0]!).marks.at(-1)).toBe(39);
    expect(isClientMsg({ type: 'choose_category', gameId: 'tower', categoryId: 'tower', tower: { goal: 'xhigh' } })).toBe(true);
  });

  test('ohne Angabe gilt die zuletzt gewählte Linie', () => {
    const h = makeHarness(['A', 'B']);
    h.room.towerOptions = { goal: 'low' };
    expectOk(h.act(h.host, { type: 'start_game' }));
    expectOk(h.act(h.host, { type: 'intro_done' }));
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'tower', categoryId: 'egal' }));
    expect(tr(h).goalHeight).toBe(TOWER_GOAL_HEIGHT.low);
    expect(tr(h).turnOrder).toHaveLength(2);
  });
});

describe('Hochstapler: Start-Countdown', () => {
  test('alle bekommen dieselbe Startzeit, vorher gehen keine Spezials, das Ziel zählt ab „Los!“', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTower(h, 'low', { countdown: true });
    const r = tr(h);
    expect(r.goAt - r.startedAt).toBe(TOWER_COUNTDOWN_MS);
    expect(viewRound(h, a).goAt).toBe(r.goAt);
    expect(viewRound(h, null).goAt).toBe(r.goAt);
    give(h, a, 'fog');
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'fog', targetId: b }).ok).toBe(false);
    h.scheduler.advance(TOWER_COUNTDOWN_MS);
    expectOk(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'fog', targetId: b }));
    // Mindestzeit fürs Ziel läuft erst ab „Los!“.
    h.scheduler.advance(TOWER_MIN_FINISH_MS - 1);
    expect(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low + 0.2 }).ok).toBe(false);
    h.scheduler.advance(1);
    expectOk(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low + 0.2 }));
  });
});

describe('Hochstapler: Marken und Spezials', () => {
  test('erste Überbauung einer Marke bringt ein Spezial, jede Marke nur einmal', () => {
    const h = makeHarness(['A', 'B']);
    const [a] = h.ids as [string, string];
    startTower(h, 'mid');
    // Unter der ersten Marke: kein Fehler, aber auch nichts.
    expectOk(h.act(a, { type: 'tower_mark', height: 2.5 }));
    expect(tr(h).players[a]!.offer).toBeNull();
    expectOk(h.act(a, { type: 'tower_mark', height: 3.4 }));
    const p = tr(h).players[a]!;
    expect(p.marks).toEqual([3]);
    expect(p.offer).not.toBeNull();
    expectOk(h.act(a, { type: 'tower_choose', side: 'light' }));
    expect(p.offer).toBeNull();
    expect(p.stock).toHaveLength(1);
    expect(viewRound(h, a).my?.stock).toEqual(p.stock);
    // Andere sehen nur, wie viel im Vorrat liegt.
    const vb = viewRound(h, h.ids[1]!);
    expect(vb.players[a]).toMatchObject({ hasStock: true, stockCount: 1 });
    expect(JSON.stringify(vb.players)).not.toContain(String(p.stock[0]));
    // Dieselbe Marke nach Einsturz und Neubau (oder doppelt gemeldet) zählt nicht noch einmal, ist aber kein Fehler.
    expectOk(h.act(a, { type: 'tower_mark', height: 3.2 }));
    expect(p.offer).toBeNull();
    // Zwei Marken auf einmal: beide gelten als erreicht.
    expectOk(h.act(a, { type: 'tower_mark', height: 9.1 }));
    expect(p.marks).toEqual([3, 6, 9]);
  });

  test('Vorrat bis drei, der Reihe nach; voll verdrängt der neue den ältesten', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTower(h, 'xhigh');
    const p = tr(h).players[a]!;
    const took: TowerSpecial[] = [];
    for (const height of [3.1, 6.1, 9.1, 12.1]) {
      expectOk(h.act(a, { type: 'tower_mark', height }));
      took.push(p.offer!.light);
      expectOk(h.act(a, { type: 'tower_choose', side: 'light' }));
    }
    expect(p.stock).toEqual(took.slice(-TOWER_STOCK_MAX));
    expect(viewRound(h, b).players[a]?.stockCount).toBe(TOWER_STOCK_MAX);
    // Nur der älteste ist dran.
    const [first, second] = p.stock as [TowerSpecial, TowerSpecial];
    if (first !== second) expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: second, ...(TOWER_SPECIALS[second].group === 'dark' ? { targetId: b } : {}) }).ok).toBe(false);
    expectOk(h.act(a, { type: 'tower_special_use', from: 'stock', special: first, ...(TOWER_SPECIALS[first].group === 'dark' ? { targetId: b } : {}) }));
    expect(p.stock).toEqual(took.slice(-TOWER_STOCK_MAX + 1));
  });

  test('alte Spezialstein-Meldungen und Doppelwahl sind harmlos', () => {
    const h = makeHarness(['A', 'B']);
    const [a] = h.ids as [string, string];
    startTower(h);
    expectOk(h.act(a, { type: 'tower_mark', height: 1, piece: 5 }));
    expectOk(h.act(a, { type: 'tower_mark', height: 1, piece: 5 }));
    expect(tr(h).players[a]!.offer).toBeNull();
    expectOk(h.act(a, { type: 'tower_choose', side: 'light' }));
    expect(tr(h).players[a]!.stock).toEqual([]);
  });

  test('Aufholhilfe: wer hinten liegt, bekommt stärkere helle Zauber angeboten', () => {
    let behindValue = 0;
    let frontValue = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const h = makeHarness(['A', 'B', 'C', 'D'], { seed });
      const [a, b, c, d] = h.ids as [string, string, string, string];
      startTower(h, 'high');
      const r = tr(h);
      r.players[b]!.height = 8;
      r.players[c]!.height = 7;
      r.players[d]!.height = 9;
      // A liegt mit 3,2 hinten, D mit 9,4 vorne.
      expectOk(h.act(a, { type: 'tower_mark', height: 3.2 }));
      expectOk(h.act(d, { type: 'tower_mark', height: 9.4 }));
      behindValue += TOWER_SPECIALS[r.players[a]!.offer!.light].value;
      frontValue += TOWER_SPECIALS[r.players[d]!.offer!.light].value;
    }
    expect(behindValue).toBeGreaterThan(frontValue + 5);
  });

  test('Angebot: hell oder dunkel wählen, nur Eigenes sichtbar, neues Angebot ersetzt', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTower(h);
    expectOk(h.act(a, { type: 'tower_mark', height: 3.1 }));
    const offer = viewRound(h, a).my!.offer!;
    expect(TOWER_SPECIALS[offer.light].group).toBe('light');
    expect(TOWER_SPECIALS[offer.dark].group).toBe('dark');
    expect(viewRound(h, b).my!.offer).toBeNull();
    expect(viewRound(h, null).my).toBeUndefined();
    expect(viewRound(h, null).pool).toHaveLength(8);
    expectOk(h.act(a, { type: 'tower_choose', side: 'dark' }));
    expect(tr(h).players[a]!.stock).toEqual([offer.dark]);
    expect(tr(h).players[a]!.offer).toBeNull();
    // Ein neues Angebot kommt hinten in den Vorrat.
    expectOk(h.act(a, { type: 'tower_mark', height: 6.2 }));
    const second = tr(h).players[a]!.offer!;
    expectOk(h.act(a, { type: 'tower_choose', side: 'light' }));
    expect(tr(h).players[a]!.stock).toEqual([offer.dark, second.light]);
  });

  test('Glücks-Slot: alle 10–20 s ein Zauber, nicht stapelbar, Einsatz aus dem Glück', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTower(h);
    const p = tr(h).players[a]!;
    expect(p.luckAt - tr(h).goAt).toBeGreaterThanOrEqual(TOWER_LUCK_MIN_MS);
    expect(p.luckAt - tr(h).goAt).toBeLessThanOrEqual(TOWER_LUCK_MAX_MS);
    h.scheduler.advance(TOWER_LUCK_MAX_MS);
    expect(p.luck).not.toBeNull();
    expect(tr(h).players[b]!.luck).not.toBeNull();
    expect(viewRound(h, b).players[a]?.hasLuck).toBe(true);
    expect(viewRound(h, b).my?.luck).toBe(tr(h).players[b]!.luck);
    // Der nächste ersetzt den ungenutzten, es bleibt einer.
    const next = p.luckAt;
    expect(next - h.room.now).toBeGreaterThan(0);
    h.scheduler.advance(next - h.room.now);
    expect(p.luck).not.toBeNull();
    expect(p.luckAt).toBeGreaterThan(next);
    // Einsetzen aus dem Glück leert nur den Glücks-Slot.
    give(h, a, 'fog');
    const luck = p.luck!;
    expectOk(h.act(a, { type: 'tower_special_use', from: 'luck', special: luck, ...(TOWER_SPECIALS[luck].group === 'dark' ? { targetId: b } : {}) }));
    expect(p.luck).toBeNull();
    expect(p.stock).toEqual(['fog']);
    expect(h.act(a, { type: 'tower_special_use', from: 'luck', special: luck, ...(TOWER_SPECIALS[luck].group === 'dark' ? { targetId: b } : {}) }).ok).toBe(false);
  });

  test('Glücks-Slot endet mit der Runde', () => {
    const h = makeHarness(['A', 'B']);
    const [a] = h.ids as [string, string];
    startTower(h);
    expectOk(h.act(a, { type: 'end_round' }));
    h.scheduler.advance(TOWER_LUCK_MAX_MS * 2);
    expect(tr(h).players[a]!.luck).toBeNull();
  });

  test('Störer kommt beim Ziel an, Helfer wirkt auf sich selbst', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b, c] = h.ids as [string, string, string];
    startTower(h);
    give(h, a, 'ice');
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'ice' }).ok).toBe(false);
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'ice', targetId: a }).ok).toBe(false);
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'gust', targetId: b }).ok).toBe(false);
    expectOk(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'ice', targetId: b }));
    expect(tr(h).players[a]!.stock).toEqual([]);
    const effect = viewRound(h, b).effects[0]!;
    expect(effect).toMatchObject({ special: 'ice', by: a, target: b });
    expect(effect.until - effect.at).toBe(TOWER_SPECIALS.ice.durationMs);
    // Alle sehen den Effekt, auch der Fernseher.
    expect(viewRound(h, null).effects).toHaveLength(1);
    // Kein zweites Einsetzen ohne Vorrat.
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'ice', targetId: c }).ok).toBe(false);

    give(h, c, 'glue');
    expect(h.act(c, { type: 'tower_special_use', from: 'stock', special: 'glue', targetId: a }).ok).toBe(false);
    expectOk(h.act(c, { type: 'tower_special_use', from: 'stock', special: 'glue' }));
    const glue = viewRound(h, c).effects.find((e) => e.special === 'glue')!;
    expect(glue.target).toBe(c);
    expect(glue.until - glue.at).toBe(TOWER_EFFECT_SHOW_MS);

    // Abgelaufene Effekte verschwinden aus der Sicht.
    h.scheduler.advance(TOWER_SPECIALS.ice.durationMs + 1);
    expect(viewRound(h, b).effects).toHaveLength(0);
  });
});

describe('Hochstapler: Ziel und Rangliste', () => {
  test('unplausibles und doppeltes Finish wird abgelehnt', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTower(h, 'low');
    expect(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low - 0.5 }).ok).toBe(false);
    // Zu früh nach dem Start.
    expect(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low + 0.2 }).ok).toBe(false);
    h.scheduler.advance(TOWER_MIN_FINISH_MS);
    expect(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low - 0.5 }).ok).toBe(false);
    expect(h.room.phase).toBe('playing');
    expectOk(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low + 0.2 }));
    expect(h.room.phase).toBe('reveal');
    expect(h.act(a, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low + 0.2 }).ok).toBe(false);
    expect(h.act(b, { type: 'tower_finish', height: TOWER_GOAL_HEIGHT.low + 1 }).ok).toBe(false);
    expect(tr(h).winners).toEqual([a]);
  });

  test('Sieger vorne, Rest nach Höhe, Punktevorschlag Spielerzahl − Platz + 1', () => {
    const h = moderated(['Host', 'A', 'B', 'C', 'D']);
    const [, a, b, c, d] = h.ids as [string, string, string, string, string];
    startTower(h, 'mid');
    expect(acceptTowerFrame(h.room, a, frame(4.2))).toBe(true);
    expect(acceptTowerFrame(h.room, b, frame(8.7))).toBe(true);
    expect(acceptTowerFrame(h.room, d, frame(8.7))).toBe(true);
    // Der Host baut nicht mit, seine Frames zählen nicht.
    expect(acceptTowerFrame(h.room, h.host, frame(20))).toBe(false);
    expect(viewRound(h, null).players[b]?.height).toBe(8.7);
    h.scheduler.advance(30_000);
    expectOk(h.act(c, { type: 'tower_finish', height: 16.3 }));
    const v = viewRound(h, a);
    expect(v.winners).toEqual([c]);
    expect(v.ranking?.map((r) => [r.playerId, r.rank])).toEqual([
      [c, 1],
      [b, 2],
      [d, 2],
      [a, 4],
    ]);
    expect(v.points).toEqual({ [c]: 4, [b]: 3, [d]: 3, [a]: 1 });
    expect(v.effects).toEqual([]);
    // Nach dem Rennen werden keine Frames mehr angenommen, die letzten bleiben für die Auflösung.
    expect(acceptTowerFrame(h.room, a, frame(9))).toBe(false);
    expect(tr(h).frames[a]?.h).toBe(4.2);
  });

  test('Host beendet vorzeitig: Rangliste nur nach Höhe', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTower(h);
    acceptTowerFrame(h.room, b, frame(3));
    expect(h.act(b, { type: 'end_round' }).ok).toBe(false);
    expectOk(h.act(a, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, a).ranking?.map((r) => r.playerId)).toEqual([b, a]);
    expectOk(h.act(a, { type: 'to_scoring' }));
    expectOk(h.act(a, { type: 'submit_scores', scores: { [a]: 1, [b]: 2 } }));
    expect(h.room.rounds[0]).toMatchObject({ gameId: 'tower', categoryTitle: 'Hochstapler' });
  });

  test('Spieler weg: Turm, Frames und seine Effekte verschwinden, die Runde läuft weiter', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b, c] = h.ids as [string, string, string];
    startTower(h);
    acceptTowerFrame(h.room, b, frame(2));
    give(h, b, 'turbo');
    expectOk(h.act(b, { type: 'tower_special_use', from: 'stock', special: 'turbo', targetId: c }));
    expectOk(h.room.leave(b));
    const r = tr(h);
    expect(r.turnOrder).toEqual([a, c]);
    expect(r.players[b]).toBeUndefined();
    expect(r.frames[b]).toBeUndefined();
    expect(r.effects).toHaveLength(0);
    expect(h.room.phase).toBe('playing');
    // Störer gegen jemanden, der weg ist, gehen nicht.
    give(h, a, 'gust');
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'gust', targetId: b }).ok).toBe(false);
    expectOk(h.room.leave(c));
    expectOk(h.room.leave(a));
  });

  test('Host geht: der Nachfolger baut weiter', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b] = h.ids as [string, string, string];
    startTower(h);
    expectOk(h.room.leave(a));
    expect(h.room.hostId).toBe(b);
    expect(tr(h).turnOrder).toContain(b);
    expectOk(h.act(b, { type: 'end_round' }));
  });
});

describe('Hochstapler: Validierung', () => {
  test('Nachrichten', () => {
    expect(isClientMsg({ type: 'tower_special_use', from: 'stock', special: 'ice', targetId: 'x' })).toBe(true);
    expect(isClientMsg({ type: 'tower_special_use', from: 'luck', special: 'heavy' })).toBe(true);
    expect(isClientMsg({ type: 'tower_special_use', special: 'ice', targetId: 'x' })).toBe(false);
    expect(isClientMsg({ type: 'tower_special_use', from: 'stock', special: 'shield' })).toBe(false);
    expect(isClientMsg({ type: 'tower_special_use', from: 'stock', special: 'laser' })).toBe(false);
    expect(isClientMsg({ type: 'tower_mark', height: 3 })).toBe(true);
    expect(isClientMsg({ type: 'tower_mark', height: 3, piece: 4 })).toBe(true);
    expect(isClientMsg({ type: 'tower_mark', height: -1 })).toBe(false);
    expect(isClientMsg({ type: 'tower_mark', height: 3, piece: 1.5 })).toBe(false);
    expect(isClientMsg({ type: 'tower_finish', height: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isClientMsg({ type: 'tower_finish', height: 12 })).toBe(true);
    expect(isClientMsg({ type: 'tower_frame', frame: frame(1) })).toBe(true);
    expect(isClientMsg({ type: 'tower_frame', frame: { ...frame(1), s: [1] } })).toBe(false);
    expect(isClientMsg({ type: 'choose_category', gameId: 'tower', categoryId: 'tower', tower: { goal: 'mid' } })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'tower', categoryId: 'tower', tower: { goal: 'top' } })).toBe(false);
  });

  test('Frames über room.handle werden abgewiesen, Aktionen außerhalb der Runde auch', () => {
    const h = makeHarness(['A', 'B']);
    const [a] = h.ids as [string, string];
    startTower(h);
    expect(h.act(a, { type: 'tower_frame', frame: frame(1) }).ok).toBe(false);
    expectOk(h.act(a, { type: 'end_round' }));
    expect(h.act(a, { type: 'tower_mark', height: 4 }).ok).toBe(false);
    give(h, a, 'fog');
    expect(h.act(a, { type: 'tower_special_use', from: 'stock', special: 'fog', targetId: h.ids[1] }).ok).toBe(false);
  });
});
