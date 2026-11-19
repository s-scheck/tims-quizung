import { describe, expect, test } from 'bun:test';
import { isClientMsg, type ClientMsg, type DungeonRoundView } from '@quiz/shared';
import { toView } from '../src/rooms/view.ts';
import type { DungeonDoor, DungeonRound } from '../src/rooms/state.ts';
import { buildDungeon } from '../src/games/dungeon/build.ts';
import { expectOk, makeHarness, provider, seeded, startDungeon, type Harness } from './fixtures.ts';

function dr(h: Harness): DungeonRound {
  const round = h.room.round;
  if (round?.game !== 'dungeon') throw new Error('keine Dungeon-Runde');
  return round;
}

function viewOf(h: Harness, viewerId: string | null): DungeonRoundView {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'dungeon') throw new Error('keine Dungeon-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(['Host', ...names]);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

function doorsOf(h: Harness, id: string): DungeonDoor[] {
  const r = dr(h);
  return r.rooms[r.players[id]!.room]!;
}

/** Zur Tür laufen und durchgehen. */
function go(h: Harness, id: string, door: DungeonDoor) {
  expectOk(h.act(id, { type: 'dungeon_walk', doorId: door.id }));
  return h.act(id, { type: 'dungeon_enter' });
}

/** Passende Antwort für eine Tür, richtig oder falsch. */
function answerFor(door: DungeonDoor, correct: boolean): ClientMsg {
  const p = door.payload;
  switch (p.kind) {
    case 'choice':
      return { type: 'dungeon_answer', choice: correct ? p.correctChoice : (p.correctChoice + 1) % 4 };
    case 'free':
      return { type: 'dungeon_answer', text: correct ? p.question.answer : 'völlig daneben' };
    case 'map':
      return { type: 'dungeon_answer', pin: correct ? { lat: p.place.lat + 0.1, lng: p.place.lng } : { lat: -p.place.lat, lng: p.place.lng - 90 } };
    case 'timeline':
      return { type: 'dungeon_answer', year: correct ? p.event.from : p.event.to + 500 };
    case 'topx':
      return { type: 'dungeon_answer', text: correct ? p.items[0]!.name : 'niemand' };
  }
}

function answer(h: Harness, id: string, correct: boolean) {
  const r = dr(h);
  const door = r.rooms.flat().find((d) => d.id === r.walk[id]!.doorId)!;
  return h.act(id, answerFor(door, correct));
}

describe('Dungeon: Aufbau', () => {
  test('Räume mit verschiedenen Listen je Raum, Grenzen werden strenger, zu wenige Listen gibt eine Meldung', () => {
    const rooms = buildDungeon(provider.list(), { rooms: 5, doors: 4, formats: ['questions', 'map', 'timeline', 'topx'] }, seeded(1));
    if (typeof rooms === 'string') throw new Error(rooms);
    expect(rooms).toHaveLength(5);
    for (const doors of rooms) {
      expect(doors).toHaveLength(4);
      expect(new Set(doors.map((d) => d.categoryId)).size).toBe(4);
    }
    const mapDoors = rooms.flatMap((doors, i) => doors.filter((d) => d.kind === 'map').map((d) => [i, d.tolerance]));
    expect(mapDoors.length).toBeGreaterThan(0);
    for (const [i, km] of mapDoors) expect(km).toBe([500, 400, 350, 250, 150][i as number]);
    // Top X ist auf die Listenlänge gekappt.
    for (const d of rooms.flat().filter((x) => x.kind === 'topx')) expect(d.tolerance).toBeLessThanOrEqual(d.categoryId === 'players' ? 5 : 20);
    expect(buildDungeon(provider.list(), { rooms: 3, doors: 3, formats: ['map', 'timeline'] }, seeded(1))).toContain('Zu wenige Listen');
  });
});

describe('Dungeon: Ablauf', () => {
  test('Fragen erst, wenn alle bestätigt haben; gleiche Tür, gleiche Frage; Lösungen geheim', () => {
    const h = moderated(['A', 'B', 'C']);
    const [, a, b, c] = h.ids as [string, string, string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    const [d1, d2] = doorsOf(h, a) as [DungeonDoor, DungeonDoor];
    // Laufen ist live sichtbar, umentscheiden geht bis zum Bestätigen.
    expectOk(h.act(a, { type: 'dungeon_walk', doorId: d2.id }));
    expect(viewOf(h, b).walk[a]).toEqual({ doorId: d2.id, confirmed: false });
    expectOk(go(h, a, d1));
    expect(h.act(a, { type: 'dungeon_walk', doorId: d2.id })).toMatchObject({ ok: false });
    expectOk(go(h, b, d1));
    expect(r.stage).toBe('choosing');
    expect(h.act(a, answerFor(d1, true))).toMatchObject({ ok: false });
    expectOk(go(h, c, d2));
    expect(r.stage).toBe('answering');

    const qa = viewOf(h, a).myQuestion!;
    const qb = viewOf(h, b).myQuestion!;
    expect(qa).toEqual(qb);
    expect(viewOf(h, c).myQuestion!.doorId).toBe(d2.id);
    expect(viewOf(h, null).myQuestion).toBeUndefined();
    expect(viewOf(h, h.host).myQuestion).toBeUndefined();
    expect(JSON.stringify(viewOf(h, h.host))).not.toContain('solutions');

    expectOk(answer(h, a, true));
    expect(answer(h, a, true)).toMatchObject({ ok: false });
    expect(viewOf(h, b).answered).toEqual([a]);
    expect(viewOf(h, b).myAnswer).toBeUndefined();
    expectOk(answer(h, b, false));
    expectOk(answer(h, c, true));
    expect(r.stage).toBe('result');
    const res = viewOf(h, b);
    expect(res.results?.[a]?.correct).toBe(true);
    expect(res.results?.[b]?.correct).toBe(false);
    expect(res.players[a]!.room).toBe(1);
    expect(res.players[b]!.locked).toEqual([d1.id]);
    expect(res.solutions).toBeUndefined();

    // Die verschlossene Tür bleibt für b zu.
    expect(h.act(b, { type: 'dungeon_walk', doorId: d1.id })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'dungeon_next' }));
    expect(h.act(b, { type: 'dungeon_walk', doorId: d1.id })).toMatchObject({ ok: false, message: 'Diese Tür ist für dich verschlossen' });
  });

  test('alle Türen zu heißt ausgeschieden; Ausgang, Rangliste und Auflösung', () => {
    const h = moderated(['A', 'B']);
    const [, a, b] = h.ids as [string, string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    for (let round = 0; round < 3; round++) {
      expectOk(go(h, a, doorsOf(h, a)[0]!));
      expectOk(go(h, b, doorsOf(h, b).find((d) => !r.players[b]!.locked.includes(d.id))!));
      expectOk(answer(h, a, true));
      expectOk(answer(h, b, false));
      if (round < 2) expectOk(h.act(h.host, { type: 'dungeon_next' }));
    }
    expect(r.players[a]).toMatchObject({ status: 'out', exitRound: 3, room: 3 });
    expect(r.players[b]).toMatchObject({ status: 'eliminated', wrong: 3, room: 0 });
    expect(viewOf(h, null).ranking.map((x) => [x.playerId, x.place, x.points])).toEqual([
      [a, 1, 2],
      [b, 2, 1],
    ]);
    // Niemand mehr drin: weiter heißt Auflösung, mit allen Fragen und Lösungen.
    expectOk(h.act(h.host, { type: 'dungeon_next' }));
    expect(h.room.phase).toBe('reveal');
    const end = viewOf(h, b);
    expect(end.attempts).toHaveLength(6);
    expect(Object.keys(end.solutions!)).toHaveLength(9);
  });

  test('Host überspringt beim Wählen und Antworten, ohne Tür zu verlieren; nur der Host', () => {
    const h = moderated(['A', 'B']);
    const [, a, b] = h.ids as [string, string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    expectOk(go(h, a, doorsOf(h, a)[0]!));
    expect(h.act(a, { type: 'dungeon_skip', playerId: b })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'dungeon_skip', playerId: a })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'dungeon_skip', playerId: b }));
    expect(r.stage).toBe('answering');
    expect(h.act(b, answerFor(doorsOf(h, b)[0]!, true))).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'dungeon_skip', playerId: a }));
    expect(r.stage).toBe('result');
    expect(r.players[a]).toMatchObject({ room: 0, wrong: 0, locked: [] });
    expect(r.players[b]).toMatchObject({ room: 0, wrong: 0, locked: [] });
    expect(r.attempts).toHaveLength(0);
    expectOk(h.act(h.host, { type: 'dungeon_next' }));
    expect(r.skipped).toEqual([]);
    expect(r.roundNo).toBe(2);
  });

  test('Spieler geht mitten in der Runde, Host beendet vorzeitig, Spieler spielt mit Host', () => {
    const h = makeHarness(['Host', 'A', 'B']);
    const [host, a, b] = h.ids as [string, string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    expect(r.turnOrder).toContain(host);
    expectOk(go(h, host, doorsOf(h, host)[0]!));
    expectOk(go(h, a, doorsOf(h, a)[1]!));
    h.room.leave(b);
    expect(r.stage).toBe('answering');
    expect(r.players[b]).toBeUndefined();
    expect(h.act(a, { type: 'end_round' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
  });

  test('Antwort muss zur Tür passen, Optionen werden gemerkt', () => {
    const h = moderated(['A']);
    const [, a] = h.ids as [string, string];
    startDungeon(h, { rooms: 4, doors: 3, formats: ['questions', 'timeline', 'topx'] });
    expect(h.room.dungeonOptions).toEqual({ rooms: 4, doors: 3, formats: ['questions', 'timeline', 'topx'] });
    const door = doorsOf(h, a).find((d) => d.kind === 'timeline')!;
    expectOk(go(h, a, door));
    expect(h.act(a, { type: 'dungeon_answer', text: 'egal' })).toMatchObject({ ok: false, code: 'bad_message' });
    // Nachrichten ohne genau eine gültige Antwort lässt schon die Prüfung im Hub nicht durch.
    expect(isClientMsg({ type: 'dungeon_answer', year: 0 })).toBe(false);
    expect(isClientMsg({ type: 'dungeon_answer', year: 1990, text: 'x' })).toBe(false);
    expect(isClientMsg({ type: 'dungeon_answer', pin: { lat: 99, lng: 0 } })).toBe(false);
    expect(isClientMsg({ type: 'dungeon_answer', pin: { lat: 50, lng: 8 } })).toBe(true);
    expect(isClientMsg({ type: 'choose_category', gameId: 'dungeon', categoryId: 'dungeon', dungeon: { rooms: 9, doors: 3, formats: ['map'] } })).toBe(false);
    expectOk(answer(h, a, true));
    expect(dr(h).results[a]?.correct).toBe(true);
  });
});
