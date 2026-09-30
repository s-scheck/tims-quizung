import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import { expectOk, makeHarness, place, resolve, startRound } from './fixtures.ts';
import type { SortRound } from '../src/rooms/state.ts';

function selectionOf(h: ReturnType<typeof makeHarness>) {
  const round = toView(h.room, null).round;
  return round?.game === 'sort' ? round.selection : undefined;
}

function sr(h: ReturnType<typeof makeHarness>): SortRound {
  const round = h.room.round;
  if (round?.game !== 'sort') throw new Error('keine Sortieren-Runde');
  return round;
}

describe('Rundenstart', () => {
  test('Kategoriewahl nur durch Host, unbekannte Kategorie abgelehnt', () => {
    const h = makeHarness(['A', 'B']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.ids[1]!, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'xyz' })).toMatchObject({ ok: false, code: 'unknown_category' });
  });

  test('Startkarte in der Kette, Rest offen im Pool, Zugreihenfolge nach Beitritt', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    const r = sr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.chain).toEqual([r.startCardId]);
    expect(r.pool.length).toBe(9);
    expect(r.pool).not.toContain(r.startCardId);
    expect(r.turnOrder).toEqual(h.ids);
    expect(r.activePlayerId).toBe(h.ids[0]!);
    expect(r.turnNo).toBe(1);
    expect(r.soloMode).toBe(false);
    expect(r.turnDeadline).toBeNull();
  });

  test('Sicht verrät während des Spiels keine Werte, ab der Auflösung schon', () => {
    const h = makeHarness(['A']);
    startRound(h);
    const playing = toView(h.room, null);
    expect(JSON.stringify(playing.round)).not.toContain('"value"');
    expect(playing.round?.solution).toBeUndefined();
    expect(playing.round?.game === 'sort' && playing.round.cards.length).toBe(10);
    place(h, false);
    resolve(h);
    expect(h.room.phase).toBe('reveal');
    const revealed = toView(h.room, null);
    const rv = revealed.round;
    if (rv?.game !== 'sort') throw new Error('keine Sortieren-Runde');
    expect(rv.cards.every((c) => typeof c.value === 'number')).toBe(true);
    expect(rv.solution?.length).toBe(10);
    const values = rv.solution!.map((id) => rv.cards.find((c) => c.id === id)!.value!);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  test('moderierender Host ist nicht in der Zugreihenfolge und bekommt keine Punkte', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
    startRound(h);
    expect(sr(h).turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(sr(h).soloMode).toBe(false);
    place(h, false);
    resolve(h);
    expect(h.room.phase).toBe('host_decision');
    expectOk(h.act(h.host, { type: 'host_decision', continue: false }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [h.host]: 5, [h.ids[2]!]: 2 } }));
    expect(h.room.scores[h.host]).toBe(0);
    expect(h.room.scores[h.ids[2]!]).toBe(2);
    expect(h.room.rounds[0]!.scores[h.host]).toBeUndefined();
  });

  test('moderierender Host allein: Runde startet nicht', () => {
    const h = makeHarness(['Host']);
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.room.phase).toBe('choosing_category');
  });

  test('getrennte Spieler sind in dieser Runde nicht dabei', () => {
    const h = makeHarness(['A', 'B', 'C']);
    h.room.setConnected(h.ids[1]!, false);
    startRound(h);
    expect(sr(h).turnOrder).toEqual([h.ids[0]!, h.ids[2]!]);
  });

  test('Startspieler rotiert von Runde zu Runde', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    expect(sr(h).turnOrder[0]).toBe(h.ids[0]!);
    finishRound(h);
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'times' }));
    expect(sr(h).turnOrder).toEqual([h.ids[1]!, h.ids[2]!, h.ids[0]!]);
    finishRound(h);
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' }));
    expect(sr(h).turnOrder[0]).toBe(h.ids[2]!);
  });
});

/** Beendet die laufende Runde über Host-Entscheidung/Auflösung und Punkte, bis `choosing_category`. */
function finishRound(h: ReturnType<typeof makeHarness>): void {
  while (h.room.phase === 'playing') {
    place(h, false);
    resolve(h);
  }
  if (h.room.phase === 'host_decision') expectOk(h.act(h.host, { type: 'host_decision', continue: false }));
  expect(h.room.phase).toBe('reveal');
  expectOk(h.act(h.host, { type: 'to_scoring' }));
  expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
  expectOk(h.act(h.host, { type: 'next_round' }));
  expect(h.room.phase).toBe('choosing_category');
}

describe('Auswahl und Bestätigung', () => {
  test('nur der aktive Spieler, nur Poolkarten, nur existierende Lücken', () => {
    const h = makeHarness(['A', 'B']);
    startRound(h);
    const r = sr(h);
    const [a, b] = h.ids as [string, string];
    expect(h.act(b, { type: 'select', turnNo: 1, cardId: r.pool[0]! })).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(h.act(a, { type: 'select', turnNo: 1, cardId: r.startCardId })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(a, { type: 'select', turnNo: 1, gapIndex: 2 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(a, { type: 'select', turnNo: 2, cardId: r.pool[0]! })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(a, { type: 'confirm', turnNo: 1 })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(a, { type: 'select', turnNo: 1, cardId: r.pool[0]! }));
    expect(selectionOf(h)).toEqual({ cardId: r.pool[0]! });
    expectOk(h.act(a, { type: 'select', turnNo: 1, cardId: r.pool[0]!, gapIndex: 1 }));
    expect(selectionOf(h)).toEqual({ cardId: r.pool[0]!, gapIndex: 1 });
    expectOk(h.act(a, { type: 'select', turnNo: 1 }));
    expect(selectionOf(h)).toEqual({});
  });

  test('richtige Platzierung: pending, dann correct, dann Zugwechsel', () => {
    const h = makeHarness(['A', 'B']);
    startRound(h);
    const r = sr(h);
    const emitsBefore = h.emits.length;
    const { cardId, gapIndex } = place(h, true);

    expect(r.chain[gapIndex]).toBe(cardId);
    expect(r.pool).not.toContain(cardId);
    expect(r.placement).toMatchObject({ cardId, gapIndex, status: 'pending', by: h.ids[0]! });
    expect(r.placement!.resolveAt).toBe(h.scheduler.now() + 2000);
    expect(r.placement!.applyAt).toBe(h.scheduler.now() + 3500);
    expect(h.act(h.ids[0]!, { type: 'confirm', turnNo: 1 })).toMatchObject({ ok: false });

    h.scheduler.advance(2000);
    expect(r.placement?.status).toBe('correct');
    expect(h.emits.length).toBe(emitsBefore + 3);

    h.scheduler.advance(1500);
    expect(r.placement).toBeNull();
    expect(r.chain).toContain(cardId);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(r.turnNo).toBe(2);
    expect(r.eliminated).toEqual([]);
    expect(r.selection).toEqual({});
  });

  test('falsche Platzierung: Karte zurück an ihre Poolposition, Spieler raus', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    const r = sr(h);
    const poolBefore = [...r.pool];
    const { cardId } = place(h, false);
    h.scheduler.advance(2000);
    expect(r.placement?.status).toBe('wrong');
    expect(r.chain).toContain(cardId);
    h.scheduler.advance(1500);
    expect(r.chain).toEqual([r.startCardId]);
    expect(r.pool).toEqual(poolBefore);
    expect(r.eliminated).toEqual([h.ids[0]!]);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(h.room.phase).toBe('playing');
  });
});

describe('Rundenende und Host-Entscheidung', () => {
  test('zwei Spieler: erster Fehler führt zur Host-Entscheidung', () => {
    const h = makeHarness(['A', 'B']);
    startRound(h);
    place(h, false);
    resolve(h);
    expect(h.room.phase).toBe('host_decision');
    expect(sr(h).activePlayerId).toBe(h.ids[1]!);
    expect(h.act(h.ids[1]!, { type: 'host_decision', continue: false })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'host_decision', continue: false }));
    expect(h.room.phase).toBe('reveal');
    expect(sr(h).activePlayerId).toBeNull();
  });

  test('Weiterspielen lassen: Letzter spielt allein bis zum Fehler', () => {
    const h = makeHarness(['A', 'B']);
    startRound(h);
    place(h, false);
    resolve(h);
    expectOk(h.act(h.host, { type: 'host_decision', continue: true }));
    const r = sr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.soloMode).toBe(true);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    place(h, true);
    resolve(h);
    expect(h.room.phase).toBe('playing');
    expect(r.activePlayerId).toBe(h.ids[1]!);
    place(h, false);
    resolve(h);
    expect(h.room.phase).toBe('reveal');
  });

  test('Weiterspielen lassen: alle Karten richtig legen beendet die Runde', () => {
    const h = makeHarness(['A', 'B']);
    startRound(h);
    place(h, false);
    resolve(h);
    expectOk(h.act(h.host, { type: 'host_decision', continue: true }));
    while (h.room.phase === 'playing') {
      place(h, true);
      resolve(h);
    }
    expect(h.room.phase).toBe('reveal');
    expect(sr(h).pool).toEqual([]);
    expect(sr(h).chain.length).toBe(10);
  });

  test('allein im Raum: keine Host-Entscheidung, Fehler beendet die Runde', () => {
    const h = makeHarness(['A']);
    startRound(h);
    expect(sr(h).soloMode).toBe(true);
    place(h, true);
    resolve(h);
    expect(h.room.phase).toBe('playing');
    place(h, false);
    resolve(h);
    expect(h.room.phase).toBe('reveal');
  });

  test('drei Spieler: zwei Fehler, dann Host-Entscheidung für den Dritten', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    place(h, false);
    resolve(h);
    place(h, false);
    resolve(h);
    expect(h.room.phase).toBe('host_decision');
    expect(sr(h).eliminated).toEqual([h.ids[0]!, h.ids[1]!]);
    expect(sr(h).activePlayerId).toBe(h.ids[2]!);
  });
});

describe('Timer und Überspringen', () => {
  test('Timer läuft ab: Spieler scheidet aus, nächster ist dran', () => {
    const h = makeHarness(['A', 'B', 'C'], { timer: 30 });
    startRound(h);
    const r = sr(h);
    expect(r.turnDeadline).toBe(h.scheduler.now() + 30_000);
    h.scheduler.advance(29_999);
    expect(r.eliminated).toEqual([]);
    h.scheduler.advance(1);
    expect(r.eliminated).toEqual([h.ids[0]!]);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(r.turnNo).toBe(2);
    expect(r.turnDeadline).toBe(h.scheduler.now() + 30_000);
  });

  test('Timer pausiert während der Platzierung', () => {
    const h = makeHarness(['A', 'B', 'C'], { timer: 30 });
    startRound(h);
    const r = sr(h);
    h.scheduler.advance(29_000);
    place(h, true);
    expect(r.turnDeadline).toBeNull();
    h.scheduler.advance(2000);
    h.scheduler.advance(1500);
    expect(r.eliminated).toEqual([]);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(h.scheduler.pending).toBe(1);
  });

  test('Host kann den Zug überspringen', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    const r = sr(h);
    expect(h.act(h.ids[1]!, { type: 'skip_turn', turnNo: 1 })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'skip_turn', turnNo: 1 }));
    expect(r.eliminated).toEqual([h.ids[0]!]);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(h.act(h.host, { type: 'skip_turn', turnNo: 1 })).toMatchObject({ ok: false });
  });
});

describe('Auflösung, Punkte, Rundenwechsel', () => {
  test('kompletter Ablauf bis Endstand und zurück in die Lobby', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startRound(h);
    place(h, false);
    resolve(h);
    expectOk(h.act(h.host, { type: 'host_decision', continue: false }));

    expect(h.act(h.host, { type: 'submit_scores', scores: {} })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(h.room.phase).toBe('scoring');
    expect(h.act(h.host, { type: 'submit_scores', scores: { [a]: 1.5 } })).toMatchObject({ ok: false, code: 'bad_message' });
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [b]: 3, fremd: 9 } }));
    expect(h.room.phase).toBe('scoreboard');
    expect(h.room.scores).toEqual({ [a]: 0, [b]: 3 });
    expect(h.room.rounds).toEqual([
      { gameId: 'sort', categoryId: 'cities', categoryTitle: 'Städte', survivors: [b], eliminatedOrder: [a], scores: { [a]: 0, [b]: 3 } },
    ]);

    expectOk(h.act(h.host, { type: 'next_round' }));
    expect(h.room.phase).toBe('choosing_category');
    expect(h.room.round).toBeNull();
    expect(toView(h.room, null).categories?.find((c) => c.id === 'cities')?.played).toBe(true);

    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'times' }));
    place(h, false);
    resolve(h);
    expectOk(h.act(h.host, { type: 'host_decision', continue: false }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [a]: -1, [b]: 2 } }));
    expect(h.room.scores).toEqual({ [a]: -1, [b]: 5 });

    expectOk(h.act(h.host, { type: 'end_game' }));
    expect(h.room.phase).toBe('finished');
    expect(h.act(h.host, { type: 'start_game' })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'back_to_lobby' }));
    expect(h.room.phase).toBe('lobby');
    expect(h.room.gameId).toBeNull();
    expect(h.room.scores).toEqual({ [a]: -1, [b]: 5 });
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.room.scores).toEqual({ [a]: 0, [b]: 0 });
  });

  test('Spiel beenden ist auch bei der Kategoriewahl möglich', () => {
    const h = makeHarness(['A']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expectOk(h.act(h.host, { type: 'end_game' }));
    expect(h.room.phase).toBe('finished');
  });
});

describe('Spieler kommen und gehen', () => {
  test('später Beitritt: Zuschauer in dieser Runde, dabei in der nächsten', () => {
    const h = makeHarness(['A', 'B']);
    startRound(h);
    const late = h.room.join('Spät', undefined);
    if (!late.ok) throw new Error();
    expect(sr(h).turnOrder).not.toContain(late.player.id);
    expect(h.room.scores[late.player.id]).toBe(0);
    finishRound(h);
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'times' }));
    expect(sr(h).turnOrder).toContain(late.player.id);
  });

  test('aktiver Spieler verlässt den Raum: Nachfolger ist dran', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    const r = sr(h);
    expectOk(h.room.leave(h.ids[0]!));
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(h.room.hostId).toBe(h.ids[1]!);
    expect(h.room.phase).toBe('playing');
  });

  test('Verlassen während einer laufenden Platzierung stört den Ablauf nicht', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    const r = sr(h);
    const { cardId } = place(h, true);
    expectOk(h.room.leave(h.ids[0]!));
    resolve(h);
    expect(r.chain).toContain(cardId);
    expect(r.placement).toBeNull();
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect([h.ids[1]!, h.ids[2]!]).toContain(r.activePlayerId!);
    expect(h.room.phase).toBe('playing');
  });

  test('Verlassen kann die Host-Entscheidung auslösen oder die Runde beenden', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    place(h, false);
    resolve(h);
    expectOk(h.room.leave(h.ids[1]!));
    expect(h.room.phase).toBe('host_decision');
    expect(sr(h).activePlayerId).toBe(h.ids[2]!);
    expectOk(h.room.leave(h.ids[2]!));
    expect(h.room.phase).toBe('reveal');
  });

  test('Nichtaktiver geht: Zug bleibt beim aktiven Spieler', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startRound(h);
    expectOk(h.room.leave(h.ids[2]!));
    expect(sr(h).activePlayerId).toBe(h.ids[0]!);
    expect(h.room.phase).toBe('playing');
  });
});
