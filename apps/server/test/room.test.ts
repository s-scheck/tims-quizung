import { describe, expect, test } from 'bun:test';
import { MAX_PLAYERS, Room } from '../src/rooms/room.ts';
import { RoomRegistry } from '../src/rooms/registry.ts';
import { FakeScheduler } from '../src/rooms/scheduler.ts';
import { toView } from '../src/rooms/view.ts';
import { makeHarness, provider, seeded } from './fixtures.ts';

function fresh() {
  const scheduler = new FakeScheduler();
  return { scheduler, room: new Room('ABCD', { scheduler, categories: provider, random: seeded() }) };
}

describe('Lobby: Beitritt', () => {
  test('erster Spieler wird Host, Namen sind eindeutig', () => {
    const { room } = fresh();
    const a = room.join('Tim', undefined);
    const b = room.join('anna', undefined);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(room.hostId).toBe(a.player.id);
    expect(room.join(' TIM ', undefined)).toMatchObject({ ok: false, code: 'name_taken' });
    expect(room.join('   ', undefined)).toMatchObject({ ok: false, code: 'name_invalid' });
    expect(room.scores[b.player.id]).toBe(0);
  });

  test('Reconnect per Token, unbekanntes Token braucht einen Namen', () => {
    const { room } = fresh();
    const a = room.join('Tim', undefined);
    if (!a.ok) throw new Error();
    room.setConnected(a.player.id, false);
    const again = room.join(undefined, a.player.token);
    expect(again).toMatchObject({ ok: true, reconnected: true });
    expect(room.getPlayer(a.player.id)?.connected).toBe(true);
    expect(room.join(undefined, 'kaputt')).toMatchObject({ ok: false, code: 'token_invalid' });
    const fallback = room.join('Neu', 'kaputt');
    expect(fallback).toMatchObject({ ok: true, reconnected: false });
    expect(room.players.length).toBe(2);
  });

  test('Raum ist voll', () => {
    const { room } = fresh();
    for (let i = 0; i < MAX_PLAYERS; i++) expect(room.join(`P${i}`, undefined).ok).toBe(true);
    expect(room.join('Zuviel', undefined)).toMatchObject({ ok: false, code: 'room_full' });
  });
});

describe('Lobby: Verlassen, Host, Kick, Einstellungen', () => {
  test('Host-Rolle wandert zum ersten verbundenen Spieler', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b, c] = h.ids as [string, string, string];
    h.room.setConnected(b, false);
    expect(h.room.leave(a).ok).toBe(true);
    expect(h.room.hostId).toBe(c);
    expect(h.room.players.map((p) => p.id)).toEqual([b, c]);
    expect(h.room.scores[a]).toBeUndefined();
  });

  test('nachrückender Host spielt immer mit', () => {
    const h = makeHarness(['A', 'B']);
    expect(h.room.setSettings(h.host, { hostPlays: false }).ok).toBe(true);
    expect(h.room.leave(h.host).ok).toBe(true);
    expect(h.room.hostId).toBe(h.ids[1]!);
    expect(h.room.settings.hostPlays).toBe(true);
  });

  test('ensureHost besetzt eine leere Host-Rolle', () => {
    const h = makeHarness(['A', 'B']);
    h.room.hostId = null;
    h.room.ensureHost();
    expect(h.room.hostId).toBe(h.ids[0]!);
  });

  test('kick nur durch Host und nicht sich selbst', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    expect(h.room.kick(b, a)).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.room.kick(a, a)).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.room.kick(a, b).ok).toBe(true);
    expect(h.room.players.length).toBe(1);
  });

  test('Einstellungen nur vom Host, nur in Lobby oder Kategoriewahl', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    expect(h.room.setSettings(b, { timerSeconds: 30 })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.room.setSettings(a, { timerSeconds: 45 })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.room.setSettings(a, { timerSeconds: 30 }).ok).toBe(true);
    expect(h.room.settings).toEqual({ timerSeconds: 30, hostPlays: true });
    expect(h.room.setSettings(a, { hostPlays: false }).ok).toBe(true);
    expect(h.room.settings).toEqual({ timerSeconds: 30, hostPlays: false });
    h.act(a, { type: 'start_game' });
    expect(h.room.setSettings(a, { timerSeconds: 60 }).ok).toBe(true);
    h.act(a, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' });
    expect(h.room.setSettings(a, { timerSeconds: 0 })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('start_game setzt Scores zurück, Kategorie muss zum Spiel passen', () => {
    const h = makeHarness(['A', 'B']);
    h.room.scores[h.ids[0]!] = 7;
    expect(h.act(h.ids[1]!, { type: 'start_game' })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'start_game' }).ok).toBe(true);
    expect(h.room.phase).toBe('choosing_category');
    expect(h.room.scores[h.ids[0]!]).toBe(0);
    expect(h.emits.length).toBe(1);
    expect(h.room.chooseCategory(h.host, 'nope', 'cities')).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'topx', categoryId: 'cities' })).toMatchObject({ ok: false, code: 'unknown_category' });
    expect(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'players' })).toMatchObject({ ok: false, code: 'unknown_category' });
    expect(h.room.phase).toBe('choosing_category');
  });
});

describe('View', () => {
  test('enthält keine Tokens und listet Spieler nach Reihenfolge', () => {
    const h = makeHarness(['B', 'A']);
    const view = toView(h.room, null);
    expect(JSON.stringify(view)).not.toContain('token');
    expect(view.players.map((p) => p.name)).toEqual(['B', 'A']);
    expect(view.round).toBeNull();
    expect(view.categories).toBeUndefined();
  });

  test('Kategorienliste nur bei der Kategoriewahl, mit gespielt-Markierung', () => {
    const h = makeHarness(['A']);
    h.act(h.host, { type: 'start_game' });
    let view = toView(h.room, null);
    expect(view.categories?.map((c) => [c.id, c.played, c.count, c.games])).toEqual([
      ['cities', false, 10, ['sort']],
      ['times', false, 12, ['sort']],
      ['players', false, 5, ['topx']],
    ]);
    expect(view.games?.map((g) => g.id)).toEqual(['sort', 'topx']);
    h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'times' });
    view = toView(h.room, null);
    expect(view.categories).toBeUndefined();
    expect(view.games).toBeUndefined();
    expect(h.room.playedCategoryIds).toEqual(['times']);
  });
});

describe('Registry', () => {
  test('erzeugt eindeutige Codes, entfernt und räumt auf', () => {
    const scheduler = new FakeScheduler();
    const closed: string[] = [];
    const reg = new RoomRegistry({
      scheduler,
      categories: provider,
      random: seeded(1),
      ttlMs: 1000,
      maxRooms: 3,
      onRoomClosed: (r) => closed.push(r.code),
    });
    const a = reg.create()!;
    const b = reg.create()!;
    const c = reg.create()!;
    expect(new Set([a.code, b.code, c.code]).size).toBe(3);
    expect(reg.create()).toBeNull();
    expect(reg.remove(a.code)).toBe(true);
    expect(closed).toEqual([a.code]);
    expect(reg.get(a.code)).toBeUndefined();

    scheduler.advance(600);
    b.touch();
    scheduler.advance(500);
    expect(reg.sweep()).toEqual([c.code]);
    expect(reg.size).toBe(1);
  });
});
