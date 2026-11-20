import { describe, expect, test } from 'bun:test';
import { DUNGEON_RESULT_MS, isClientMsg, type ClientMsg, type DungeonRoundView } from '@quiz/shared';
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
    // b hat seinen einen Schlüssel schon verbraucht, sonst rettet er ihn vor dem Ausscheiden.
    r.players[b]!.keyFound = true;
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

describe('Dungeon: Schlüssel, Spuren, Weiter von selbst', () => {
  test('Ergebnis geht nach der Wartezeit von selbst weiter, am Ende zur Auswertung', () => {
    const h = moderated(['A']);
    const [, a] = h.ids as [string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    expectOk(go(h, a, doorsOf(h, a)[0]!));
    expectOk(answer(h, a, true));
    expect(r.stage).toBe('result');
    expect(viewOf(h, a).nextAt).toBe(h.room.now + DUNGEON_RESULT_MS);
    h.scheduler.advance(DUNGEON_RESULT_MS - 1);
    expect(r.stage).toBe('result');
    h.scheduler.advance(1);
    expect(r.stage).toBe('choosing');
    expect(r.roundNo).toBe(2);
    expect(viewOf(h, a).nextAt).toBeNull();
    // Der Host kann früher weiter; der alte Timer greift danach nicht mehr.
    expectOk(go(h, a, doorsOf(h, a)[0]!));
    expectOk(answer(h, a, true));
    expectOk(h.act(h.host, { type: 'dungeon_next' }));
    expect(r.roundNo).toBe(3);
    h.scheduler.advance(DUNGEON_RESULT_MS);
    expect(r.stage).toBe('choosing');
    expect(r.roundNo).toBe(3);
    expectOk(go(h, a, doorsOf(h, a)[0]!));
    expectOk(answer(h, a, true));
    expect(r.players[a]!.status).toBe('out');
    h.scheduler.advance(DUNGEON_RESULT_MS);
    expect(h.room.phase).toBe('reveal');
  });

  test('zweiter Fehlversuch bringt einmal einen Schlüssel; er öffnet auch eine verschlossene Tür ohne Frage', () => {
    const h = moderated(['A', 'B']);
    const [, a, b] = h.ids as [string, string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    const [d1, d2, d3] = doorsOf(h, a) as [DungeonDoor, DungeonDoor, DungeonDoor];
    const round = (doorA: DungeonDoor, okA: boolean) => {
      expectOk(go(h, a, doorA));
      expectOk(go(h, b, doorsOf(h, b)[0]!));
      expectOk(answer(h, a, okA));
      expectOk(answer(h, b, true));
      return viewOf(h, b);
    };
    round(d1, false);
    expect(r.players[a]).toMatchObject({ key: false, keyFound: false });
    expect(h.act(a, { type: 'dungeon_enter', key: true })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'dungeon_next' }));
    const v = round(d2, false);
    expect(v.results?.[a]).toMatchObject({ correct: false, foundKey: true });
    expect(v.players[a]).toMatchObject({ key: true, keyFound: true, wrong: 2 });
    // Spuren an der Tür sind öffentlich, ohne Antwort.
    expect(v.rooms[0]!.find((d) => d.id === d1.id)!.tries.filter((t) => t.playerId === a)).toEqual([{ playerId: a, correct: false }]);
    expectOk(h.act(h.host, { type: 'dungeon_next' }));

    // Ohne Schlüssel bleibt die verschlossene Tür zu, mit Schlüssel geht es hindurch, ganz ohne Frage.
    expectOk(h.act(a, { type: 'dungeon_walk', doorId: d1.id }));
    expect(h.act(a, { type: 'dungeon_enter' })).toMatchObject({ ok: false, message: 'Diese Tür ist für dich verschlossen' });
    expectOk(h.act(a, { type: 'dungeon_enter', key: true }));
    expect(viewOf(h, a).walk[a]).toEqual({ doorId: d1.id, confirmed: true, key: true });
    expectOk(go(h, b, doorsOf(h, b)[0]!));
    expect(r.stage).toBe('answering');
    expect(viewOf(h, a).myQuestion).toBeUndefined();
    expect(viewOf(h, a).myAnswer).toBe('Schlüssel');
    expect(answer(h, a, true)).toMatchObject({ ok: false });
    expectOk(answer(h, b, true));
    expect(r.results[a]).toMatchObject({ correct: true, key: true });
    expect(r.players[a]).toMatchObject({ room: 1, key: false, keyFound: true });
    expect(viewOf(h, a).rooms[0]!.find((d) => d.id === d1.id)!.tries.filter((t) => t.playerId === a)).toEqual([
      { playerId: a, correct: false },
      { playerId: a, correct: true, key: true },
    ]);
    expect(d3).toBeDefined();
    expect(isClientMsg({ type: 'dungeon_enter', key: 'ja' })).toBe(false);
  });

  test('mit Schlüssel scheidet man nicht aus, auch wenn alle Türen zu sind; nur Schlüssel heißt sofort Ergebnis', () => {
    const h = moderated(['A']);
    const [, a] = h.ids as [string, string];
    startDungeon(h, { rooms: 3, doors: 3 });
    const r = dr(h);
    for (const door of doorsOf(h, a)) {
      expectOk(go(h, a, door));
      expectOk(answer(h, a, false));
      expectOk(h.act(h.host, { type: 'dungeon_next' }));
    }
    expect(r.players[a]).toMatchObject({ status: 'in', key: true, wrong: 3 });
    expect(r.players[a]!.locked).toHaveLength(3);
    expectOk(h.act(a, { type: 'dungeon_walk', doorId: doorsOf(h, a)[2]!.id }));
    expectOk(h.act(a, { type: 'dungeon_enter', key: true }));
    expect(r.stage).toBe('result');
    expect(r.players[a]).toMatchObject({ room: 1, key: false, status: 'in' });
  });
});

describe('Dungeon: Lösungen in der Auswertung', () => {
  test('Karte mit Ortsnamen statt Koordinaten, a/b/c/d mit allen Antworten, Top X mit ganzer Liste', () => {
    const h = moderated(['A']);
    startDungeon(h, { rooms: 7, doors: 5 });
    expectOk(h.act(h.host, { type: 'end_round' }));
    const v = viewOf(h, null);
    const kinds = new Set<string>();
    for (const door of dr(h).rooms.flat()) {
      const sol = v.solutions![door.id]!;
      const p = door.payload;
      kinds.add(p.kind);
      expect(sol.prompt).not.toContain('(bis');
      expect(sol.prompt).not.toContain('Jahre)');
      if (p.kind === 'map') {
        expect(sol.solution).toBe(p.place.name);
        expect(sol.solution).not.toContain('°');
      }
      if (p.kind === 'choice') {
        expect(sol.choices).toEqual(p.choices);
        expect(sol.choices![sol.correct!]).toBe(p.question.answer);
      }
      if (p.kind === 'topx') {
        expect(sol.items).toEqual(p.items.map((it) => it.name));
        expect(sol.n).toBe(door.tolerance!);
        expect(sol.solution.split(', ')).toHaveLength(Math.min(door.tolerance!, p.items.length));
      }
    }
    expect(kinds.has('map')).toBe(true);
  });
});
