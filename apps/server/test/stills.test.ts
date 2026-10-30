import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { StillsRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startStills, type Harness } from './fixtures.ts';

function sr(h: Harness): StillsRound {
  const round = h.room.round;
  if (round?.game !== 'stills') throw new Error('keine Filmfotos-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'stills') throw new Error('keine Filmfotos-Runde in der Sicht');
  return round;
}

/** Tippen: alle Tipps zum aktuellen Foto schließen und mit den Urteilen prüfen. */
function closeAndJudge(h: Harness, verdicts: Record<string, boolean>): void {
  expectOk(h.act(h.host, { type: 'still_close' }));
  for (const [playerId, correct] of Object.entries(verdicts)) expectOk(h.act(h.host, { type: 'still_judge', playerId, correct }));
}

describe('Filmfotos: Rundenstart', () => {
  test('Host rät nie mit, Modus und Bedenkzeit werden übernommen, Standard ist Tippen mit 10 s', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h, { mode: 'buzz', thinkSeconds: 15 });
    const r = sr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.mode).toBe('buzz');
    expect(r.thinkSeconds).toBe(15);
    expect(r.index).toBe(0);

    const h2 = makeHarness(['Host', 'B']);
    startStills(h2);
    expect(sr(h2)).toMatchObject({ mode: 'type', thinkSeconds: 10, stage: 'guessing' });
  });

  test('ohne Mitspieler außer dem Host geht es nicht los', () => {
    const h = makeHarness(['Allein']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'stills', categoryId: 'film-pate' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('Spieler sehen nur freigegebene Fotos, keine Lösung und keinen Kategorie-Titel; der Host sieht alles', () => {
    const h = makeHarness(['Host', 'B']);
    startStills(h);
    const b = h.ids[1]!;
    const seenByB = viewRound(h, b);
    expect(seenByB.images).toEqual(['/images/s1-hand.jpg']);
    expect(seenByB.answer).toBeUndefined();
    expect(seenByB.category.title).toBe('Filmfotos');
    expect(seenByB.stagePoints).toEqual([5, 4, 3, 2, 10]);
    expect(seenByB.typed).toBeUndefined();

    const seenByHost = viewRound(h, h.host);
    expect(seenByHost.images).toHaveLength(5);
    expect(seenByHost.images[4]).toBe('https://example.org/s5.png');
    expect(seenByHost.answer).toBe('Der Pate');
    expect(seenByHost.category.title).toBe('Film 7');
    expect(seenByHost.privileged).toBe(true);
  });
});

describe('Filmfotos: Tippen', () => {
  test('ein Tipp je Foto, Host sieht Texte erst nach dem Schließen, Weiter erst nach vollständiger Prüfung', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h);
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'still_guess', text: 'Pate' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'still_buzz' })).toMatchObject({ ok: false });
    expectOk(h.act(b, { type: 'still_guess', text: 'Scarface' }));
    expect(h.act(b, { type: 'still_guess', text: 'Goodfellas' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expect(viewRound(h, h.host).typed).toEqual([b]);
    expect(viewRound(h, null).typed).toEqual([b]);
    expect(viewRound(h, h.host).attempts?.[b]).toEqual([]);
    expect(h.act(h.host, { type: 'still_next' })).toMatchObject({ ok: false });
    expect(h.act(b, { type: 'still_close' })).toMatchObject({ ok: false, code: 'not_host' });

    expectOk(h.act(h.host, { type: 'still_close' }));
    expect(h.act(c, { type: 'still_guess', text: 'Der Pate' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(viewRound(h, h.host).attempts?.[b]).toEqual([{ index: 0, text: 'Scarface', status: 'judging', suggested: false }]);
    expect(h.act(h.host, { type: 'still_next' })).toMatchObject({ ok: false });
    expect(h.act(h.host, { type: 'still_judge', playerId: c, correct: true })).toMatchObject({ ok: false });

    expectOk(h.act(h.host, { type: 'still_judge', playerId: b, correct: false }));
    expect(viewRound(h, b).myAttempts).toEqual([{ index: 0, text: 'Scarface', status: 'wrong' }]);
    // Fremde Urteile und Texte bleiben geheim.
    expect(viewRound(h, c).myAttempts).toBeUndefined();
    expect(viewRound(h, c).attempts).toBeUndefined();

    expectOk(h.act(h.host, { type: 'still_next' }));
    expect(sr(h)).toMatchObject({ index: 1, stage: 'guessing' });
    expect(viewRound(h, b).images).toHaveLength(2);
    expectOk(h.act(b, { type: 'still_guess', text: 'Goodfellas' }));
  });

  test('alle Richtigen beim selben Foto gewinnen dessen Punkte, danach ist das Raten vorbei, Fotos gehen weiter', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startStills(h);
    const [, b, c, d] = h.ids as [string, string, string, string];
    closeAndJudge(h, {});
    expectOk(h.act(h.host, { type: 'still_next' }));

    expectOk(h.act(b, { type: 'still_guess', text: 'the godfather' }));
    expectOk(h.act(c, { type: 'still_guess', text: 'Pate 2' }));
    expectOk(h.act(d, { type: 'still_guess', text: 'Casino' }));
    expectOk(h.act(h.host, { type: 'still_close' }));
    const hostView = viewRound(h, h.host);
    expect(hostView.attempts?.[b]?.[0]?.suggested).toBe(true);
    expect(hostView.attempts?.[c]?.[0]?.suggested).toBe(false);

    expectOk(h.act(h.host, { type: 'still_judge', playerId: b, correct: true }));
    expectOk(h.act(h.host, { type: 'still_judge', playerId: c, correct: true }));
    // Noch nicht alles geprüft: noch nicht gelöst, keine Lösung für Spieler.
    expect(viewRound(h, d).solved).toBeNull();
    expect(viewRound(h, d).answer).toBeUndefined();
    expectOk(h.act(h.host, { type: 'still_judge', playerId: d, correct: false }));

    const seenByD = viewRound(h, d);
    expect(seenByD.solved).toEqual({ index: 1, winners: [b, c] });
    expect(seenByD.over).toBe(true);
    expect(seenByD.answer).toBe('Der Pate');
    expect(seenByD.points).toEqual({ [b]: 4, [c]: 4, [d]: 0 });

    // Raten vorbei, der Host darf die übrigen Fotos trotzdem zeigen.
    expect(h.act(h.host, { type: 'still_close' })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'still_next' }));
    expectOk(h.act(h.host, { type: 'still_next' }));
    expectOk(h.act(h.host, { type: 'still_next' }));
    expect(h.act(h.host, { type: 'still_next' })).toMatchObject({ ok: false });
    expect(h.act(d, { type: 'still_guess', text: 'Der Pate' })).toMatchObject({ ok: false });
    expect(viewRound(h, d).images).toHaveLength(5);
    expect(viewRound(h, d).points).toEqual({ [b]: 4, [c]: 4, [d]: 0 });

    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    const revealed = viewRound(h, d);
    expect(revealed.category.title).toBe('Film 7');
    expect(revealed.attempts?.[c]).toEqual([{ index: 1, text: 'Pate 2', status: 'correct' }]);
  });

  test('ein Urteil lässt sich bis zum Weiterschalten ändern', () => {
    const h = makeHarness(['Host', 'B']);
    startStills(h);
    const b = h.ids[1]!;
    expectOk(h.act(b, { type: 'still_guess', text: 'Pate' }));
    closeAndJudge(h, { [b]: true });
    expect(viewRound(h, b).over).toBe(true);
    expectOk(h.act(h.host, { type: 'still_judge', playerId: b, correct: false }));
    expect(viewRound(h, b).over).toBe(false);
    expectOk(h.act(h.host, { type: 'still_next' }));
    expect(h.act(h.host, { type: 'still_judge', playerId: b, correct: true })).toMatchObject({ ok: false });
  });

  test('ohne Treffer nach dem letzten Foto ist der Film ungelöst', () => {
    const h = makeHarness(['Host', 'B']);
    startStills(h);
    const b = h.ids[1]!;
    for (let stage = 0; stage < 4; stage++) {
      expectOk(h.act(b, { type: 'still_guess', text: `Falsch ${stage}` }));
      closeAndJudge(h, { [b]: false });
      expectOk(h.act(h.host, { type: 'still_next' }));
    }
    expect(viewRound(h, b).over).toBe(false);
    closeAndJudge(h, {});
    const seen = viewRound(h, b);
    expect(seen.over).toBe(true);
    expect(seen.solved).toBeNull();
    expect(seen.answer).toBe('Der Pate');
    expect(seen.points).toEqual({ [b]: 0 });
    expect(seen.myAttempts).toHaveLength(4);
  });

  test('beim letzten Foto zählen die Punkte aus den Daten', () => {
    const h = makeHarness(['Host', 'B']);
    startStills(h);
    const b = h.ids[1]!;
    for (let stage = 0; stage < 4; stage++) {
      closeAndJudge(h, {});
      expectOk(h.act(h.host, { type: 'still_next' }));
    }
    expectOk(h.act(b, { type: 'still_guess', text: 'Der Pate' }));
    closeAndJudge(h, { [b]: true });
    expect(viewRound(h, h.host).points).toEqual({ [b]: 10 });
  });
});

describe('Filmfotos: Buzzern', () => {
  test('nur einer ist dran, falsch sperrt fürs Foto, die Sperre fällt beim nächsten Foto weg, richtig beendet das Raten', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h, { mode: 'buzz', thinkSeconds: 5 });
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(b, { type: 'still_guess', text: 'Pate' })).toMatchObject({ ok: false });
    expect(h.act(h.host, { type: 'still_buzz' })).toMatchObject({ ok: false, code: 'not_allowed' });

    expectOk(h.act(b, { type: 'still_buzz' }));
    const start = h.room.now;
    expect(viewRound(h, c).buzzer).toEqual({ holder: b, deadline: start + 5000, used: [] });
    expect(h.act(c, { type: 'still_buzz' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'still_next' })).toMatchObject({ ok: false });
    expect(h.act(b, { type: 'still_verdict', correct: true })).toMatchObject({ ok: false, code: 'not_host' });

    // Die Bedenkzeit ist nur Anzeige: Der Host urteilt auch danach noch.
    h.scheduler.advance(8000);
    expect(sr(h).holder).toBe(b);
    expectOk(h.act(h.host, { type: 'still_verdict', correct: false }));
    expect(viewRound(h, b).buzzer?.used).toEqual([b]);
    expect(h.act(b, { type: 'still_buzz' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'still_next' }));
    expect(sr(h).used).toEqual([]);
    expectOk(h.act(c, { type: 'still_buzz' }));
    expectOk(h.act(h.host, { type: 'still_verdict', correct: true }));

    const seen = viewRound(h, b);
    expect(seen.solved).toEqual({ index: 1, winners: [c] });
    expect(seen.over).toBe(true);
    expect(seen.answer).toBe('Der Pate');
    expect(seen.points).toEqual({ [b]: 0, [c]: 4 });
    expect(h.act(b, { type: 'still_buzz' })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'still_next' }));
    expect(viewRound(h, b).points).toEqual({ [b]: 0, [c]: 4 });
  });

  test('sind beim letzten Foto alle gesperrt, ist der Film ungelöst', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h, { mode: 'buzz' });
    const [, b, c] = h.ids as [string, string, string];
    for (let stage = 0; stage < 4; stage++) expectOk(h.act(h.host, { type: 'still_next' }));
    expectOk(h.act(b, { type: 'still_buzz' }));
    expectOk(h.act(h.host, { type: 'still_verdict', correct: false }));
    expect(viewRound(h, b).over).toBe(false);
    expectOk(h.act(c, { type: 'still_buzz' }));
    expectOk(h.act(h.host, { type: 'still_verdict', correct: false }));
    expect(viewRound(h, b)).toMatchObject({ over: true, solved: null, answer: 'Der Pate' });
  });

  test('wer während seiner Antwort den Raum verlässt, gibt den Buzzer frei', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h, { mode: 'buzz' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'still_buzz' }));
    h.room.leave(b);
    expect(sr(h).holder).toBeNull();
    expect(sr(h).turnOrder).toEqual([c]);
    expectOk(h.act(c, { type: 'still_buzz' }));
  });
});

describe('Filmfotos: Auflösung und Wertung', () => {
  test('Auflösen geht jederzeit, die Etappenpunkte stehen in der Sicht für die Wertung', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h, { mode: 'buzz' });
    const [, b] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'still_buzz' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    expect(sr(h).holder).toBeNull();
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(viewRound(h, h.host).points).toEqual({ [b]: 0, [h.ids[2]!]: 0 });
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [b]: 3 } }));
    expect(h.room.scores[b]).toBe(3);
  });
});
