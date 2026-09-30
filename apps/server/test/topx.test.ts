import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { TopXRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startTopX, type Harness } from './fixtures.ts';

function tr(h: Harness): TopXRound {
  const round = h.room.round;
  if (round?.game !== 'topx') throw new Error('keine Top-X-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'topx') throw new Error('keine Top-X-Runde in der Sicht');
  return round;
}

/** Aktiver Spieler tippt, im Automatik-Modus läuft die Auflösung komplett durch. */
function guessAndResolve(h: Harness, text: string): void {
  const r = tr(h);
  expectOk(h.act(r.activePlayerId!, { type: 'guess', turnNo: r.turnNo, text }));
  h.scheduler.advance(1500);
  h.scheduler.advance(1500);
}

describe('Top X: Rundenstart', () => {
  test('Slots verdeckt, Leben verteilt, Vorgabe gemerkt', () => {
    const h = makeHarness(['A', 'B']);
    startTopX(h, 4);
    const r = tr(h);
    expect(h.room.phase).toBe('playing');
    expect(h.room.gameId).toBe('topx');
    expect(r.cards.map((c) => [c.rank, c.name])).toEqual([
      [1, 'Erling Haaland'],
      [2, 'Kylian Mbappé'],
      [3, 'Gerd Müller'],
      [4, 'Thomas Müller'],
      [5, 'Pedri'],
    ]);
    expect(r.lives).toEqual({ [h.ids[0]!]: 4, [h.ids[1]!]: 4 });
    expect(r.maxLives).toBe(4);
    expect(h.room.topxLives).toBe(4);
    expect(r.turnOrder).toEqual(h.ids);
    expect(r.guess).toBeNull();

    const pub = viewRound(h, null);
    expect(pub.slots.every((s) => !s.revealed && s.name === undefined && s.value === undefined)).toBe(true);
    expect(pub.privileged).toBeUndefined();
    expect(pub.hostJudges).toBe(false);
    expect(JSON.stringify(pub)).not.toContain('Haaland');
  });

  test('Standard sind 3 Leben, ohne Angabe gilt der letzte Wert', () => {
    const h = makeHarness(['A']);
    startTopX(h);
    expect(tr(h).maxLives).toBe(3);
    for (let i = 0; i < 3; i++) guessAndResolve(h, 'Unsinn');
    expect(h.room.phase).toBe('reveal');
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
    expectOk(h.act(h.host, { type: 'next_round' }));
    h.room.topxLives = 2;
    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'topx', categoryId: 'players' }));
    expect(tr(h).maxLives).toBe(2);
    expect(tr(h).lives[h.host]).toBe(2);
  });

  test('moderierender Host spielt nicht mit und sieht alle Karten', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
    startTopX(h);
    const r = tr(h);
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.lives[h.host]).toBeUndefined();
    const hostView = viewRound(h, h.host);
    expect(hostView.privileged).toBe(true);
    expect(hostView.hostJudges).toBe(true);
    expect(hostView.slots.map((s) => s.name)).toEqual(['Erling Haaland', 'Kylian Mbappé', 'Gerd Müller', 'Thomas Müller', 'Pedri']);
    expect(hostView.slots.every((s) => !s.revealed && typeof s.value === 'number')).toBe(true);
    const playerView = viewRound(h, h.ids[1]!);
    expect(playerView.privileged).toBeUndefined();
    expect(JSON.stringify(playerView)).not.toContain('Pedri');
    expect(JSON.stringify(viewRound(h, null))).not.toContain('Pedri');
  });
});

describe('Top X: Automatik (Host spielt mit)', () => {
  test('richtiger Tipp: pending, dann Karte offen, dann Zugwechsel', () => {
    const h = makeHarness(['A', 'B']);
    startTopX(h);
    const r = tr(h);
    const [a, b] = h.ids as [string, string];
    expectOk(h.act(a, { type: 'guess', turnNo: 1, text: '  haaland ' }));
    expect(r.guess).toMatchObject({ by: a, text: 'haaland', status: 'pending', matchRank: 1 });
    expect(r.guess!.resolveAt).toBe(h.scheduler.now() + 1500);
    expect(r.turnDeadline).toBeNull();
    // Vorschlag bleibt vor der Auflösung geheim.
    expect(viewRound(h, null).guess?.matchRank).toBeNull();
    expect(viewRound(h, a).guess?.matchRank).toBeNull();
    expect(h.act(a, { type: 'guess', turnNo: 1, text: 'Pedri' })).toMatchObject({ ok: false, code: 'invalid_action' });

    h.scheduler.advance(1500);
    expect(r.guess?.status).toBe('correct');
    expect(r.revealed).toEqual({ 1: a });
    expect(r.hits[a]).toBe(1);
    const pub = viewRound(h, null);
    expect(pub.slots[0]).toEqual({ rank: 1, revealed: true, name: 'Erling Haaland', value: 100, revealedBy: a });
    expect(pub.slots[1]).toEqual({ rank: 2, revealed: false });
    expect(pub.guess?.matchRank).toBe(1);

    h.scheduler.advance(1500);
    expect(r.guess).toBeNull();
    expect(r.activePlayerId).toBe(b);
    expect(r.turnNo).toBe(2);
    expect(r.lives[a]).toBe(3);
  });

  test('falscher Tipp kostet ein Leben und landet in der Fehltipp-Liste', () => {
    const h = makeHarness(['A', 'B']);
    startTopX(h);
    const r = tr(h);
    guessAndResolve(h, 'Neymar');
    expect(r.lives[h.ids[0]!]).toBe(2);
    expect(r.wrongGuesses).toEqual([{ by: h.ids[0]!, text: 'Neymar' }]);
    expect(r.revealed).toEqual({});
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(h.room.phase).toBe('playing');
  });

  test('Tipp auf schon aufgedeckte Karte kostet ein Leben', () => {
    const h = makeHarness(['A', 'B']);
    startTopX(h);
    const r = tr(h);
    guessAndResolve(h, 'Haaland');
    guessAndResolve(h, 'Erling Haaland');
    expect(r.lives[h.ids[1]!]).toBe(2);
    expect(r.wrongGuesses).toEqual([{ by: h.ids[1]!, text: 'Erling Haaland' }]);
  });

  test('mehrdeutiger Nachname ist falsch, voller Name trifft', () => {
    const h = makeHarness(['A']);
    startTopX(h, 5);
    const r = tr(h);
    guessAndResolve(h, 'Müller');
    expect(r.lives[h.host]).toBe(4);
    guessAndResolve(h, 'Thomas Mueller');
    expect(r.revealed).toEqual({ 4: h.host });
  });

  test('ohne Leben raus, bei einem Übrigen entscheidet der Host', () => {
    const h = makeHarness(['A', 'B'], { seed: 7 });
    startTopX(h, 1);
    const r = tr(h);
    guessAndResolve(h, 'Unsinn');
    expect(r.eliminated).toEqual([h.ids[0]!]);
    expect(h.room.phase).toBe('host_decision');
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expectOk(h.act(h.host, { type: 'host_decision', continue: true }));
    expect(h.room.phase).toBe('playing');
    expect(r.soloMode).toBe(true);
    guessAndResolve(h, 'Pedri');
    expect(h.room.phase).toBe('playing');
    guessAndResolve(h, 'Quatsch');
    expect(h.room.phase).toBe('reveal');
    const pub = viewRound(h, null);
    expect(pub.slots.every((s) => typeof s.name === 'string' && typeof s.value === 'number')).toBe(true);
    expect(pub.slots[4]).toMatchObject({ rank: 5, revealed: true, name: 'Pedri', revealedBy: h.ids[1]! });
    expect(pub.slots[0]).toMatchObject({ rank: 1, revealed: false, name: 'Erling Haaland' });
  });

  test('alle Karten aufgedeckt beendet die Runde', () => {
    const h = makeHarness(['A']);
    startTopX(h, 5);
    for (const name of ['Haaland', 'Mbappe', 'Gerd Müller', 'Thomas Müller']) guessAndResolve(h, name);
    expect(h.room.phase).toBe('playing');
    guessAndResolve(h, 'pedri');
    expect(h.room.phase).toBe('reveal');
    expect(Object.keys(tr(h).revealed).length).toBe(5);
    expect(tr(h).hits[h.host]).toBe(5);
  });

  test('Timer-Ablauf und Überspringen kosten ein Leben, Timer pausiert während der Auflösung', () => {
    const h = makeHarness(['A', 'B', 'C'], { timer: 30 });
    startTopX(h);
    const r = tr(h);
    expect(r.turnDeadline).toBe(h.scheduler.now() + 30_000);
    h.scheduler.advance(30_000);
    expect(r.lives[h.ids[0]!]).toBe(2);
    expect(r.activePlayerId).toBe(h.ids[1]!);
    expect(r.wrongGuesses).toEqual([]);

    expectOk(h.act(h.host, { type: 'skip_turn', turnNo: r.turnNo }));
    expect(r.lives[h.ids[1]!]).toBe(2);
    expect(r.activePlayerId).toBe(h.ids[2]!);

    h.scheduler.advance(29_000);
    expectOk(h.act(h.ids[2]!, { type: 'guess', turnNo: r.turnNo, text: 'Haaland' }));
    expect(r.turnDeadline).toBeNull();
    h.scheduler.advance(3000);
    expect(r.lives[h.ids[2]!]).toBe(3);
    expect(r.activePlayerId).toBe(h.ids[0]!);
    expect(r.turnDeadline).toBe(h.scheduler.now() + 30_000);
  });

  test('Tipp-Prüfungen: Reihenfolge, Zugnummer, Länge', () => {
    const h = makeHarness(['A', 'B']);
    startTopX(h);
    expect(h.act(h.ids[1]!, { type: 'guess', turnNo: 1, text: 'x' })).toMatchObject({ ok: false, code: 'not_your_turn' });
    expect(h.act(h.ids[0]!, { type: 'guess', turnNo: 2, text: 'x' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.ids[0]!, { type: 'guess', turnNo: 1, text: '   ' })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(h.ids[0]!, { type: 'guess', turnNo: 1, text: 'x'.repeat(61) })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(h.ids[0]!, { type: 'judge', turnNo: 1, correct: false })).toMatchObject({ ok: false, code: 'invalid_action' });
  });
});

describe('Top X: Host prüft', () => {
  function judgeHarness() {
    const h = makeHarness(['Host', 'B', 'C']);
    expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false, timerSeconds: 30 }));
    startTopX(h);
    return h;
  }

  test('Tipp wartet auf den Host, nur er sieht den Vorschlag', () => {
    const h = judgeHarness();
    const r = tr(h);
    const b = h.ids[1]!;
    expectOk(h.act(b, { type: 'guess', turnNo: 1, text: 'mbappe' }));
    expect(r.guess).toMatchObject({ by: b, status: 'judging', matchRank: 2, resolveAt: null });
    expect(r.turnDeadline).toBeNull();
    expect(viewRound(h, h.host).guess?.matchRank).toBe(2);
    expect(viewRound(h, b).guess?.matchRank).toBeNull();
    expect(viewRound(h, null).guess).toMatchObject({ by: b, text: 'mbappe', status: 'judging' });
    h.scheduler.advance(60_000);
    expect(r.guess?.status).toBe('judging');
    expect(r.lives[b]).toBe(3);

    expect(h.act(b, { type: 'judge', turnNo: 1, correct: true, rank: 2 })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'judge', turnNo: 1, correct: true })).toMatchObject({ ok: false, code: 'bad_message' });
    expect(h.act(h.host, { type: 'judge', turnNo: 1, correct: true, rank: 9 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'judge', turnNo: 2, correct: true, rank: 2 })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(h.host, { type: 'judge', turnNo: 1, correct: true, rank: 2 }));
    expect(r.guess?.status).toBe('correct');
    expect(r.revealed).toEqual({ 2: b });
    expect(r.hits[b]).toBe(1);
    h.scheduler.advance(1500);
    expect(r.guess).toBeNull();
    expect(r.activePlayerId).toBe(h.ids[2]!);
    expect(r.turnDeadline).toBe(h.scheduler.now() + 30_000);
  });

  test('Host kann eine andere Karte zuordnen oder ablehnen', () => {
    const h = judgeHarness();
    const r = tr(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'guess', turnNo: 1, text: 'der Norweger' }));
    expect(r.guess?.matchRank).toBeNull();
    expectOk(h.act(h.host, { type: 'judge', turnNo: 1, correct: true, rank: 1 }));
    expect(r.revealed).toEqual({ 1: b });
    h.scheduler.advance(1500);

    expectOk(h.act(c, { type: 'guess', turnNo: r.turnNo, text: 'Haaland' }));
    expect(r.guess?.matchRank).toBeNull();
    expect(h.act(h.host, { type: 'judge', turnNo: r.turnNo, correct: true, rank: 1 })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'judge', turnNo: r.turnNo, correct: false }));
    expect(r.lives[c]).toBe(2);
    expect(r.wrongGuesses).toEqual([{ by: c, text: 'Haaland' }]);
    h.scheduler.advance(1500);
    expect(r.activePlayerId).toBe(b);
  });

  test('Host verlässt den Raum während der Prüfung: neuer Host spielt mit, Tipp wird automatisch entschieden', () => {
    const h = judgeHarness();
    const r = tr(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'guess', turnNo: 1, text: 'Pedri' }));
    expectOk(h.room.leave(h.host));
    expect(h.room.hostId).toBe(b);
    expect(h.room.settings.hostPlays).toBe(true);
    expect(r.guess?.status).toBe('correct');
    expect(r.revealed).toEqual({ 5: b });
    h.scheduler.advance(1500);
    expect(r.guess).toBeNull();
    expect(r.activePlayerId).toBe(c);
    expect(viewRound(h, b).privileged).toBeUndefined();
    expect(viewRound(h, b).hostJudges).toBe(false);
  });

  test('Spieler verlässt den Raum während sein Tipp geprüft wird', () => {
    const h = judgeHarness();
    const r = tr(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'guess', turnNo: 1, text: 'Pedri' }));
    expectOk(h.room.leave(b));
    expect(r.turnOrder).toEqual([c]);
    expectOk(h.act(h.host, { type: 'judge', turnNo: 1, correct: true, rank: 5 }));
    expect(r.revealed).toEqual({ 5: b });
    h.scheduler.advance(1500);
    // Nur noch einer übrig: wie überall entscheidet der Host.
    expect(h.room.phase).toBe('host_decision');
    expect(r.activePlayerId).toBe(c);
    expectOk(h.act(h.host, { type: 'host_decision', continue: true }));
    expect(h.room.phase).toBe('playing');
    expect(r.soloMode).toBe(true);
  });
});

describe('Spielwahl pro Runde', () => {
  test('Sortieren und Top X in einer Session, Punkte laufen durch', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startTopX(h, 1);
    guessAndResolve(h, 'Unsinn');
    expectOk(h.act(h.host, { type: 'host_decision', continue: false }));
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [b]: 2 } }));
    expect(h.room.rounds[0]).toMatchObject({ gameId: 'topx', categoryId: 'players', survivors: [b], eliminatedOrder: [a] });
    expectOk(h.act(h.host, { type: 'next_round' }));
    const view = toView(h.room, null);
    expect(view.categories?.find((c) => c.id === 'players')?.played).toBe(true);
    expect(view.categories?.find((c) => c.id === 'cities')?.played).toBe(false);

    expectOk(h.act(h.host, { type: 'choose_category', gameId: 'sort', categoryId: 'cities' }));
    expect(h.room.round?.game).toBe('sort');
    expect(h.room.gameId).toBe('sort');
    expect(h.room.round?.turnOrder[0]).toBe(b);
    expect(toView(h.room, null).round?.game).toBe('sort');
    expect(h.act(a, { type: 'guess', turnNo: 1, text: 'x' })).toMatchObject({ ok: false });
  });
});
