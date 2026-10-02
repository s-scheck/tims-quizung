import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { MapRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startMap, type Harness } from './fixtures.ts';

function kr(h: Harness): MapRound {
  const round = h.room.round;
  if (round?.game !== 'map') throw new Error('keine Karten-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'map') throw new Error('keine Karten-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

describe('Karte: Rundenstart', () => {
  test('Moderator wählt das Ziel, Grenzen werden gemerkt, keine Zugreihenfolge', () => {
    const h = moderated(['Host', 'B', 'C']);
    startMap(h, { targetId: 'rom', borders: true });
    const r = kr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.target).toEqual({ id: 'rom', name: 'Rom', lat: 41.9028, lng: 12.4964 });
    expect(r.borders).toBe(true);
    expect(h.room.mapBorders).toBe(true);
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBeNull();
    expect(r.turnDeadline).toBeNull();
    expect(h.room.playedPlaces['landmarks']).toEqual(['rom']);
    expect(h.room.timers.turn).toBeNull();
  });

  test('Moderator ohne Ziel oder mit unbekanntem Ziel startet nicht', () => {
    const h = moderated(['Host', 'B']);
    expectOk(h.act(h.host, { type: 'start_game' }));
    expect(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks', targetId: 'atlantis' })).toMatchObject({ ok: false, code: 'unknown_category' });
    expect(h.room.phase).toBe('choosing_category');
  });

  test('mitspielender Host bekommt Zufall ohne Wiederholung, Zielwunsch wird ignoriert', () => {
    const h = makeHarness(['A', 'B']);
    const seen = new Set<string>();
    startMap(h, { targetId: 'rom' });
    seen.add(kr(h).target.id);
    expect(kr(h).turnOrder).toEqual(h.ids);
    for (let i = 0; i < 3; i++) {
      expectOk(h.act(h.host, { type: 'end_round' }));
      expectOk(h.act(h.host, { type: 'to_scoring' }));
      expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
      expectOk(h.act(h.host, { type: 'next_round' }));
      expectOk(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks' }));
      seen.add(kr(h).target.id);
    }
    expect(seen.size).toBe(4);
    expect(h.room.playedPlaces['landmarks']?.length).toBe(4);
    // Alles gespielt: wieder jedes möglich.
    expectOk(h.act(h.host, { type: 'end_round' }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
    expectOk(h.act(h.host, { type: 'next_round' }));
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'map', categoryId: 'landmarks' }));
    expect(seen.has(kr(h).target.id)).toBe(true);
  });

  test('Grenzen-Vorgabe bleibt ohne Angabe erhalten', () => {
    const h = makeHarness(['A']);
    h.room.mapBorders = true;
    startMap(h);
    expect(kr(h).borders).toBe(true);
  });
});

describe('Karte: Pins und Sichtbarkeit', () => {
  test('setzen, verschieben, bestätigen; danach fest', () => {
    const h = moderated(['Host', 'B', 'C']);
    startMap(h, { targetId: 'berlin' });
    const r = kr(h);
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'place_pin', lat: 1, lng: 1 })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'confirm_pin' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(b, { type: 'place_pin', lat: 50, lng: 10 }));
    expectOk(h.act(b, { type: 'place_pin', lat: 52, lng: 13 }));
    expect(r.pins[b]).toEqual({ lat: 52, lng: 13, confirmed: false });
    expect(viewRound(h, null).confirmed).toEqual([]);
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expect(h.act(b, { type: 'place_pin', lat: 0, lng: 0 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(b, { type: 'confirm_pin' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(viewRound(h, null).confirmed).toEqual([b]);
    expect(viewRound(h, c).confirmed).toEqual([b]);
  });

  test('jeder sieht nur den eigenen Pin, Ziel nur der Moderator', () => {
    const h = moderated(['Host', 'B', 'C']);
    startMap(h, { targetId: 'berlin' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'place_pin', lat: 52, lng: 13 }));
    expectOk(h.act(c, { type: 'place_pin', lat: 48, lng: 2 }));
    expectOk(h.act(c, { type: 'confirm_pin' }));

    const bView = viewRound(h, b);
    expect(bView.myPin).toEqual({ lat: 52, lng: 13, confirmed: false });
    expect(bView.target).toBeUndefined();
    expect(bView.pins).toBeUndefined();
    expect(bView.ranking).toBeUndefined();
    expect(bView.targetName).toBe('Berlin');
    expect(JSON.stringify(bView)).not.toContain('"lng":2');

    const cView = viewRound(h, c);
    expect(cView.myPin).toEqual({ lat: 48, lng: 2, confirmed: true });
    expect(JSON.stringify(cView)).not.toContain('"lng":13');

    const screen = viewRound(h, null);
    expect(screen.myPin).toBeUndefined();
    expect(screen.target).toBeUndefined();
    expect(screen.confirmed).toEqual([c]);
    expect(JSON.stringify(screen)).not.toContain('"lat"');

    const host = viewRound(h, h.host);
    expect(host.privileged).toBe(true);
    expect(host.target).toEqual({ lat: 52.52, lng: 13.405 });
    expect(host.myPin).toBeUndefined();
    expect(host.pins).toBeUndefined();
    expect(JSON.stringify(host)).not.toContain('"lng":2');
  });

  test('Auflösung: nur bestätigte Pins mit Entfernung, unbestätigte hinten', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startMap(h, { targetId: 'berlin' });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(b, { type: 'place_pin', lat: 48.8566, lng: 2.3522 }));
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expectOk(h.act(c, { type: 'place_pin', lat: 52.5, lng: 13.4 }));
    expectOk(h.act(c, { type: 'confirm_pin' }));
    expectOk(h.act(d, { type: 'place_pin', lat: 0, lng: 0 }));
    expect(h.act(b, { type: 'end_round' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');

    const pub = viewRound(h, null);
    expect(pub.target).toEqual({ lat: 52.52, lng: 13.405 });
    expect(pub.pins?.map((p) => p.playerId).sort()).toEqual([b, c].sort());
    expect(pub.ranking?.map((r) => r.playerId)).toEqual([c, b, d]);
    expect(pub.ranking?.[0]?.distanceKm).toBeLessThan(5);
    expect(pub.ranking?.[1]?.distanceKm).toBeGreaterThan(870);
    expect(pub.ranking?.[2]?.distanceKm).toBeNull();
    expect(JSON.stringify(pub)).not.toContain('"lng":0');

    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [c]: 3, [b]: 1 } }));
    expect(h.room.rounds[0]).toMatchObject({ gameId: 'map', categoryId: 'landmarks', survivors: [b, c, d], eliminatedOrder: [] });
    expect(h.room.scores[c]).toBe(3);
  });

  test('Ende ohne Teilnehmerpins, Züge und Host-Entscheidung gibt es nicht', () => {
    const h = makeHarness(['A', 'B']);
    startMap(h);
    expect(h.act(h.host, { type: 'skip_turn', turnNo: 1 })).toMatchObject({ ok: false });
    expect(h.act(h.host, { type: 'host_decision', continue: false })).toMatchObject({ ok: false });
    expect(h.act(h.host, { type: 'select', turnNo: 1 })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, null).ranking).toEqual([
      { playerId: h.ids[0]!, distanceKm: null },
      { playerId: h.ids[1]!, distanceKm: null },
    ]);
    expect(h.act(h.host, { type: 'end_round' })).toMatchObject({ ok: false });
  });
});

describe('Karte: Spieler kommen und gehen', () => {
  test('Verlassen entfernt den Pin, letzter Teilnehmer weg beendet die Runde', () => {
    const h = moderated(['Host', 'B', 'C']);
    startMap(h, { targetId: 'paris' });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'place_pin', lat: 1, lng: 1 }));
    expectOk(h.act(b, { type: 'confirm_pin' }));
    expectOk(h.room.leave(b));
    const r = kr(h);
    expect(r.turnOrder).toEqual([c]);
    expect(r.pins[b]).toBeUndefined();
    expect(h.room.phase).toBe('playing');
    expectOk(h.room.leave(c));
    expect(h.room.phase).toBe('reveal');
  });

  test('später Beitritt schaut zu und darf keinen Pin setzen', () => {
    const h = makeHarness(['A', 'B']);
    startMap(h);
    const late = h.room.join('Spät', undefined);
    if (!late.ok) throw new Error();
    expect(kr(h).turnOrder).not.toContain(late.player.id);
    expect(h.act(late.player.id, { type: 'place_pin', lat: 1, lng: 1 })).toMatchObject({ ok: false, code: 'not_allowed' });
  });
});
