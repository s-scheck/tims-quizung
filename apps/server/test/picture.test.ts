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

describe('Bilderrätsel: Alle gleichzeitig', () => {
  test('Start: niemand ist dran, keine Leben, Rundentimer läuft, Host nie dabei, Reihum-Aktionen gehen nicht', () => {
    const h = makeHarness(['Host', 'B', 'C'], { timer: 30 });
    const livesBefore = h.room.defaultLives;
    startPicture(h, { mode: 'all', lives: 2 });
    const [, b, c] = h.ids as [string, string, string];
    const r = pr(h);
    expect(r.mode).toBe('all');
    expect(r.activePlayerId).toBeNull();
    expect(r.turnOrder).toEqual([b, c]);
    expect(r.lives).toEqual({});
    expect(r.turnDeadline).not.toBeNull();
    expect(h.room.defaultLives).toBe(livesBefore);

    const v = viewRound(h, b);
    expect(v.mode).toBe('all');
    expect(v.startedAt).toBe(r.startedAt);
    expect(v.progress).toEqual({ [b]: { filled: 0, doneAt: null }, [c]: { filled: 0, doneAt: null } });
    expect(v.myAnswers).toEqual({});
    expect(v.answers).toBeUndefined();
    expect(v.fields.every((f) => f.answer === undefined)).toBe(true);
    expect(viewRound(h, h.host).fields.map((f) => f.answer)).toEqual(['Lampe', 'Katze', 'Uhr']);

    expect(h.act(b, { type: 'picture_guess', turnNo: 1, fieldId: 'f1', text: 'Lampe' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'picture_judge', turnNo: 1, correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'skip_turn', turnNo: 1 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'picture_step', index: 0 })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('Ausfüllen: nur Teilnehmer, leer löscht, Texte bleiben privat, auch vor dem Host', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { mode: 'all' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f1', text: '  lampe ' }));
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f2', text: 'Hund' }));
    expect(h.act(b, { type: 'picture_fill', fieldId: 'f9', text: 'x' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(pr(h).answers[b]).toEqual({ f1: 'lampe', f2: 'Hund' });
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f2', text: '   ' }));
    expect(pr(h).answers[b]).toEqual({ f1: 'lampe' });

    expect(viewRound(h, b).myAnswers).toEqual({ f1: 'lampe' });
    expect(viewRound(h, b).progress?.[b]).toEqual({ filled: 1, doneAt: null });
    for (const viewer of [c, h.host, null]) {
      const v = viewRound(h, viewer);
      expect(v.answers).toBeUndefined();
      expect(JSON.stringify(v)).not.toContain('lampe');
    }
    expect(viewRound(h, c).myAnswers).toEqual({});
  });

  test('Fertig: endgültig, danach kein Ausfüllen; sind alle fertig, beginnt die Auflösung mit vorbelegten Urteilen', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { mode: 'all' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f1', text: 'LAMPE' }));
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f2', text: 'Hund' }));
    h.scheduler.advance(5000);
    expectOk(h.act(b, { type: 'picture_done' }));
    expect(h.act(b, { type: 'picture_done' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'picture_fill', fieldId: 'f3', text: 'Uhr' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.room.phase).toBe('playing');
    expect(viewRound(h, c).progress?.[b]).toEqual({ filled: 2, doneAt: pr(h).startedAt + 5000 });

    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f1', text: 'Leuchte' }));
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f3', text: 'uhr.' }));
    h.scheduler.advance(1000);
    expectOk(h.act(c, { type: 'picture_done' }));
    expect(h.room.phase).toBe('reveal');
    const r = pr(h);
    expect(r.verdicts).toEqual({ [b]: { f1: true, f2: false, f3: false }, [c]: { f1: false, f2: false, f3: true } });
    expect(r.judgeIndex).toBe(0);
    expect(r.judgeShown).toBe(1);
  });

  test('Auflösung: nur aufgerufene Felder sichtbar, Host schaltet vor und zurück, Urteile live, Punkte erst nach dem letzten Feld', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { mode: 'all' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f2', text: 'Kater' }));
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f2', text: 'Katze' }));
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f3', text: 'Wecker' }));
    h.scheduler.advance(2000);
    expectOk(h.act(c, { type: 'picture_done' }));
    h.scheduler.advance(2000);
    expectOk(h.act(b, { type: 'picture_done' }));
    expect(h.room.phase).toBe('reveal');
    const start = pr(h).startedAt;

    let v = viewRound(h, null);
    expect(v.judge).toEqual({ index: 0, shown: 1, complete: false });
    expect(v.fields.map((f) => f.answer)).toEqual(['Lampe', undefined, undefined]);
    expect(v.answers).toEqual({ [b]: { f1: 'Lampe' }, [c]: {} });
    expect(v.verdicts).toEqual({ [b]: { f1: true }, [c]: { f1: false } });
    expect(v.results).toEqual([
      { playerId: b, hits: 1, doneAt: start + 4000 },
      { playerId: c, hits: 0, doneAt: start + 2000 },
    ]);
    expect(JSON.stringify(v)).not.toContain('Kater');
    expect(viewRound(h, h.host).fields.map((f) => f.answer)).toEqual(['Lampe', 'Katze', 'Uhr']);
    expect(viewRound(h, h.host).answers?.[b]).toEqual({ f1: 'Lampe' });

    expect(h.act(h.host, { type: 'to_scoring' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'picture_step', index: 1 })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'picture_step', index: 2 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'picture_verdict', playerId: b, fieldId: 'f2', correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'picture_step', index: 1 }));
    expectOk(h.act(h.host, { type: 'picture_verdict', playerId: b, fieldId: 'f2', correct: true }));
    expect(h.act(h.host, { type: 'picture_verdict', playerId: h.host, fieldId: 'f2', correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(c, { type: 'picture_verdict', playerId: b, fieldId: 'f2', correct: false })).toMatchObject({ ok: false, code: 'not_host' });
    v = viewRound(h, c);
    expect(v.verdicts?.[b]).toEqual({ f1: true, f2: true });
    expect(v.answers?.[b]).toEqual({ f1: 'Lampe', f2: 'Kater' });
    expect(v.results?.map((x) => [x.playerId, x.hits])).toEqual([
      [b, 2],
      [c, 1],
    ]);

    expectOk(h.act(h.host, { type: 'picture_step', index: 0 }));
    expect(viewRound(h, null).judge).toEqual({ index: 0, shown: 2, complete: false });
    expect(viewRound(h, null).answers?.[c]).toEqual({ f2: 'Katze' });
    expectOk(h.act(h.host, { type: 'picture_step', index: 2 }));
    expect(viewRound(h, null).judge).toEqual({ index: 2, shown: 3, complete: true });
    // Gleichstand bei den Treffern: die frühere Fertig-Zeit steht vorn.
    expectOk(h.act(h.host, { type: 'picture_verdict', playerId: b, fieldId: 'f2', correct: false }));
    expect(viewRound(h, null).results?.map((x) => [x.playerId, x.hits])).toEqual([
      [c, 1],
      [b, 1],
    ]);
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(h.room.phase).toBe('scoring');
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [b]: 1, [c]: 2 } }));
    expect(h.room.scores).toMatchObject({ [b]: 1, [c]: 2 });
  });

  test('Rundenende: Host löst auf oder der Timer läuft ab; wer nicht fertig ist, zählt ohne Zeit und steht hinten', () => {
    const h = makeHarness(['Host', 'B', 'C'], { timer: 30 });
    startPicture(h, { mode: 'all' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(c, { type: 'picture_done' }));
    expect(h.act(b, { type: 'end_round' })).toMatchObject({ ok: false, code: 'not_host' });
    h.scheduler.advance(30_000);
    expect(h.room.phase).toBe('reveal');
    expect(pr(h).doneAt[b]).toBeUndefined();
    expect(viewRound(h, null).results).toEqual([
      { playerId: c, hits: 1, doneAt: expect.any(Number) },
      { playerId: b, hits: 1, doneAt: null },
    ]);

    const early = makeHarness(['Host', 'B']);
    startPicture(early, { mode: 'all' });
    expectOk(early.act(early.host, { type: 'end_round' }));
    expect(early.room.phase).toBe('reveal');
    expect(early.act(early.host, { type: 'end_round' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('Spieler geht oder Host wechselt: Antworten verfallen; sind die übrigen fertig, beginnt die Auflösung', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { mode: 'all' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(b, { type: 'picture_done' }));
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f1', text: 'Vase' }));
    expect(h.room.leave(c).ok).toBe(true);
    expect(pr(h).turnOrder).toEqual([b]);
    expect(pr(h).answers[c]).toBeUndefined();
    expect(h.room.phase).toBe('reveal');

    const g = makeHarness(['Host', 'B', 'C']);
    startPicture(g, { mode: 'all' });
    const [ga, gb, gc] = g.ids as [string, string, string];
    expectOk(g.act(gb, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expect(g.room.leave(ga).ok).toBe(true);
    expect(g.room.hostId).toBe(gb);
    expect(pr(g).turnOrder).toEqual([gc]);
    expect(pr(g).answers[gb]).toBeUndefined();
    expect(g.room.phase).toBe('playing');
    expect(pr(g).activePlayerId).toBeNull();
    expect(g.act(gb, { type: 'picture_fill', fieldId: 'f1', text: 'x' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(g.act(gc, { type: 'picture_done' }));
    expect(g.room.phase).toBe('reveal');
    expectOk(g.act(gb, { type: 'picture_step', index: 1 }));
  });
});
