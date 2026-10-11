import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { TimelineRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startTimeline, type Harness } from './fixtures.ts';

function tr(h: Harness): TimelineRound {
  const round = h.room.round;
  if (round?.game !== 'timeline') throw new Error('keine Zeitstrahl-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'timeline') throw new Error('keine Zeitstrahl-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

describe('Zeitstrahl: Rundenstart', () => {
  test('Moderator wählt das Ereignis und sieht es in der Kategorieauswahl', () => {
    const h = moderated(['Host', 'B', 'C']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    const summary = toView(h.room, h.host).categories?.find((c) => c.id === 'history');
    expect(summary?.count).toBe(4);
    expect(summary?.targets?.map((t) => t.id)).toEqual(['caesar', 'revolution', 'ww2', 'mond']);
    expect(toView(h.room, h.ids[1]!).categories?.find((c) => c.id === 'history')?.targets).toBeUndefined();

    expect(h.act(h.host, { type: 'choose_category', gameId: 'timeline', categoryId: 'history' })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'timeline', categoryId: 'history', targetId: 'ww2' }));
    const r = tr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.target).toEqual({ id: 'ww2', name: 'Zweiter Weltkrieg', from: 1939, to: 1945 });
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.turnDeadline).toBeNull();
    expect(h.room.playedTargets['history']).toEqual(['ww2']);
  });

  test('mitspielender Host bekommt Zufall ohne Wiederholung', () => {
    const h = makeHarness(['A', 'B']);
    startTimeline(h, { targetId: 'ww2' });
    const seen = new Set([tr(h).target.id]);
    for (let i = 0; i < 3; i++) {
      expectOk(h.act(h.host, { type: 'end_round' }));
      expectOk(h.act(h.host, { type: 'to_scoring' }));
      expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
      expectOk(h.act(h.host, { type: 'next_round' }));
      expectOk(h.act(h.host, { type: 'choose_category', gameId: 'timeline', categoryId: 'history' }));
      seen.add(tr(h).target.id);
    }
    expect(seen.size).toBe(4);
  });

  test('Ereignisliste passt nicht zu anderen Spielen und umgekehrt', () => {
    const h = makeHarness(['A']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'history' })).toMatchObject({ ok: false, code: 'unknown_category' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'timeline', categoryId: 'landmarks' })).toMatchObject({ ok: false, code: 'unknown_category' });
  });
});

describe('Zeitstrahl: Tipps und Sichtbarkeit', () => {
  test('setzen, ändern, bestätigen; danach fest', () => {
    const h = moderated(['Host', 'B', 'C']);
    startTimeline(h, { targetId: 'revolution' });
    const [, b] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'place_year', year: 1789 })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'confirm_pin' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(b, { type: 'place_year', year: 1700 }));
    expectOk(h.act(b, { type: 'place_year', year: 1800 }));
    expect(tr(h).guesses[b]).toEqual({ year: 1800, confirmed: false });
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expect(h.act(b, { type: 'place_year', year: 1790 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(viewRound(h, null).confirmed).toEqual([b]);
  });

  test('jeder sieht nur den eigenen Tipp, die Lösung nur der Moderator', () => {
    const h = moderated(['Host', 'B', 'C']);
    startTimeline(h, { targetId: 'ww2' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'place_year', year: 1911 }));
    expectOk(h.act(c, { type: 'place_year', year: 1922 }));

    const bView = viewRound(h, b);
    expect(bView.eventName).toBe('Zweiter Weltkrieg');
    expect(bView.myGuess).toEqual({ year: 1911, confirmed: false });
    expect(bView.target).toBeUndefined();
    expect(bView.guesses).toBeUndefined();
    expect(JSON.stringify(bView)).not.toContain('1922');
    expect(JSON.stringify(bView)).not.toContain('1939');

    const screen = viewRound(h, null);
    expect(screen.myGuess).toBeUndefined();
    expect(screen.target).toBeUndefined();

    const host = viewRound(h, h.host);
    expect(host.privileged).toBe(true);
    expect(host.target).toEqual({ from: 1939, to: 1945 });
    expect(JSON.stringify(host)).not.toContain('1911');
  });

  test('Auflösung: Abstand 0 innerhalb der Spanne, sonst zur näheren Grenze, ohne Tipp hinten', () => {
    const h = moderated(['Host', 'B', 'C', 'D', 'E']);
    startTimeline(h, { targetId: 'ww2' });
    const [, b, c, d, e] = h.ids as [string, string, string, string, string];
    expectOk(h.act(b, { type: 'place_year', year: 1950 }));
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expectOk(h.act(c, { type: 'place_year', year: 1942 }));
    expectOk(h.act(c, { type: 'confirm_pin' }));
    expectOk(h.act(d, { type: 'place_year', year: 1930 }));
    expectOk(h.act(d, { type: 'confirm_pin' }));
    expectOk(h.act(e, { type: 'place_year', year: 1940 }));
    expect(h.act(b, { type: 'end_round' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');

    const pub = viewRound(h, null);
    expect(pub.target).toEqual({ from: 1939, to: 1945 });
    expect(pub.ranking).toEqual([
      { playerId: c, distanceYears: 0 },
      { playerId: b, distanceYears: 5 },
      { playerId: d, distanceYears: 9 },
      { playerId: e, distanceYears: null },
    ]);
    expect(pub.guesses?.find((g) => g.playerId === c)).toEqual({ playerId: c, year: 1942, distanceYears: 0 });
    expect(pub.guesses?.some((g) => g.playerId === e)).toBe(false);
  });

  test('über die Zeitenwende zählt kein Jahr 0', () => {
    const h = moderated(['Host', 'B']);
    startTimeline(h, { targetId: 'caesar' });
    const b = h.ids[1]!;
    expectOk(h.act(b, { type: 'place_year', year: 10 }));
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(viewRound(h, null).ranking).toEqual([{ playerId: b, distanceYears: 53 }]);
  });

  test('Verlassen entfernt den Tipp, letzter Teilnehmer weg beendet die Runde', () => {
    const h = moderated(['Host', 'B', 'C']);
    startTimeline(h, { targetId: 'mond' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'place_year', year: 1970 }));
    expectOk(h.room.leave(b));
    expect(tr(h).guesses[b]).toBeUndefined();
    expect(h.room.phase).toBe('playing');
    expectOk(h.room.leave(c));
    expect(h.room.phase).toBe('reveal');
  });
});

describe('Zeitstrahl: Zeitlimit', () => {
  test('gilt für die ganze Runde, bei Ablauf zählen auch unbestätigte Tipps', () => {
    const h = makeHarness(['A', 'B', 'C'], { timer: 60 });
    startTimeline(h);
    const r = tr(h);
    const [a, b, c] = h.ids as [string, string, string];
    expect(r.turnDeadline).toBe(h.scheduler.now() + 60_000);
    expect(viewRound(h, null).turnDeadline).toBe(r.turnDeadline);
    expectOk(h.act(a, { type: 'place_year', year: 1800 }));
    expectOk(h.act(a, { type: 'confirm_pin' }));
    expectOk(h.act(b, { type: 'place_year', year: 1900 }));
    const emitsBefore = h.emits.length;
    h.scheduler.advance(60_000);
    expect(h.room.phase).toBe('reveal');
    expect(h.emits.length).toBe(emitsBefore + 1);
    const pub = viewRound(h, null);
    expect(pub.guesses?.map((g) => g.playerId).sort()).toEqual([a, b].sort());
    expect(pub.ranking?.at(-1)).toEqual({ playerId: c, distanceYears: null });
  });

  test('Host beendet vorher: Timer ist weg', () => {
    const h = makeHarness(['A', 'B'], { timer: 30 });
    startTimeline(h);
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.scheduler.pending).toBe(0);
  });
});
