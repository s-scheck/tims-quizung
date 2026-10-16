import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { MorseRound } from '../src/rooms/state.ts';
import { morsePoints } from '../src/games/morse/reducer.ts';
import { expectOk, makeHarness, startMorse, type Harness } from './fixtures.ts';

function mr(h: Harness): MorseRound {
  const round = h.room.round;
  if (round?.game !== 'morse') throw new Error('keine Morse-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'morse') throw new Error('keine Morse-Runde in der Sicht');
  return round;
}

describe('Morse: Rundenstart', () => {
  test('Wort wird normalisiert, Host rät nie mit, auch wenn er sonst spielt', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    expect(h.room.settings.hostPlays).toBe(true);
    startMorse(h, '  hallo   Welt! ');
    const r = mr(h);
    expect(h.room.phase).toBe('playing');
    expect(h.room.gameId).toBe('morse');
    expect(r.word).toBe('HALLO WELT');
    expect(r.code).toBe('.... .- .-.. .-.. --- / .-- . .-.. -');
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBeNull();
    expect(r.startedAt).toBe(h.scheduler.now());
    expect(r.category).toEqual({ kind: 'none', id: 'morse', title: 'Morse' });
    expect(h.room.playedCategoryIds).toEqual([]);
  });

  test('ohne Wort, zu lang oder ohne Mitspieler startet nichts', () => {
    const h = makeHarness(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'morse', categoryId: 'morse' })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'morse', categoryId: 'morse', word: '???' })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'morse', categoryId: 'morse', word: 'A'.repeat(31) })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.room.phase).toBe('choosing_category');
    const solo = makeHarness(['Host']);
    expectOk(solo.act(solo.host, { type: 'start_game' }));
    expect(solo.act(solo.host, { type: 'choose_category', gameId: 'morse', categoryId: 'morse', word: 'SOS' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });
});

describe('Morse: Raten', () => {
  test('falsch, dann richtig mit Normalisierung; Platz und Zeit', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startMorse(h, 'Star Wars');
    const r = mr(h);
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'morse_guess', text: 'x' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'morse_guess', text: '   ' })).toMatchObject({ ok: false, code: 'bad_message' });
    h.scheduler.advance(4000);
    expectOk(h.act(b, { type: 'morse_guess', text: 'Star Trek' }));
    expect(r.attempts[b]).toEqual([{ text: 'STAR TREK', at: r.startedAt + 4000, correct: false }]);
    expect(r.solved[b]).toBeUndefined();
    h.scheduler.advance(1000);
    expectOk(h.act(b, { type: 'morse_guess', text: 'starwars!' }));
    expect(r.solved[b]).toBe(r.startedAt + 5000);
    expect(h.act(b, { type: 'morse_guess', text: 'nochmal' })).toMatchObject({ ok: false, code: 'invalid_action' });
    h.scheduler.advance(2000);
    expectOk(h.act(c, { type: 'morse_guess', text: 'STAR WARS' }));
    expect(viewRound(h, null).solved).toEqual([
      { playerId: b, at: r.startedAt + 5000, rank: 1 },
      { playerId: c, at: r.startedAt + 7000, rank: 2 },
    ]);
    expect(morsePoints(r)).toEqual({ [b]: 3, [c]: 2 });
  });

  test('Host gibt einen Fehlversuch frei, die Zeit des Versuchs zählt', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startMorse(h, 'Kaffee');
    const r = mr(h);
    const [, b, c, d] = h.ids as [string, string, string, string];
    h.scheduler.advance(1000);
    expectOk(h.act(b, { type: 'morse_guess', text: 'Kaffe' }));
    h.scheduler.advance(1000);
    expectOk(h.act(c, { type: 'morse_guess', text: 'Kaffee' }));
    h.scheduler.advance(1000);
    expectOk(h.act(d, { type: 'morse_guess', text: 'Kaffee' }));
    expect(h.act(b, { type: 'morse_accept', playerId: b, index: 0 })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'morse_accept', playerId: b, index: 3 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'morse_accept', playerId: c, index: 0 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'morse_accept', playerId: b, index: 0 }));
    expect(r.attempts[b]![0]!.correct).toBe(true);
    expect(r.solved[b]).toBe(r.startedAt + 1000);
    expect(viewRound(h, null).solved.map((s) => [s.playerId, s.rank])).toEqual([[b, 1], [c, 2], [d, 3]]);
    expect(morsePoints(r)).toEqual({ [b]: 3, [c]: 2, [d]: 1 });
  });

  test('Vierter Löser bekommt keine Punkte, Reihenfolge bei gleicher Zeit nach Beitritt', () => {
    const h = makeHarness(['Host', 'A', 'B', 'C', 'D']);
    startMorse(h, 'SOS');
    for (const id of h.ids.slice(1)) expectOk(h.act(id, { type: 'morse_guess', text: 'sos' }));
    const [, a, b, c, d] = h.ids as [string, string, string, string, string];
    expect(morsePoints(mr(h))).toEqual({ [a]: 3, [b]: 2, [c]: 1, [d]: 0 });
  });
});

describe('Morse: Host-Steuerung und Sichtbarkeit', () => {
  test('Wiedergabe, Licht, Code und Tabelle; nur der Host', () => {
    const h = makeHarness(['Host', 'B']);
    startMorse(h, 'SOS');
    const r = mr(h);
    const b = h.ids[1]!;
    expect(h.act(b, { type: 'morse_play', speed: 'medium' })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(b, { type: 'morse_show_code', shown: true })).toMatchObject({ ok: false, code: 'not_host' });
    expect(viewRound(h, b).playback).toBeNull();
    expect(viewRound(h, b).lightShown).toBe(false);
    expectOk(h.act(h.host, { type: 'morse_play', speed: 'slow' }));
    const pb = viewRound(h, b).playback;
    expect(pb).toMatchObject({ id: 1, startAt: h.scheduler.now() + 600, unitMs: 150 });
    // Blinkzeiten für "SOS": 9 Signale, erster Punkt 150 ms, erster Strich 450 ms
    expect(pb?.beeps.length).toBe(9);
    expect(pb?.beeps[0]).toEqual({ at: 0, duration: 150 });
    expect(pb?.beeps[3]).toEqual({ at: 1200, duration: 450 });
    expect(viewRound(h, null).playback?.id).toBe(1);
    expectOk(h.act(h.host, { type: 'morse_play', speed: 'fast' }));
    expect(r.plays).toBe(2);
    expect(viewRound(h, b).playback).toMatchObject({ id: 2, unitMs: 70 });
    expectOk(h.act(h.host, { type: 'morse_stop' }));
    expect(viewRound(h, b).playback).toBeNull();
    expect(r.plays).toBe(2);
    expectOk(h.act(h.host, { type: 'morse_show_light', shown: true }));
    expect(viewRound(h, null).lightShown).toBe(true);
    expect(viewRound(h, b).code).toBeUndefined();
    expectOk(h.act(h.host, { type: 'morse_show_code', shown: true }));
    expect(viewRound(h, b).code).toBe('... --- ...');
    expect(viewRound(h, null).code).toBe('... --- ...');
    expectOk(h.act(h.host, { type: 'morse_show_code', shown: false }));
    expect(viewRound(h, b).code).toBeUndefined();
    expectOk(h.act(h.host, { type: 'morse_show_table', shown: true }));
    expect(viewRound(h, null).tableShown).toBe(true);
  });

  test('Spieler und Bildschirm sehen weder Wort noch fremde Versuche, der Host alles', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startMorse(h, 'Pizza');
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'morse_guess', text: 'Pasta' }));
    const bView = viewRound(h, b);
    expect(bView.lengths).toEqual([5]);
    expect(bView.word).toBeUndefined();
    expect(bView.code).toBeUndefined();
    expect(bView.attempts).toBeUndefined();
    expect(bView.points).toBeUndefined();
    expect(bView.myAttempts).toEqual([{ text: 'PASTA', at: mr(h).startedAt, correct: false }]);
    expect(JSON.stringify(viewRound(h, c))).not.toContain('PASTA');
    expect(JSON.stringify(viewRound(h, c))).not.toContain('PIZZA');
    const screen = viewRound(h, null);
    expect(screen.myAttempts).toBeUndefined();
    expect(JSON.stringify(screen)).not.toContain('PIZZA');
    expect(JSON.stringify(screen)).not.toContain('PASTA');
    const host = viewRound(h, h.host);
    expect(host.privileged).toBe(true);
    expect(host.word).toBe('PIZZA');
    expect(host.code).toBe('.--. .. --.. --.. .-');
    expect(host.attempts?.[b]).toEqual([{ text: 'PASTA', at: mr(h).startedAt, correct: false }]);
    expect(host.points).toEqual({ [b]: 0, [c]: 0 });
  });

  test('nur der Host beendet, Auflösung zeigt alles, Punkte laufen weiter', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startMorse(h, 'Mond');
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(c, { type: 'morse_guess', text: 'Mond' }));
    expectOk(h.act(h.host, { type: 'morse_play', speed: 'medium' }));
    expect(h.act(b, { type: 'end_round' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, null).playback).toBeNull();
    const pub = viewRound(h, null);
    expect(pub.word).toBe('MOND');
    expect(pub.code).toBe('-- --- -. -..');
    expect(pub.points).toEqual({ [b]: 0, [c]: 3 });
    expect(pub.solved[0]?.playerId).toBe(c);
    expect(h.act(c, { type: 'morse_guess', text: 'Mond' })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [c]: 3 } }));
    expect(h.room.rounds[0]).toMatchObject({ gameId: 'morse', categoryId: 'morse', categoryTitle: 'Morse' });
    expect(h.room.scores[c]).toBe(3);
    expectOk(h.act(h.host, { type: 'next_round' }));
    expect(h.room.phase).toBe('choosing_category');
    expect(toView(h.room, null).games?.some((g) => g.id === 'morse')).toBe(true);
  });
});

describe('Morse: Spieler kommen und gehen', () => {
  test('Verlassen entfernt Versuche und Lösung, später Beitritt schaut zu', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startMorse(h, 'Sonne');
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'morse_guess', text: 'Sonne' }));
    const late = h.room.join('Spät', undefined);
    if (!late.ok) throw new Error();
    expect(mr(h).turnOrder).not.toContain(late.player.id);
    expect(h.act(late.player.id, { type: 'morse_guess', text: 'Sonne' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expectOk(h.room.leave(b));
    const r = mr(h);
    expect(r.turnOrder).toEqual([c]);
    expect(r.solved[b]).toBeUndefined();
    expect(morsePoints(r)).toEqual({ [c]: 0 });
    expect(h.room.phase).toBe('playing');
    expectOk(h.room.leave(c));
    expect(h.room.phase).toBe('reveal');
  });
});
