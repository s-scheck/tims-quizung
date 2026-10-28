import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { FacesRound } from '../src/rooms/state.ts';
import { MAX_ATTEMPTS } from '../src/games/faces/reducer.ts';
import { expectOk, makeHarness, startFaces, type Harness } from './fixtures.ts';

function fr(h: Harness): FacesRound {
  const round = h.room.round;
  if (round?.game !== 'faces') throw new Error('keine Wer-ist-das-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'faces') throw new Error('keine Wer-ist-das-Runde in der Sicht');
  return round;
}

describe('Wer ist das?: Rundenstart', () => {
  test('Host wählt die Person, rät nie mit, Effekt und Startwert werden übernommen', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startFaces(h, { targetId: 'barack-obama', effect: 'tiles', cols: 4 });
    const r = fr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.target.id).toBe('barack-obama');
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBeNull();
    expect(r.effect).toEqual({ effect: 'tiles', level: 80, cols: 4, revealed: [] });
    expect(h.room.playedTargets['promi-politik']).toEqual(['barack-obama']);
    expect(viewRound(h, null).image).toBe('/images/p2-obama.jpg');
  });

  test('ohne Angabe zieht der Server ungespielte Personen, Werte werden geklammert', () => {
    const h = makeHarness(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
    startFaces(h, { effect: 'blur', level: 100 });
    expect(fr(h).effect).toMatchObject({ effect: 'blur', level: 100, cols: 6 });
    const first = fr(h).target.id;
    expectOk(h.act(h.host, { type: 'end_round' }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
    expectOk(h.act(h.host, { type: 'next_round' }));
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'faces', categoryId: 'promi-politik' }));
    expect(fr(h).target.id).not.toBe(first);
    expect(fr(h).effect).toEqual({ effect: 'blur', level: 80, cols: 6, revealed: [] });
  });

  test('ohne Mitspieler außer dem Host geht es nicht los, Zielliste nur beim Host', () => {
    const h = makeHarness(['Allein']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'faces', categoryId: 'promi-politik', targetId: 'olaf-scholz' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'faces', categoryId: 'promi-politik', targetId: 'niemand' })).toMatchObject({ ok: false, code: 'unknown_category' });
    const summary = toView(h.room, h.host).categories?.find((c) => c.id === 'promi-politik');
    expect(summary).toMatchObject({ count: 3, games: ['faces'] });
    expect(summary?.targets?.map((t) => t.id)).toEqual(['angela-merkel', 'barack-obama', 'olaf-scholz']);
    expect(toView(h.room, null).categories?.find((c) => c.id === 'promi-politik')?.targets).toBeUndefined();
  });
});

describe('Wer ist das?: Tipps und Prüfung', () => {
  test('nur Teilnehmer tippen, nur der Host prüft, Vorschlag bei Alias, Plätze nach Versuchszeit', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startFaces(h, { targetId: 'angela-merkel' });
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'face_guess', text: 'Merkel' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'face_guess', text: '   ' })).toMatchObject({ ok: false, code: 'bad_message' });

    expectOk(h.act(b, { type: 'face_guess', text: 'Obama' }));
    h.scheduler.advance(1000);
    expectOk(h.act(c, { type: 'face_guess', text: 'mutti' }));
    h.scheduler.advance(1000);
    expectOk(h.act(b, { type: 'face_guess', text: 'Angela Merkel' }));

    // Spieler sehen nur eigene Versuche, keinen Namen, noch keine Fehltipps.
    const seenByB = viewRound(h, b);
    expect(seenByB.name).toBeUndefined();
    expect(seenByB.attempts).toBeUndefined();
    expect(seenByB.myAttempts?.map((a) => [a.text, a.status])).toEqual([
      ['Obama', 'judging'],
      ['Angela Merkel', 'judging'],
    ]);
    expect(seenByB.wrongGuesses).toEqual([]);
    expect(viewRound(h, null).myAttempts).toBeUndefined();
    // Host sieht alles mit Vorschlag.
    const seenByHost = viewRound(h, h.host);
    expect(seenByHost.name).toBe('Angela Merkel');
    expect(seenByHost.privileged).toBe(true);
    expect(seenByHost.attempts?.[b]?.map((a) => a.suggested)).toEqual([false, true]);
    expect(seenByHost.attempts?.[c]?.[0]?.suggested).toBe(true);

    expect(h.act(b, { type: 'face_judge', playerId: b, index: 0, correct: false })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'face_judge', playerId: b, index: 5, correct: false })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'face_judge', playerId: b, index: 0, correct: false }));
    expectOk(h.act(h.host, { type: 'face_judge', playerId: b, index: 1, correct: true }));
    expectOk(h.act(h.host, { type: 'face_judge', playerId: c, index: 0, correct: true }));
    expect(h.act(h.host, { type: 'face_judge', playerId: b, index: 0, correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });

    const v = viewRound(h, c);
    expect(v.wrongGuesses).toEqual([{ by: b, text: 'Obama' }]);
    expect(v.solved).toEqual([
      { playerId: c, at: fr(h).attempts[c]![0]!.at, rank: 1 },
      { playerId: b, at: fr(h).attempts[b]![1]!.at, rank: 2 },
    ]);
    expect(h.act(b, { type: 'face_guess', text: 'nochmal' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(viewRound(h, h.host).points).toEqual({ [b]: 2, [c]: 3 });
  });

  test('Versuche sind begrenzt', () => {
    const h = makeHarness(['Host', 'B']);
    startFaces(h, { targetId: 'olaf-scholz' });
    const b = h.ids[1]!;
    for (let i = 0; i < MAX_ATTEMPTS; i++) expectOk(h.act(b, { type: 'face_guess', text: `Tipp ${i}` }));
    expect(h.act(b, { type: 'face_guess', text: 'noch einer' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });
});

describe('Wer ist das?: Effekt', () => {
  test('Stärke setzt nur der Host, Kacheln vereinigen sich und sperren die Spaltenzahl', () => {
    const h = makeHarness(['Host', 'B']);
    startFaces(h, { targetId: 'angela-merkel', effect: 'blur', level: 80 });
    const b = h.ids[1]!;
    expect(h.act(b, { type: 'face_effect', level: 10 })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'face_effect', cols: 5 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'face_effect', level: 35 }));
    expect(viewRound(h, b).effect).toEqual({ effect: 'blur', level: 35, cols: 6, revealed: [] });

    const t = makeHarness(['Host', 'B']);
    startFaces(t, { targetId: 'angela-merkel', effect: 'tiles', cols: 3 });
    expect(t.act(t.host, { type: 'face_effect', level: 10 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(t.act(t.host, { type: 'face_effect', cols: 8 }));
    expectOk(t.act(t.host, { type: 'face_effect', revealed: [3, 1, 3, 9999] }));
    expect(fr(t).effect.revealed).toEqual([1, 3]);
    expectOk(t.act(t.host, { type: 'face_effect', revealed: [2] }));
    expect(fr(t).effect).toEqual({ effect: 'tiles', level: 80, cols: 8, revealed: [1, 2, 3] });
    expect(t.act(t.host, { type: 'face_effect', cols: 4 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(t.act(t.host, { type: 'end_round' }));
    expect(t.act(t.host, { type: 'face_effect', revealed: [5] })).toMatchObject({ ok: false, code: 'invalid_action' });
  });
});

describe('Wer ist das?: Auflösung', () => {
  test('Host löst auf, dann sehen alle Namen, Versuche und Punkte; Timer löst ebenfalls auf', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startFaces(h, { targetId: 'angela-merkel' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'face_guess', text: 'Merkel' }));
    expectOk(h.act(h.host, { type: 'face_judge', playerId: b, index: 0, correct: true }));
    expect(h.act(b, { type: 'end_round' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    const v = viewRound(h, c);
    expect(v.name).toBe('Angela Merkel');
    expect(v.attempts?.[b]?.[0]).toEqual({ text: 'Merkel', at: expect.any(Number), status: 'correct' });
    expect(v.points).toEqual({ [b]: 3, [c]: 0 });
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [b]: 3 } }));
    expect(h.room.scores[b]).toBe(3);

    const timed = makeHarness(['Host', 'B'], { timer: 30 });
    startFaces(timed, { targetId: 'olaf-scholz' });
    expect(fr(timed).turnDeadline).not.toBeNull();
    timed.scheduler.advance(30_000);
    expect(timed.room.phase).toBe('reveal');
  });

  test('Host-Wechsel: der neue Host fliegt aus der Reihenfolge, Verlassen räumt Versuche weg', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startFaces(h, { targetId: 'angela-merkel' });
    const [a, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'face_guess', text: 'Merkel' }));
    expectOk(h.act(c, { type: 'face_guess', text: 'Obama' }));
    expect(h.room.leave(a).ok).toBe(true);
    expect(h.room.hostId).toBe(b);
    expect(fr(h).turnOrder).toEqual([c]);
    expect(fr(h).attempts[b]).toBeUndefined();
    expectOk(h.act(b, { type: 'face_judge', playerId: c, index: 0, correct: false }));
    expect(viewRound(h, c).wrongGuesses).toEqual([{ by: c, text: 'Obama' }]);
    expect(h.room.leave(c).ok).toBe(true);
    expect(h.room.phase).toBe('reveal');
  });
});
