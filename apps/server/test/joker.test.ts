import { describe, expect, test } from 'bun:test';
import type { RoundView } from '@quiz/shared';
import { toView } from '../src/rooms/view.ts';
import {
  expectOk,
  makeHarness,
  startFaces,
  startKids,
  startMap,
  startPicture,
  startRisk,
  startStills,
  startTimeline,
  type Harness,
} from './fixtures.ts';

/** Host moderiert, spielt also nicht mit und kann keinen Joker setzen. */
function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

function view(h: Harness, viewerId: string | null): RoundView {
  const round = toView(h.room, viewerId).round;
  if (!round) throw new Error('keine Runde');
  return round;
}

function joker(h: Harness, by: string, target: string) {
  return h.act(by, { type: 'joker', playerId: target });
}

function round<G extends NonNullable<Harness['room']['round']>['game']>(h: Harness, game: G) {
  const r = h.room.round;
  if (r?.game !== game) throw new Error(`keine ${game}-Runde`);
  return r as Extract<NonNullable<Harness['room']['round']>, { game: G }>;
}

describe('Joker: Grundregeln', () => {
  test('einer pro Runde, der Erste gewinnt, Ziel sehen nur Host, Joker-Spieler und alle ab der Auflösung', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startMap(h, { targetId: 'rom' });
    const [, b, c, d] = h.ids as [string, string, string, string];

    expect(view(h, b).jokerAvailable).toBe(true);
    expect(view(h, h.host).jokerAvailable).toBeUndefined();
    expect(view(h, null).jokerAvailable).toBeUndefined();
    expect(joker(h, h.host, b)).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(joker(h, b, b)).toMatchObject({ ok: false, message: 'Du kannst dich nicht selbst kopieren' });
    expect(joker(h, b, h.host)).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(joker(h, b, c));
    expect(h.room.jokersUsed).toEqual([b]);
    expect(joker(h, c, d)).toMatchObject({ ok: false, message: 'Der Joker ist in dieser Runde schon vergeben' });
    expect(h.room.jokersUsed).toEqual([b]);
    expect(view(h, d).jokerAvailable).toBeUndefined();

    expect(view(h, d).joker).toEqual({ by: b, from: 0, at: expect.any(Number) });
    expect(view(h, null).joker?.target).toBeUndefined();
    expect(view(h, h.host).joker?.target).toBe(c);
    expect(view(h, b).joker?.target).toBe(c);
    expect(toView(h.room, d).jokersUsed).toEqual([b]);

    // Der Joker-Spieler gilt als fertig und kann nichts mehr setzen.
    const mapView = view(h, d);
    if (mapView.game !== 'map') throw new Error('keine Karte');
    expect(mapView.confirmed).toEqual([b]);
    expect(h.act(b, { type: 'place_pin', lat: 1, lng: 1 })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });

    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(view(h, d).joker?.target).toBe(c);
    expect(view(h, null).joker?.target).toBe(c);
  });

  test('ein Joker pro Spiel über alle Kategorien, ein neues Spiel gibt ihn zurück', () => {
    const h = moderated(['Host', 'B', 'C']);
    const [, b, c] = h.ids as [string, string, string];
    startMap(h, { targetId: 'rom' });
    expectOk(joker(h, b, c));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
    expectOk(h.act(h.host, { type: 'next_round' }));
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'timeline', categoryId: 'history', targetId: 'mond' }));
    expect(view(h, b).jokerAvailable).toBeUndefined();
    expect(joker(h, b, c)).toMatchObject({ ok: false, message: 'Du hast deinen Joker schon gesetzt' });
    expectOk(joker(h, c, b));

    expectOk(h.act(h.host, { type: 'end_round' }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
    expectOk(h.act(h.host, { type: 'end_game' }));
    expectOk(h.act(h.host, { type: 'back_to_lobby' }));
    startMap(h, { targetId: 'paris' });
    expect(h.room.jokersUsed).toEqual([]);
    expectOk(joker(h, b, c));
  });

  test('Spiele ohne Joker lehnen ab', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' }));
    expect(view(h, h.ids[1]!).jokerAvailable).toBeUndefined();
    expect(joker(h, h.ids[1]!, h.ids[2]!)).toMatchObject({ ok: false, code: 'invalid_action' });
  });
});

describe('Joker: Karte und Zeitstrahl', () => {
  test('Karte: kopierter Pin ab der Auflösung, gleicher Platz, andere rutschen nicht nach hinten', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startMap(h, { targetId: 'rom' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    // Unbestätigter Pin verfällt mit dem Joker.
    expectOk(h.act(b, { type: 'place_pin', lat: 0, lng: 0 }));
    expectOk(joker(h, b, c));
    expect(round(h, 'map').pins[b]).toBeUndefined();
    expectOk(h.act(c, { type: 'place_pin', lat: 41.9, lng: 12.5 }));
    expectOk(h.act(c, { type: 'confirm_pin' }));
    // Während des Ratens hat der Joker-Spieler keinen Pin, auch nicht in seiner eigenen Sicht.
    expect(round(h, 'map').pins[b]).toBeUndefined();
    expectOk(h.act(d, { type: 'place_pin', lat: 48.8, lng: 2.3 }));
    expectOk(h.act(d, { type: 'confirm_pin' }));
    expectOk(h.act(h.host, { type: 'end_round' }));

    expect(round(h, 'map').pins[b]).toEqual(round(h, 'map').pins[c]!);
    const v = view(h, null);
    if (v.game !== 'map') throw new Error('keine Karte');
    expect(v.ranking?.map((r) => [r.playerId, r.rank])).toEqual([
      [c, 1],
      [b, 1],
      [d, 2],
    ]);
  });

  test('Karte: nach dem Bestätigen kein Joker mehr', () => {
    const h = moderated(['Host', 'B', 'C']);
    startMap(h, { targetId: 'rom' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'place_pin', lat: 0, lng: 0 }));
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expect(view(h, b).jokerAvailable).toBeUndefined();
    expect(joker(h, b, c)).toMatchObject({ ok: false, message: 'Dein Pin ist schon bestätigt' });
  });

  test('Karte: gibt die kopierte Person nichts ab oder geht sie, bekommt der Joker-Spieler nichts', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startMap(h, { targetId: 'rom' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(joker(h, b, c));
    expectOk(h.act(c, { type: 'place_pin', lat: 41.9, lng: 12.5 }));
    expectOk(h.act(c, { type: 'confirm_pin' }));
    expect(h.room.leave(c).ok).toBe(true);
    expectOk(h.act(d, { type: 'place_pin', lat: 48.8, lng: 2.3 }));
    expectOk(h.act(d, { type: 'confirm_pin' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(round(h, 'map').pins[b]).toBeUndefined();
    const v = view(h, null);
    if (v.game !== 'map') throw new Error('keine Karte');
    expect(v.ranking?.find((r) => r.playerId === b)?.distanceKm).toBeNull();
  });

  test('Zeitstrahl: der Zeitablauf bestätigt den Tipp der kopierten Person, der Joker-Spieler bekommt ihn', () => {
    const h = makeHarness(['Host', 'B', 'C'], { timer: 30 });
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
    startTimeline(h, { targetId: 'mond' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(joker(h, b, c));
    expect(h.act(b, { type: 'place_year', year: 1970 })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });
    expectOk(h.act(c, { type: 'place_year', year: 1968 }));
    h.scheduler.advance(30_000);
    expect(h.room.phase).toBe('reveal');
    expect(round(h, 'timeline').guesses[b]).toEqual({ year: 1968, confirmed: true });
    const v = view(h, null);
    if (v.game !== 'timeline') throw new Error('kein Zeitstrahl');
    expect(v.ranking).toEqual([
      { playerId: c, distanceYears: 1, rank: 1 },
      { playerId: b, distanceYears: 1, rank: 1 },
    ]);
  });
});

describe('Joker: No Risk No Fun', () => {
  test('nicht bei „gleiche Treffer gehen leer aus“', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h, { duplicates: 'none' });
    expect(view(h, h.ids[1]!).jokerAvailable).toBeUndefined();
    expect(joker(h, h.ids[1]!, h.ids[2]!)).toMatchObject({ ok: false, message: 'Wenn gleiche Treffer leer ausgehen, gibt es keinen Joker' });
  });

  test('gilt ab dem laufenden Durchgang bis zum Ende, Korrekturen an der Person wandern mit', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startRisk(h, { duplicates: 'both' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'Russland' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Kanada' }));
    expectOk(h.act(d, { type: 'risk_guess', text: 'USA' }));
    expect(h.room.phase).toBe('reveal');
    expectOk(h.act(h.host, { type: 'next_pass' }));

    // Durchgang 2: Wer schon eingeloggt hat, darf nicht mehr.
    expectOk(h.act(d, { type: 'risk_guess', text: 'Tschad' }));
    expect(joker(h, d, b)).toMatchObject({ ok: false, message: 'Du hast schon eingeloggt' });
    expectOk(joker(h, c, b));
    expect(round(h, 'risk').joker?.from).toBe(1);
    expect(h.act(c, { type: 'risk_guess', text: 'China' })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });
    const playing = view(h, d);
    if (playing.game !== 'risk') throw new Error('kein Risk');
    expect(playing.loggedIn.sort()).toEqual([c, d].sort());
    // Der Joker-Spieler zählt als fertig: B loggt ein, der Durchgang löst auf.
    expectOk(h.act(b, { type: 'risk_guess', text: 'Peru' }));
    expect(h.room.phase).toBe('reveal');

    const r = round(h, 'risk');
    expect(r.passes[0]!.guesses[c]).toEqual({ text: 'Kanada', rank: 2 });
    expect(r.passes[1]!.guesses[c]).toEqual({ text: 'Peru', rank: 19 });
    expect(h.act(h.host, { type: 'risk_correct', playerId: c, rank: null })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'risk_correct', playerId: b, rank: null }));
    expect(r.passes[1]!.guesses[c]).toEqual({ text: 'Peru', rank: null });

    // Durchgang 3: weiter gesperrt, die Kopie kommt mit der Auflösung.
    expectOk(h.act(h.host, { type: 'next_pass' }));
    expect(h.act(c, { type: 'risk_guess', text: 'Iran' })).toMatchObject({ ok: false });
    expectOk(h.act(b, { type: 'risk_guess', text: 'Iran' }));
    expect(r.passes[2]!.guesses[c]).toBeUndefined();
    expectOk(h.act(d, { type: 'risk_guess', text: 'Mongolei' }));
    expect(r.passes[2]!.guesses[c]).toEqual({ text: 'Iran', rank: 17 });
    const v = view(h, null);
    if (v.game !== 'risk') throw new Error('kein Risk');
    expect(v.totals[c]).toBe(2 + 0 + 17);
    expect(v.totals[b]).toBe(1 + 0 + 17);
  });
});

describe('Joker: Bilderrätsel', () => {
  test('nur „Alle gleichzeitig“', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startPicture(h, { mode: 'turns' });
    expect(joker(h, h.ids[1]!, h.ids[2]!)).toMatchObject({ ok: false, message: 'Den Joker gibt es nur, wenn alle gleichzeitig raten' });
  });

  test('bis „Fertig“, eigene Einträge verfallen, Antworten und Urteile kommen von der Person, Platz geteilt', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startPicture(h, { mode: 'all' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(d, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(d, { type: 'picture_done' }));
    expect(joker(h, d, c)).toMatchObject({ ok: false, message: 'Du bist schon fertig' });

    expectOk(h.act(b, { type: 'picture_fill', fieldId: 'f1', text: 'Tisch' }));
    expectOk(joker(h, b, c));
    expect(round(h, 'picture').answers[b]).toBeUndefined();
    expect(h.act(b, { type: 'picture_fill', fieldId: 'f2', text: 'Katze' })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f1', text: 'Lampe' }));
    expectOk(h.act(c, { type: 'picture_fill', fieldId: 'f2', text: 'Hund' }));
    expectOk(h.act(c, { type: 'picture_done' }));
    // B gilt als fertig, also ist die Runde durch.
    expect(h.room.phase).toBe('reveal');

    const r = round(h, 'picture');
    expect(r.answers[b]).toEqual({ f1: 'Lampe', f2: 'Hund' });
    expect(r.doneAt[b]).toBe(r.doneAt[c]!);
    expect(r.verdicts[b]).toEqual(r.verdicts[c]!);
    expect(h.act(h.host, { type: 'picture_verdict', playerId: b, fieldId: 'f1', correct: false })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'picture_open' }));
    expectOk(h.act(h.host, { type: 'picture_step', index: 1 }));
    expectOk(h.act(h.host, { type: 'picture_verdict', playerId: c, fieldId: 'f2', correct: true }));
    expect(r.verdicts[b]?.f2).toBe(true);
    expectOk(h.act(h.host, { type: 'picture_open' }));
    const v = view(h, null);
    if (v.game !== 'picture') throw new Error('kein Bilderrätsel');
    expect(v.results?.map((x) => [x.playerId, x.hits, x.rank])).toEqual([
      [c, 2, 1],
      [b, 2, 1],
      [d, 1, 2],
    ]);
  });
});

describe('Joker: Wer ist das?', () => {
  test('nach Fehltipp erlaubt, nach Treffer nicht; Platz und Punkte der Person', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startFaces(h, { targetId: 'angela-merkel' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(b, { type: 'face_guess', text: 'Obama' }));
    expectOk(h.act(h.host, { type: 'face_judge', playerId: b, index: 0, correct: false }));
    expectOk(h.act(d, { type: 'face_guess', text: 'Merkel' }));
    expectOk(h.act(h.host, { type: 'face_judge', playerId: d, index: 0, correct: true }));
    expect(joker(h, d, c)).toMatchObject({ ok: false, message: 'Du hast es schon' });

    h.scheduler.advance(1000);
    expectOk(joker(h, b, c));
    expect(round(h, 'faces').attempts[b]).toBeUndefined();
    expect(h.act(b, { type: 'face_guess', text: 'Merkel' })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });
    // Spieler sehen beim Raten nicht, wer richtig liegt.
    const seen = view(h, b);
    if (seen.game !== 'faces') throw new Error('kein Wer ist das');
    expect(seen.solved).toEqual([]);

    expectOk(h.act(c, { type: 'face_guess', text: 'Angela Merkel' }));
    expectOk(h.act(h.host, { type: 'face_judge', playerId: c, index: 0, correct: true }));
    expect(round(h, 'faces').solved[b]).toBeUndefined();
    expectOk(h.act(h.host, { type: 'end_round' }));

    const v = view(h, null);
    if (v.game !== 'faces') throw new Error('kein Wer ist das');
    expect(v.solved.map((s) => [s.playerId, s.rank])).toEqual([
      [d, 1],
      [c, 2],
      [b, 2],
    ]);
    expect(v.points).toEqual({ [b]: 2, [c]: 2, [d]: 3 });
    // Kopierte Fehltipps tauchen nicht doppelt auf.
    expect(v.wrongGuesses).toEqual([]);
  });
});

describe('Joker: Kinderpromis', () => {
  test('nicht beim Buzzern', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startKids(h, { mode: 'buzz' });
    expect(joker(h, h.ids[1]!, h.ids[2]!)).toMatchObject({ ok: false, message: 'Beim Buzzern gibt es keinen Joker' });
  });

  test('gilt ab dem aktuellen Promi bis zum Ende, gespiegelt je aufgelöstem Promi, Punktezähler stehen beim offenen Promi still', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startKids(h, { count: 3 });
    const [, b, c, d] = h.ids as [string, string, string, string];
    const items = () => round(h, 'kids').items;

    // Promi 1: C trifft selbst.
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(c, { type: 'kids_guess', text: items()[0]!.face.name }));
    expectOk(h.act(h.host, { type: 'kids_resolve' }));
    expectOk(h.act(h.host, { type: 'kids_next' }));

    // Promi 2: C hat falsch getippt und setzt dann den Joker auf B.
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(c, { type: 'kids_guess', text: 'Niemand' }));
    expectOk(joker(h, c, b));
    expect(round(h, 'kids').joker?.from).toBe(1);
    expect(items()[1]!.attempts[c]).toBeUndefined();
    expect(h.act(c, { type: 'kids_guess', text: items()[1]!.face.name })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });
    h.scheduler.advance(500);
    expectOk(h.act(b, { type: 'kids_guess', text: items()[1]!.face.name }));
    const open = view(h, d);
    if (open.game !== 'kids') throw new Error('kein Kinderpromis');
    expect(open.solved).toEqual([]);
    expect(open.hits[b]).toBe(0);
    expect(items()[1]!.solved[c]).toBeUndefined();
    // D trifft auch: Alle außer dem Joker-Spieler haben ihn, der Promi ist durch.
    h.scheduler.advance(500);
    expectOk(h.act(d, { type: 'kids_guess', text: items()[1]!.face.name }));
    expect(items()[1]!.stage).toBe('solved');
    expect(items()[1]!.solved[c]).toBe(items()[1]!.solved[b]!);

    const solved = view(h, d);
    if (solved.game !== 'kids') throw new Error('kein Kinderpromis');
    expect(solved.solved.map((s) => [s.playerId, s.rank])).toEqual([
      [b, 1],
      [c, 1],
      [d, 2],
    ]);
    expect(solved.points[c]).toBe(3 + 3);
    expect(h.act(h.host, { type: 'kids_judge', playerId: c, index: 0, correct: true })).toMatchObject({ ok: false });

    // Promi 3: B tippt nichts, C bekommt nichts.
    expectOk(h.act(h.host, { type: 'kids_next' }));
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expect(joker(h, d, b)).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'kids_resolve' }));
    expectOk(h.act(h.host, { type: 'kids_next' }));
    expect(h.room.phase).toBe('reveal');
    expect(items()[2]!.solved[c]).toBeUndefined();
    const v = view(h, null);
    if (v.game !== 'kids') throw new Error('kein Kinderpromis');
    expect(v.history[0]!.winners.map((w) => w.playerId)).toEqual([c]);
  });
});

describe('Joker: Filmfotos', () => {
  test('nicht beim Buzzern, nicht nach einem eigenen Tipp im Film', () => {
    const buzz = makeHarness(['Host', 'B', 'C']);
    startStills(buzz, { mode: 'buzz' });
    expect(joker(buzz, buzz.ids[1]!, buzz.ids[2]!)).toMatchObject({ ok: false, message: 'Beim Buzzern gibt es keinen Joker' });

    const h = makeHarness(['Host', 'B', 'C']);
    startStills(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'still_guess', text: 'Scarface' }));
    expectOk(h.act(h.host, { type: 'still_close' }));
    expectOk(h.act(h.host, { type: 'still_judge', playerId: b, correct: false }));
    expectOk(h.act(h.host, { type: 'still_next' }));
    expect(joker(h, b, c)).toMatchObject({ ok: false, message: 'Du hast in diesem Film schon getippt' });
  });

  test('Alle raten: der Joker-Spieler gilt als fertig, bekommt in der Auflösung Treffer und Punkte der Person', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startStills(h, { allGuess: true });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(c, { type: 'still_pass', pass: true }));
    expectOk(joker(h, c, b));
    expect(round(h, 'stills').passed).toEqual([]);
    expect(h.act(c, { type: 'still_guess', text: 'Der Pate' })).toMatchObject({ ok: false, message: 'Du kopierst mit deinem Joker' });
    expectOk(h.act(h.host, { type: 'still_close' }));
    expectOk(h.act(h.host, { type: 'still_next' }));
    expectOk(h.act(b, { type: 'still_guess', text: 'Der Pate' }));
    expectOk(h.act(d, { type: 'still_guess', text: 'Scarface' }));
    expectOk(h.act(h.host, { type: 'still_close' }));
    expectOk(h.act(h.host, { type: 'still_judge', playerId: b, correct: true }));
    expectOk(h.act(h.host, { type: 'still_judge', playerId: d, correct: false }));
    const over = view(h, d);
    if (over.game !== 'stills') throw new Error('keine Filmfotos');
    expect(over.over).toBe(true);
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(round(h, 'stills').attempts[c]).toEqual(round(h, 'stills').attempts[b]!);
    const v = view(h, h.host);
    if (v.game !== 'stills') throw new Error('keine Filmfotos');
    expect(v.points).toEqual({ [b]: 4, [c]: 4, [d]: 0 });
  });

  test('Erster Treffer gewinnt: der Joker-Spieler gewinnt mit der kopierten Person', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startStills(h);
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(joker(h, c, b));
    expectOk(h.act(b, { type: 'still_guess', text: 'Der Pate' }));
    expectOk(h.act(h.host, { type: 'still_close' }));
    expectOk(h.act(h.host, { type: 'still_judge', playerId: b, correct: true }));
    expect(joker(h, d, b)).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'end_round' }));
    const v = view(h, null);
    if (v.game !== 'stills') throw new Error('keine Filmfotos');
    expect(v.solved).toEqual({ index: 0, winners: [b, c] });
    expect(v.points[c]).toBe(5);
  });
});
