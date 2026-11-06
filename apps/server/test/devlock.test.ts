import { afterEach, describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import { devLockClock, devLockDue } from '../src/rooms/devlock.ts';
import { expectOk, makeHarness, type Harness } from './fixtures.ts';

const realClock = { ...devLockClock };
afterEach(() => Object.assign(devLockClock, realClock));

function setClock(date: string, uptimeMinutes: number) {
  devLockClock.now = () => new Date(date);
  devLockClock.uptimeSeconds = () => uptimeMinutes * 60;
}

/** Spielt eine Sortieren-Runde bis zur Punktetabelle. */
function playRound(h: Harness, first = false) {
  if (first) expectOk(h.act(h.host, { type: 'start_game' }));
  else expectOk(h.act(h.host, { type: 'next_round' }));
  expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' }));
  expectOk(h.act(h.host, { type: 'end_round' }));
  if (h.room.phase === 'reveal') expectOk(h.act(h.host, { type: 'to_scoring' }));
  expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
}

describe('Entwickler-Sperre', () => {
  test('Bedingungen: nur am 7.11., ab 20 Minuten, 2 Runden, 3 Spielern', () => {
    const base = { now: new Date('2026-11-07T20:00:00'), uptimeSeconds: 1200, roundsPlayed: 2, players: 3 };
    expect(devLockDue(base, false)).toBe(true);
    expect(devLockDue({ ...base, now: new Date('2026-11-08T20:00:00') }, false)).toBe(false);
    expect(devLockDue({ ...base, uptimeSeconds: 1199 }, false)).toBe(false);
    expect(devLockDue({ ...base, roundsPlayed: 1 }, false)).toBe(false);
    expect(devLockDue({ ...base, players: 2 }, false)).toBe(false);
    expect(devLockDue({ ...base, now: new Date('2026-11-08T20:00:00'), uptimeSeconds: 5 }, true)).toBe(true);
    expect(devLockDue({ ...base, roundsPlayed: 1, players: 2 }, true)).toBe(true);
    expect(devLockDue({ ...base, players: 1 }, true)).toBe(false);
    expect(devLockDue({ ...base, roundsPlayed: 0 }, true)).toBe(false);
  });

  test('erscheint nach dem Punkte-Eintragen der 2. Runde, einmal pro Raum, nur der Host löst auf', () => {
    setClock('2026-11-07T21:00:00', 30);
    const h = makeHarness(['Host', 'B', 'C']);
    playRound(h, true);
    expect(toView(h.room, null).devLock).toBeUndefined();
    playRound(h);
    expect(h.room.phase).toBe('scoreboard');
    expect(toView(h.room, h.ids[1]!).devLock).toMatchObject({ declines: 0, paid: false });
    expect(toView(h.room, null).devLock).toMatchObject({ declines: 0, paid: false });

    expect(h.act(h.ids[1]!, { type: 'devlock_decline' })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'devlock_close' })).toMatchObject({ ok: false });
    for (let i = 0; i < 5; i++) expectOk(h.act(h.host, { type: 'devlock_decline' }));
    expect(h.act(h.host, { type: 'devlock_decline' })).toMatchObject({ ok: false });
    expect(h.act(h.host, { type: 'devlock_pay' })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'devlock_close' }));
    expect(toView(h.room, null).devLock).toBeUndefined();

    playRound(h);
    expect(toView(h.room, null).devLock).toBeUndefined();
  });

  test('„Bezahlen“ löst sofort auf, an anderen Tagen passiert nichts', () => {
    setClock('2026-11-07T21:00:00', 30);
    const h = makeHarness(['Host', 'B', 'C']);
    playRound(h, true);
    playRound(h);
    expectOk(h.act(h.host, { type: 'devlock_pay' }));
    expect(toView(h.room, null).devLock).toMatchObject({ declines: 0, paid: true });
    expectOk(h.act(h.host, { type: 'devlock_close' }));

    setClock('2026-11-08T21:00:00', 30);
    const other = makeHarness(['Host', 'B', 'C']);
    playRound(other, true);
    playRound(other);
    expect(toView(other.room, null).devLock).toBeUndefined();
  });
});
