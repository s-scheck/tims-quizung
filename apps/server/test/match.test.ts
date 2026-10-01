import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { MatchRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startMatch, type Harness } from './fixtures.ts';

function mr(h: Harness): MatchRound {
  const round = h.room.round;
  if (round?.game !== 'match') throw new Error('keine Zuordnen-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'match') throw new Error('keine Zuordnen-Runde in der Sicht');
  return round;
}

/** Richtiges Ziel einer Karte, serverseitig nachgeschlagen. */
function solutionTarget(h: Harness, cardId: string): string {
  return mr(h).targets.find((t) => t.solutionCardId === cardId)!.id;
}

function decoyTarget(h: Harness): string {
  const r = mr(h);
  return r.targets.find((t) => t.solutionCardId === null && !r.matched[t.id])!.id;
}

/** Aktiver Spieler ordnet zu und die Auflösung läuft komplett durch. */
function assign(h: Harness, cardId: string, targetId: string): void {
  const r = mr(h);
  const active = r.activePlayerId!;
  expectOk(h.act(active, { type: 'select', turnNo: r.turnNo, cardId, targetId }));
  expectOk(h.act(active, { type: 'confirm', turnNo: r.turnNo }));
  h.scheduler.advance(2000);
  h.scheduler.advance(1500);
}

describe('Zuordnen: Rundenstart', () => {
  test('Karten im Pool, Ziele mit Ködern, Leben verteilt', () => {
    const h = makeHarness(['A', 'B']);
    startMatch(h, 2);
    const r = mr(h);
    expect(h.room.phase).toBe('playing');
    expect(h.room.gameId).toBe('match');
    expect(r.cards.length).toBe(4);
    expect(r.pool.length).toBe(4);
    expect(r.targets.length).toBe(6);
    expect(r.targets.filter((t) => t.solutionCardId === null).map((t) => t.text).sort()).toEqual(['Chile', 'Lettland']);
    for (const card of r.cards) {
      const target = r.targets.find((t) => t.solutionCardId === card.id)!;
      const pair = { Paris: 'Frankreich', Lima: 'Peru', Oslo: 'Norwegen', Ankara: 'Türkei' }[card.text];
      expect(target.text).toBe(pair!);
    }
    expect(r.lives).toEqual({ [h.ids[0]!]: 2, [h.ids[1]!]: 2 });
    expect(h.room.defaultLives).toBe(2);
    expect(r.matched).toEqual({});
  });

  test('öffentliche Sicht ohne Lösung, Host-Sicht mit Lösung und Ködern', () => {
    const h = makeHarness(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
    startMatch(h);
    const pub = viewRound(h, null);
    expect(pub.privileged).toBeUndefined();
    expect(pub.targets.every((t) => t.solutionCardId === undefined && t.decoy === undefined && t.matchedCardId === null)).toBe(true);
    expect(JSON.stringify(pub)).not.toContain('solutionCardId');
    expect(pub.cards.map((c) => c.text).sort()).toEqual(['Ankara', 'Lima', 'Oslo', 'Paris']);
    expect(JSON.stringify(viewRound(h, h.ids[1]!))).not.toContain('decoy');

    const host = viewRound(h, h.host);
    expect(host.privileged).toBe(true);
    expect(host.targets.filter((t) => t.decoy).map((t) => t.text).sort()).toEqual(['Chile', 'Lettland']);
    const paris = host.cards.find((c) => c.text === 'Paris')!;
    expect(host.targets.find((t) => t.solutionCardId === paris.id)?.text).toBe('Frankreich');
    expect(mr(h).turnOrder).toEqual([h.ids[1]!]);
  });
});

describe('Zuordnen: Züge', () => {
  test('Auswahl prüft Pool, Ziel und Belegung', () => {
    const h = makeHarness(['A', 'B']);
    startMatch(h);
    const r = mr(h);
    const [a, b] = h.ids as [string, string];
    const card = r.pool[0]!;
    expect(h.act(b, { type: 'select', turnNo: 1, cardId: card })).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(h.act(a, { type: 'select', turnNo: 1, cardId: 'k99' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(a, { type: 'select', turnNo: 1, targetId: 't99' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(a, { type: 'confirm', turnNo: 1 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(a, { type: 'select', turnNo: 1, cardId: card }));
    expect(viewRound(h, null).selection).toEqual({ cardId: card });
    expectOk(h.act(a, { type: 'select', turnNo: 1, cardId: card, targetId: solutionTarget(h, card) }));
    expect(viewRound(h, b).selection).toEqual({ cardId: card, targetId: solutionTarget(h, card) });
  });

  test('richtige Zuordnung: pending, correct, Ziel belegt, Zugwechsel', () => {
    const h = makeHarness(['A', 'B']);
    startMatch(h);
    const r = mr(h);
    const [a, b] = h.ids as [string, string];
    const card = r.pool[1]!;
    const target = solutionTarget(h, card);
    expectOk(h.act(a, { type: 'select', turnNo: 1, cardId: card, targetId: target }));
    expectOk(h.act(a, { type: 'confirm', turnNo: 1 }));
    expect(r.pool).not.toContain(card);
    expect(r.attempt).toMatchObject({ cardId: card, targetId: target, poolIndex: 1, status: 'pending', by: a });
    expect(r.attempt!.resolveAt).toBe(h.scheduler.now() + 2000);
    expect(h.act(a, { type: 'confirm', turnNo: 1 })).toMatchObject({ ok: false });

    h.scheduler.advance(2000);
    expect(r.attempt?.status).toBe('correct');
    expect(viewRound(h, null).attempt?.status).toBe('correct');

    h.scheduler.advance(1500);
    expect(r.attempt).toBeNull();
    expect(r.matched[target]).toEqual({ cardId: card, by: a });
    expect(r.hits[a]).toBe(1);
    expect(r.lives[a]).toBe(3);
    expect(r.activePlayerId).toBe(b);
    expect(r.turnNo).toBe(2);
    const pub = viewRound(h, null);
    expect(pub.targets.find((t) => t.id === target)).toMatchObject({ matchedCardId: card, matchedBy: a });
    expect(h.act(b, { type: 'select', turnNo: 2, targetId: target })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('falsche Zuordnung auf Köder: Karte zurück an ihre Poolposition, Leben weg', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startMatch(h);
    const r = mr(h);
    const poolBefore = [...r.pool];
    const card = r.pool[2]!;
    const decoy = decoyTarget(h);
    expectOk(h.act(h.ids[0]!, { type: 'select', turnNo: 1, cardId: card, targetId: decoy }));
    expectOk(h.act(h.ids[0]!, { type: 'confirm', turnNo: 1 }));
    h.scheduler.advance(2000);
    expect(r.attempt?.status).toBe('wrong');
    h.scheduler.advance(1500);
    expect(r.pool).toEqual(poolBefore);
    expect(r.matched).toEqual({});
    expect(r.lives[h.ids[0]!]).toBe(2);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    // Der Köder verrät sich nicht und bleibt wählbar.
    expect(viewRound(h, null).targets.find((t) => t.id === decoy)).toEqual({ id: decoy, text: r.targets.find((t) => t.id === decoy)!.text, matchedCardId: null });
    expectOk(h.act(h.ids[1]!, { type: 'select', turnNo: 2, targetId: decoy }));
  });

  test('falsches echtes Ziel und Wiederholung kosten jeweils ein Leben', () => {
    const h = makeHarness(['A']);
    startMatch(h, 5);
    const r = mr(h);
    const card = r.pool[0]!;
    const other = r.pool[1]!;
    const wrongTarget = solutionTarget(h, other);
    assign(h, card, wrongTarget);
    expect(r.lives[h.host]).toBe(4);
    assign(h, card, wrongTarget);
    expect(r.lives[h.host]).toBe(3);
    assign(h, other, wrongTarget);
    expect(r.matched[wrongTarget]).toEqual({ cardId: other, by: h.host });
    expect(r.lives[h.host]).toBe(3);
  });

  test('ohne Leben raus, bei einem Übrigen entscheidet der Host', () => {
    const h = makeHarness(['A', 'B']);
    startMatch(h, 1);
    const r = mr(h);
    assign(h, r.pool[0]!, decoyTarget(h));
    expect(r.eliminated).toEqual([h.ids[0]!]);
    expect(h.room.phase).toBe('host_decision');
    expectOk(h.act(h.host, { type: 'host_decision', continue: false }));
    expect(h.room.phase).toBe('reveal');
    const pub = viewRound(h, null);
    expect(pub.targets.every((t) => t.solutionCardId !== undefined && typeof t.decoy === 'boolean')).toBe(true);
  });

  test('alle Karten zugeordnet beendet die Runde', () => {
    const h = makeHarness(['A']);
    startMatch(h, 5);
    const r = mr(h);
    while (r.pool.length > 0) {
      const card = r.pool[0]!;
      assign(h, card, solutionTarget(h, card));
    }
    expect(h.room.phase).toBe('reveal');
    expect(Object.keys(r.matched).length).toBe(4);
    expect(r.hits[h.host]).toBe(4);
    expect(r.lives[h.host]).toBe(5);
  });

  test('Timer-Ablauf und Überspringen kosten ein Leben, Timer pausiert während der Auflösung', () => {
    const h = makeHarness(['A', 'B', 'C'], { timer: 30 });
    startMatch(h);
    const r = mr(h);
    h.scheduler.advance(30_000);
    expect(r.lives[h.ids[0]!]).toBe(2);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expectOk(h.act(h.host, { type: 'skip_turn', turnNo: r.turnNo }));
    expect(r.lives[h.ids[1]!]).toBe(2);
    expect(r.activePlayerId).toBe(h.ids[2]!);
    const card = r.pool[0]!;
    h.scheduler.advance(29_000);
    expectOk(h.act(h.ids[2]!, { type: 'select', turnNo: r.turnNo, cardId: card, targetId: solutionTarget(h, card) }));
    expectOk(h.act(h.ids[2]!, { type: 'confirm', turnNo: r.turnNo }));
    expect(r.turnDeadline).toBeNull();
    h.scheduler.advance(3500);
    expect(r.lives[h.ids[2]!]).toBe(3);
    expect(r.activePlayerId).toBe(h.ids[0]!);
    expect(r.turnDeadline).toBe(h.scheduler.now() + 30_000);
  });

  test('Spieler verlässt den Raum während seine Zuordnung läuft', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startMatch(h);
    const r = mr(h);
    const card = r.pool[0]!;
    expectOk(h.act(h.ids[0]!, { type: 'select', turnNo: 1, cardId: card, targetId: solutionTarget(h, card) }));
    expectOk(h.act(h.ids[0]!, { type: 'confirm', turnNo: 1 }));
    expectOk(h.room.leave(h.ids[0]!));
    h.scheduler.advance(3500);
    expect(Object.keys(r.matched).length).toBe(1);
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(h.room.phase).toBe('playing');
    expect([h.ids[1]!, h.ids[2]!]).toContain(r.activePlayerId!);
  });
});
