import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { PictureRound } from '../src/rooms/state.ts';
import { RESULT_MS } from '../src/games/picture/reducer.ts';
import { expectOk, makeHarness, startPicture, type Harness } from './fixtures.ts';

function pr(h: Harness): PictureRound {
  const round = h.room.round;
  if (round?.game !== 'picture') throw new Error('keine Bilderrätsel-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'picture') throw new Error('keine Bilderrätsel-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

describe('Bilderrätsel: Rundenstart', () => {
  test('Host prüft immer und rät nie mit, Leben werden gemerkt', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { lives: 2 });
    const r = pr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(r.maxLives).toBe(2);
    expect(r.lives).toEqual({ [h.ids[1]!]: 2, [h.ids[2]!]: 2 });
    expect(h.room.defaultLives).toBe(2);
    expect(h.room.playedCategoryIds).toEqual(['bild-zimmer']);

    const m = moderated(['Host', 'B']);
    startPicture(m);
    expect(pr(m).turnOrder).toEqual([m.ids[1]!]);
  });

  test('ohne Mitspieler außer dem Host startet nichts, Rangliste passt nicht', () => {
    const h = makeHarness(['Allein']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'picture', categoryId: 'bild-zimmer' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'picture', categoryId: 'cities' })).toMatchObject({ ok: false, code: 'unknown_category' });
    expect(h.room.phase).toBe('choosing_category');
  });

  test('Kategorieauswahl zählt Felder', () => {
    const h = makeHarness(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    const summary = toView(h.room, h.host).categories?.find((c) => c.id === 'bild-zimmer');
    expect(summary).toMatchObject({ count: 3, games: ['picture'] });
  });
});

describe('Bilderrätsel: Tipp und Prüfung', () => {
  test('nur der aktive Spieler tippt, nur auf offene Felder, dann prüft nur der Host', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h);
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(c, { type: 'picture_guess', turnNo: 1, fieldId: 'f1', text: 'Lampe' })).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f9', text: 'Lampe' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'picture_guess', turnNo: 2, fieldId: 'f1', text: 'Lampe' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f1', text: '   ' })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(h.host, { type: 'picture_judge', turnNo: 1, correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f1', text: ' Lampe ' }));
    expect(pr(h).guess).toMatchObject({ by: b, fieldId: 'f1', text: 'Lampe', status: 'judging' });
    expect(h.room.timers.turn).toBeNull();
    expect(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f2', text: 'Katze' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'picture_judge', turnNo: 1, correct: true })).toMatchObject({ ok: false, code: 'not_host' });

    // Alle sehen Nummer und Text sofort, die Antwort offener Felder nur der Host.
    const seenByC = viewRound(h, c);
    expect(seenByC.guess).toMatchObject({ by: b, fieldId: 'f1', text: 'Lampe', status: 'judging' });
    expect(seenByC.fields.map((f) => f.answer)).toEqual([undefined, undefined, undefined]);
    expect(seenByC.fields[0]).toMatchObject({ id: 'f1', number: 1, x: 10, y: 10, w: 20, h: 15, solved: false });
    expect(seenByC.image).toBe('/images/k1-zimmer.jpg');
    expect(seenByC.original).toBeUndefined();
    expect(seenByC.privileged).toBeUndefined();
    const seenByHost = viewRound(h, h.host);
    expect(seenByHost.fields.map((f) => f.answer)).toEqual(['Lampe', 'Katze', 'Uhr']);
    expect(seenByHost.privileged).toBe(true);
    expect(viewRound(h, null).fields[1]!.answer).toBeUndefined();

    expectOk(h.act(h.host, { type: 'picture_judge', turnNo: 1, correct: true }));
    const r = pr(h);
    expect(r.solved).toEqual({ f1: b });
    expect(r.hits[b]).toBe(1);
    expect(r.guess?.status).toBe('correct');
    expect(viewRound(h, c).fields[0]).toMatchObject({ solved: true, solvedBy: b, answer: 'Lampe' });
    expect(h.act(h.host, { type: 'picture_judge', turnNo: 1, correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });

    h.scheduler.advance(RESULT_MS);
    expect(pr(h).guess).toBeNull();
    expect(pr(h).activePlayerId).toBe(c);
    expect(pr(h).turnNo).toBe(2);
    expect(h.act(c, { type: 'picture_guess', turnNo: 2, fieldId: 'f1', text: 'Lampe' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('falscher Tipp kostet ein Leben, Feld bleibt offen, ohne Leben fragt der Host', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { lives: 1 });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f2', text: 'Hund' }));
    expectOk(h.act(h.host, { type: 'picture_judge', turnNo: 1, correct: false }));
    const r = pr(h);
    expect(r.lives[b]).toBe(0);
    expect(r.eliminated).toEqual([b]);
    expect(r.solved).toEqual({});
    expect(r.wrongGuesses).toEqual([{ by: b, fieldId: 'f2', text: 'Hund' }]);
    expect(r.guess?.status).toBe('wrong');
    h.scheduler.advance(RESULT_MS);
    expect(h.room.phase).toBe('host_decision');
    expectOk(h.act(h.host, { type: 'host_decision', continue: true }));
    expect(pr(h).activePlayerId).toBe(c);
    expectOk(h.act(c, { type: 'picture_guess', turnNo: pr(h).turnNo, fieldId: 'f2', text: 'Katze' }));
    expectOk(h.act(h.host, { type: 'picture_judge', turnNo: pr(h).turnNo, correct: true }));
    expect(pr(h).solved).toEqual({ f2: c });
  });

  test('alle Felder gelöst beendet die Runde, Zeitablauf kostet ein Leben, Kategorie lässt sich vorzeitig beenden', () => {
    const h = makeHarness(['Host', 'B'], { timer: 30 });
    startPicture(h, { lives: 3 });
    const b = h.ids[1]!;
    for (const [field, answer] of [
      ['f1', 'Lampe'],
      ['f2', 'Katze'],
    ] as const) {
      expectOk(h.act(b, { type: 'picture_guess', turnNo: pr(h).turnNo, fieldId: field, text: answer }));
      expectOk(h.act(h.host, { type: 'picture_judge', turnNo: pr(h).turnNo, correct: true }));
      h.scheduler.advance(RESULT_MS);
    }
    expect(h.room.phase).toBe('playing');
    h.scheduler.advance(30_000);
    expect(pr(h).lives[b]).toBe(2);
    expectOk(h.act(b, { type: 'picture_guess', turnNo: pr(h).turnNo, fieldId: 'f3', text: 'Uhr' }));
    expectOk(h.act(h.host, { type: 'picture_judge', turnNo: pr(h).turnNo, correct: true }));
    h.scheduler.advance(RESULT_MS);
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, b).fields.every((f) => f.solved && f.answer !== undefined)).toBe(true);
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [b]: 3 } }));
    expect(h.room.scores[b]).toBe(3);

    const early = makeHarness(['Host', 'B']);
    startPicture(early);
    expectOk(early.act(early.ids[1]!, { type: 'picture_guess', turnNo: 1, fieldId: 'f1', text: 'Vase' }));
    expectOk(early.act(early.host, { type: 'end_round' }));
    expect(early.room.phase).toBe('reveal');
    expect(pr(early).guess).toBeNull();
    expect(viewRound(early, null).fields.map((f) => f.answer)).toEqual(['Lampe', 'Katze', 'Uhr']);
  });

  test('Host-Wechsel: der neue Host fliegt aus der Reihenfolge und prüft', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h);
    const [a, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f1', text: 'Lampe' }));
    expect(h.room.leave(a).ok).toBe(true);
    expect(h.room.hostId).toBe(b);
    expect(pr(h).turnOrder).toEqual([c]);
    expect(pr(h).guess).toBeNull();
    expect(h.room.phase).toBe('host_decision');
    expectOk(h.act(b, { type: 'host_decision', continue: true }));
    expect(pr(h).activePlayerId).toBe(c);
    expectOk(h.act(c, { type: 'picture_guess', turnNo: pr(h).turnNo, fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(b, { type: 'picture_judge', turnNo: pr(h).turnNo, correct: true }));
    expect(pr(h).solved).toEqual({ f1: c });
  });
});
