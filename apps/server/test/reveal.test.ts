import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { BluffRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startBluff, startMap, startRisk, startRound, startTimeline, type Harness } from './fixtures.ts';

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

function mapView(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'map') throw new Error('keine Karten-Runde in der Sicht');
  return round;
}

function timelineView(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'timeline') throw new Error('keine Zeitstrahl-Runde in der Sicht');
  return round;
}

function riskView(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'risk') throw new Error('keine No-Risk-Runde in der Sicht');
  return round;
}

function bluffView(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'bluff') throw new Error('keine Bluff-Runde in der Sicht');
  return round;
}

/** Karte im Show-Modus bis zur Auflösung: B trifft Rom fast, C setzt nach Berlin. */
function mapShow(): Harness {
  const h = moderated(['Host', 'B', 'C']);
  startMap(h, { targetId: 'rom', reveal: 'show' });
  const [, b, c] = h.ids as [string, string, string];
  expectOk(h.act(b, { type: 'place_pin', lat: 41.9, lng: 12.5 }));
  expectOk(h.act(b, { type: 'confirm_pin' }));
  expectOk(h.act(c, { type: 'place_pin', lat: 52.52, lng: 13.405 }));
  expectOk(h.act(c, { type: 'confirm_pin' }));
  expectOk(h.act(h.host, { type: 'end_round' }));
  return h;
}

describe('Show-Auflösung: Wahl', () => {
  test('nur mit moderierendem Host und nur bei Spielen mit Show', () => {
    const playing = makeHarness(['A', 'B']);
    expectOk(playing.act(playing.host, { type: 'start_game' }));
    expect(playing.act(playing.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks', reveal: 'show' })).toMatchObject({
      ok: false,
      code: 'invalid_action',
    });
    expect(playing.room.phase).toBe('choosing_category');

    const h = moderated(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities', reveal: 'show' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities', reveal: 'auto' }));
    expect(h.room.round?.reveal).toBeNull();
  });

  test('Modus wird im Raum gemerkt, ohne Angabe bleibt der alte, Automatisch läuft wie bisher', () => {
    const h = moderated(['Host', 'B']);
    expect(toView(h.room, null).revealMode).toBe('auto');
    startMap(h, { targetId: 'rom', reveal: 'show' });
    expect(toView(h.room, null).revealMode).toBe('show');
    expect(h.room.round?.reveal).toEqual({ players: {}, solution: false });

    expectOk(h.act(h.host, { type: 'end_round' }));
    expectOk(h.act(h.host, { type: 'reveal_all' }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
    expectOk(h.act(h.host, { type: 'next_round' }));
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks', targetId: 'paris' }));
    expect(toView(h.room, null).revealMode).toBe('show');
    expect(h.room.round?.reveal).toBeNull();
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(mapView(h, h.ids[1]!).reveal).toBeUndefined();
    expect(mapView(h, h.ids[1]!).target).toBeDefined();
    expect(h.act(h.host, { type: 'reveal_solution' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'to_scoring' }));
  });
});

describe('Show-Auflösung: Karte', () => {
  test('Spieler und Screen sehen nur Namen, der Moderator alles samt Stand', () => {
    const h = mapShow();
    const [, b] = h.ids as [string, string];
    for (const viewer of [b, null]) {
      const v = mapView(h, viewer);
      expect(v.target).toBeUndefined();
      expect(v.pins).toEqual([]);
      expect(v.ranking).toEqual([]);
      expect(v.reveal).toEqual({ players: {}, steps: 1, solution: false, complete: false });
    }
    const host = mapView(h, h.host);
    expect(host.privileged).toBe(true);
    expect(host.target).toBeDefined();
    expect(host.pins?.length).toBe(2);
    expect(host.ranking?.map((r) => r.playerId)).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(host.reveal).toEqual({ players: {}, steps: 1, solution: false, complete: false });
  });

  test('Aufdecken Spieler für Spieler, Rangliste nur aus Aufgedeckten, Lösung eigener Schritt, Punkte erst danach', () => {
    const h = mapShow();
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'to_scoring' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'reveal_player', playerId: c })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'reveal_player', playerId: h.host })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: c }));
    let v = mapView(h, b);
    expect(v.pins?.map((p) => p.playerId)).toEqual([c]);
    expect(v.ranking?.map((r) => r.playerId)).toEqual([c]);
    expect(v.target).toBeUndefined();
    expect(v.reveal).toEqual({ players: { [c]: 1 }, steps: 1, solution: false, complete: false });
    expect(h.act(h.host, { type: 'reveal_player', playerId: c })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'reveal_solution' }));
    v = mapView(h, null);
    expect(v.target).toEqual({ lat: 41.9028, lng: 12.4964 });
    expect(v.reveal?.complete).toBe(false);
    expect(h.act(h.host, { type: 'reveal_solution' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'to_scoring' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: b }));
    v = mapView(h, c);
    expect(v.ranking?.map((r) => r.playerId)).toEqual([b, c]);
    expect(v.reveal?.complete).toBe(true);
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(h.room.phase).toBe('scoring');
  });

  test('„Alle aufdecken“ zeigt Rest und Lösung, Aufdecken geht nur in der Auflösung', () => {
    const h = moderated(['Host', 'B', 'C']);
    startMap(h, { targetId: 'rom', reveal: 'show' });
    expect(h.act(h.host, { type: 'reveal_player', playerId: h.ids[1]! })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.ids[1]!, { type: 'place_pin', lat: 41.9, lng: 12.5 }));
    expectOk(h.act(h.ids[1]!, { type: 'confirm_pin' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expectOk(h.act(h.host, { type: 'reveal_all' }));
    const v = mapView(h, null);
    expect(v.reveal).toEqual({ players: { [h.ids[1]!]: 1, [h.ids[2]!]: 1 }, steps: 1, solution: true, complete: true });
    expect(v.target).toBeDefined();
    expect(v.ranking).toEqual([
      { playerId: h.ids[1]!, distanceKm: expect.any(Number) },
      { playerId: h.ids[2]!, distanceKm: null },
    ]);
  });
});

describe('Show-Auflösung: Zeitstrahl', () => {
  test('Tipps und Lösung erscheinen erst nach dem Aufdecken', () => {
    const h = moderated(['Host', 'B', 'C']);
    startTimeline(h, { targetId: 'mond', reveal: 'show' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'place_year', year: 1969 }));
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expectOk(h.act(c, { type: 'place_year', year: 1950 }));
    expectOk(h.act(c, { type: 'confirm_pin' }));
    expectOk(h.act(h.host, { type: 'end_round' }));

    let v = timelineView(h, b);
    expect(v.target).toBeUndefined();
    expect(v.guesses).toEqual([]);
    expect(v.ranking).toEqual([]);
    expect(timelineView(h, h.host).guesses?.length).toBe(2);

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: c }));
    v = timelineView(h, null);
    expect(v.guesses).toEqual([{ playerId: c, year: 1950, distanceYears: 19 }]);
    expect(v.target).toBeUndefined();

    expectOk(h.act(h.host, { type: 'reveal_all' }));
    v = timelineView(h, b);
    expect(v.target).toEqual({ from: 1969, to: 1969 });
    expect(v.ranking?.map((r) => r.playerId)).toEqual([b, c]);
    expect(v.reveal?.complete).toBe(true);
    expectOk(h.act(h.host, { type: 'to_scoring' }));
  });
});

describe('Show-Auflösung: No Risk No Fun', () => {
  test('zwei Schritte je Spieler, Treffer und Summen erst ab Schritt 2, neuer Durchgang startet frisch', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h, { reveal: 'show' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'Mongolei' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Atlantis' }));
    expect(h.room.phase).toBe('reveal');

    const host = riskView(h, h.host);
    const hostB = host.passes[0]!.results.find((r) => r.playerId === b)!;
    expect(hostB).toMatchObject({ text: 'Mongolei', rank: 18 });
    expect(host.hitSlots.map((s) => s.rank)).toEqual([18]);
    expect(host.reveal).toEqual({ players: {}, steps: 2, solution: false, complete: false });

    let v = riskView(h, c);
    expect(v.passes[0]!.results).toEqual([
      { playerId: b, text: null, rank: null, points: 0 },
      { playerId: c, text: null, rank: null, points: 0 },
    ]);
    expect(v.hitSlots).toEqual([]);
    expect(v.totals).toEqual({ [b]: 0, [c]: 0 });
    expect(v.solution).toBeUndefined();
    expect(h.act(h.host, { type: 'next_pass' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: b }));
    v = riskView(h, c);
    expect(v.passes[0]!.results[0]).toEqual({ playerId: b, text: 'Mongolei', rank: null, points: 0 });
    expect(v.hitSlots).toEqual([]);

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: b }));
    v = riskView(h, null);
    expect(v.passes[0]!.results[0]).toEqual({ playerId: b, text: 'Mongolei', rank: 18, points: hostB.points });
    expect(v.hitSlots.map((s) => s.rank)).toEqual([18]);
    expect(v.totals[b]).toBe(hostB.points);
    expect(v.reveal?.players).toEqual({ [b]: 2 });
    expect(h.act(h.host, { type: 'reveal_player', playerId: b })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'next_pass' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: c }));
    expectOk(h.act(h.host, { type: 'reveal_player', playerId: c }));
    expect(riskView(h, c).reveal?.complete).toBe(true);
    expect(riskView(h, c).solution).toBeUndefined();
    expectOk(h.act(h.host, { type: 'next_pass' }));
    expect(h.room.round?.reveal).toEqual({ players: {}, solution: false });
    expect(riskView(h, c).passes[0]!.results[0]).toMatchObject({ text: 'Mongolei', rank: 18 });
  });

  test('„Alle aufdecken“ lässt die Liste zu, „Liste aufdecken“ beendet die Kategorie', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h, { reveal: 'show' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'Peru' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Kanada' }));
    expectOk(h.act(h.host, { type: 'reveal_all' }));
    let v = riskView(h, b);
    expect(v.reveal).toEqual({ players: { [b]: 2, [c]: 2 }, steps: 2, solution: false, complete: true });
    expect(v.solution).toBeUndefined();
    expectOk(h.act(h.host, { type: 'next_pass' }));

    expectOk(h.act(b, { type: 'risk_guess', text: 'Indien' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Nirgendwo' }));
    expectOk(h.act(h.host, { type: 'reveal_solution' }));
    v = riskView(h, null);
    expect(v.solution?.length).toBe(20);
    expect(v.reveal?.complete).toBe(true);
    expect(v.passes[1]!.results.find((r) => r.playerId === b)?.text).toBeNull();
    expect(h.act(h.host, { type: 'next_pass' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(riskView(h, null).passes[1]!.results.find((r) => r.playerId === b)).toMatchObject({ text: 'Indien', rank: 7 });
  });
});

describe('Show-Auflösung: Bluff', () => {
  function br(h: Harness): BluffRound {
    const round = h.room.round;
    if (round?.game !== 'bluff') throw new Error('keine Bluff-Runde');
    return round;
  }
  const entryOf = (h: Harness, authorId: string | null) => br(h).entries.find((e) => e.authorId === authorId)!.id;

  test('Autoren, Wahrheit und Punkte kommen einzeln, Text oder Name führen zum selben Schritt', () => {
    const h = moderated(['Host', 'B', 'C']);
    startBluff(h, { targetId: 'alien', reveal: 'show' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'submit_text', text: 'Text von B' }));
    expectOk(h.act(c, { type: 'submit_text', text: 'Text von C' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    expectOk(h.act(b, { type: 'vote', entryId: entryOf(h, c) }));
    expectOk(h.act(c, { type: 'vote', entryId: entryOf(h, null) }));
    expectOk(h.act(h.host, { type: 'advance' }));
    expectOk(h.act(h.host, { type: 'advance' }));
    expect(h.room.phase).toBe('reveal');

    let v = bluffView(h, b);
    expect(v.truth).toBeUndefined();
    expect(v.entries?.length).toBe(3);
    for (const e of v.entries ?? []) {
      expect(e.authorId).toBeUndefined();
      expect(e.isTruth).toBeUndefined();
      expect(e.points).toBeUndefined();
      expect(e.votes).toBeDefined();
    }
    expect(v.points).toEqual({ [b]: 0, [c]: 0 });
    expect(v.reveal).toEqual({ players: {}, steps: 1, solution: false, complete: false });
    const host = bluffView(h, h.host);
    expect(host.truth).toBeDefined();
    expect(host.points).toEqual({ [b]: 0, [c]: 3 });

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: c }));
    v = bluffView(h, null);
    const cEntry = v.entries?.find((e) => e.id === entryOf(h, c));
    expect(cEntry).toMatchObject({ authorId: c, isTruth: false, points: 1 });
    expect(v.entries?.find((e) => e.id === entryOf(h, b))?.authorId).toBeUndefined();
    expect(v.truth).toBeUndefined();
    expect(v.points).toEqual({ [b]: 0, [c]: 1 });

    expectOk(h.act(h.host, { type: 'reveal_solution' }));
    v = bluffView(h, b);
    expect(v.truth).toBe('Im Weltraum hört dich niemand schreien.');
    expect(v.entries?.find((e) => e.id === entryOf(h, null))).toMatchObject({ isTruth: true, authorId: null });
    expect(v.points).toEqual({ [b]: 0, [c]: 3 });
    expect(v.reveal?.complete).toBe(false);
    expect(h.act(h.host, { type: 'to_scoring' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'reveal_player', playerId: b }));
    expect(bluffView(h, c).reveal?.complete).toBe(true);
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(bluffView(h, c).points).toEqual({ [b]: 0, [c]: 3 });
  });
});

describe('Show-Auflösung: Sortieren bleibt unberührt', () => {
  test('ohne Show-Modus ist die Auflösung sofort komplett', () => {
    const h = moderated(['Host', 'B']);
    startRound(h);
    expect(h.room.round?.reveal).toBeNull();
    expect(toView(h.room, null).round?.reveal).toBeUndefined();
  });
});
