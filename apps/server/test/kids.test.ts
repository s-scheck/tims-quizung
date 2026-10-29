import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { KidsItem, KidsRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startKids, type Harness } from './fixtures.ts';

function kr(h: Harness): KidsRound {
  const round = h.room.round;
  if (round?.game !== 'kids') throw new Error('keine Kinderpromis-Runde');
  return round;
}

function cur(h: Harness): KidsItem {
  const item = kr(h).items[kr(h).index];
  if (!item) throw new Error('kein aktueller Promi');
  return item;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'kids') throw new Error('keine Kinderpromis-Runde in der Sicht');
  return round;
}

/** Spielt die laufende Runde bis zur nächsten Kategoriewahl durch. */
function finishRound(h: Harness): void {
  expectOk(h.act(h.host, { type: 'end_round' }));
  expectOk(h.act(h.host, { type: 'to_scoring' }));
  expectOk(h.act(h.host, { type: 'submit_scores', scores: {} }));
  expectOk(h.act(h.host, { type: 'next_round' }));
}

describe('Kinderpromis: Rundenstart', () => {
  test('Host rät nie mit, Promis sind verdeckt, der Host sieht Foto und Name vorab', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startKids(h, { count: 2 });
    const r = kr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.turnOrder).toEqual([h.ids[1]!, h.ids[2]!]);
    expect(r.activePlayerId).toBeNull();
    expect(r.turnDeadline).toBeNull();
    expect(r.items).toHaveLength(2);
    expect(r).toMatchObject({ index: 0, mode: 'type', thinkSeconds: 10, penalty: 'none' });
    expect(cur(h).stage).toBe('hidden');

    const player = viewRound(h, h.ids[1]!);
    expect(player).toMatchObject({ stage: 'hidden', total: 2, index: 0, history: [] });
    expect(player.image).toBeUndefined();
    expect(player.name).toBeUndefined();
    const host = viewRound(h, h.host);
    expect(host.image).toBe(`/images/${cur(h).face.image}`.replace('/images/https://', 'https://'));
    expect(host.name).toBe(cur(h).face.name);
    expect(host.privileged).toBe(true);

    // Erst „Zeigen“ macht das Foto öffentlich und merkt die Person als gespielt.
    expect(h.room.playedTargets['kind-stars']).toBeUndefined();
    expect(h.act(h.ids[1]!, { type: 'kids_show' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expect(cur(h)).toMatchObject({ stage: 'open', shownAt: h.room.now });
    expect(h.room.playedTargets['kind-stars']).toEqual([cur(h).face.id]);
    expect(viewRound(h, h.ids[1]!).image).toBeDefined();
    expect(viewRound(h, null).image).toBeDefined();
    expect(viewRound(h, h.ids[1]!).name).toBeUndefined();
    expect(h.act(h.host, { type: 'kids_show' })).toMatchObject({ ok: false, code: 'invalid_action' });
  });

  test('Anzahl wird an der Sammlung geklammert, Standard sind fünf', () => {
    const big = makeHarness(['Host', 'B']);
    startKids(big, { count: 99 });
    expect(kr(big).items).toHaveLength(3);
    const def = makeHarness(['Host', 'B']);
    startKids(def);
    expect(kr(def).items).toHaveLength(3);
  });

  test('noch nicht gezeigte Personen kommen zuerst, ohne Mitspieler oder mit fremder Sammlung geht es nicht los', () => {
    const h = makeHarness(['Host', 'B']);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (i === 0) startKids(h, { count: 1 });
      else expectOk(h.act(h.host, { type: 'choose_category', gameId: 'kids', categoryId: 'kind-stars', count: 1 }));
      expectOk(h.act(h.host, { type: 'kids_show' }));
      seen.push(cur(h).face.id);
      finishRound(h);
    }
    expect(new Set(seen).size).toBe(3);

    const alone = makeHarness(['Allein']);
    expectOk(alone.act(alone.host, { type: 'start_game' }));
    expect(alone.act(alone.host, { type: 'choose_category', gameId: 'kids', categoryId: 'kind-stars' })).toMatchObject({ ok: false, code: 'invalid_action' });
    const wrong = makeHarness(['Host', 'B']);
    expectOk(wrong.act(wrong.host, { type: 'start_game' }));
    expect(wrong.act(wrong.host, { type: 'choose_category', gameId: 'kids', categoryId: 'promi-politik' })).toMatchObject({ ok: false, code: 'unknown_category' });
    expect(wrong.act(wrong.host, { type: 'choose_category', gameId: 'faces', categoryId: 'kind-stars' })).toMatchObject({ ok: false, code: 'unknown_category' });
  });
});

describe('Kinderpromis: Tippen', () => {
  test('Treffer zählen sofort mit Zeit, Fehltipps prüft nur der Host, fremde Tipps bleiben unsichtbar', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startKids(h, { count: 2 });
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(b, { type: 'kids_guess', text: 'Egal' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'kids_show' }));
    const face = cur(h).face;

    h.scheduler.advance(1200);
    expectOk(h.act(b, { type: 'kids_guess', text: (face.aliases?.[0] ?? face.name).toUpperCase() }));
    expect(cur(h).attempts[b]).toEqual([{ text: (face.aliases?.[0] ?? face.name).toUpperCase(), at: h.room.now, status: 'correct' }]);
    expect(cur(h).solved[b]).toBe(h.room.now);
    expect(viewRound(h, b).solved).toEqual([{ playerId: b, at: h.room.now, rank: 1 }]);
    expect(viewRound(h, b).myAttempts).toEqual([{ text: (face.aliases?.[0] ?? face.name).toUpperCase(), at: h.room.now, status: 'correct' }]);
    expect(h.act(b, { type: 'kids_guess', text: 'Nochmal' })).toMatchObject({ ok: false, code: 'invalid_action' });

    h.scheduler.advance(800);
    expectOk(h.act(c, { type: 'kids_guess', text: 'Irgendwer Anderes' }));
    expect(cur(h).attempts[c]?.[0]?.status).toBe('judging');
    expect(cur(h).stage).toBe('open');
    // Fremde Tipps: B und der Screen sehen nichts von C, der Host alles mit Vorschlag.
    expect(viewRound(h, b).attempts).toBeUndefined();
    expect(viewRound(h, null).attempts).toBeUndefined();
    expect(viewRound(h, null).myAttempts).toBeUndefined();
    expect(viewRound(h, c).myAttempts?.[0]).toMatchObject({ text: 'Irgendwer Anderes', status: 'judging' });
    const host = viewRound(h, h.host);
    expect(host.attempts?.[b]?.[0]).toMatchObject({ status: 'correct', suggested: true });
    expect(host.attempts?.[c]?.[0]).toMatchObject({ status: 'judging', suggested: false });
    expect(viewRound(h, b).name).toBeUndefined();
    expect(host.name).toBe(face.name);

    // Das Urteil des Hosts zählt mit der Eingangszeit des Tipps; sind alle richtig, ist der Promi durch.
    const at = cur(h).attempts[c]![0]!.at;
    h.scheduler.advance(5000);
    expect(h.act(c, { type: 'kids_judge', playerId: c, index: 0, correct: true })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'kids_judge', playerId: c, index: 3, correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'kids_judge', playerId: c, index: 0, correct: true }));
    expect(cur(h).solved[c]).toBe(at);
    expect(cur(h).stage).toBe('solved');
    expect(h.act(h.host, { type: 'kids_judge', playerId: c, index: 0, correct: false })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(viewRound(h, b).name).toBe(face.name);
    expect(viewRound(h, b).solved.map((s) => [s.playerId, s.rank])).toEqual([
      [b, 1],
      [c, 2],
    ]);
    expect(viewRound(h, b).points).toEqual({ [b]: 3, [c]: 2 });

    // Weiter zum zweiten Promi, danach die Auflösung mit Galerie und Punkten.
    expect(h.act(h.host, { type: 'kids_next' })).toMatchObject({ ok: true });
    expect(kr(h).index).toBe(1);
    expect(cur(h).stage).toBe('hidden');
    expect(viewRound(h, b).history.map((i) => i.name)).toEqual([face.name]);
    expect(h.act(h.host, { type: 'kids_next' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(c, { type: 'kids_guess', text: cur(h).face.name }));
    expect(cur(h).stage).toBe('open');
    expectOk(h.act(h.host, { type: 'kids_resolve' }));
    expect(cur(h).stage).toBe('solved');
    expect(h.act(b, { type: 'kids_guess', text: cur(h).face.name })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'kids_next' }));
    expect(h.room.phase).toBe('reveal');
    const reveal = viewRound(h, b);
    expect(reveal.history).toHaveLength(2);
    expect(reveal.history[1]?.winners.map((w) => w.playerId)).toEqual([c]);
    expect(reveal).toMatchObject({ points: { [b]: 3, [c]: 5 }, hits: { [b]: 1, [c]: 2 }, misses: { [b]: 0, [c]: 0 } });
    expect(reveal.name).toBeDefined();
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    expect(h.room.phase).toBe('scoring');
  });

  test('Runde beenden lässt verdeckte Promis weg, auch ganz ohne gezeigten Promi', () => {
    const h = makeHarness(['Host', 'B']);
    startKids(h, { count: 3 });
    const b = h.ids[1]!;
    expect(h.act(h.host, { type: 'kids_resolve' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(h.host, { type: 'kids_resolve' }));
    expectOk(h.act(h.host, { type: 'kids_next' }));
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(b, { type: 'kids_guess', text: 'Hm' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    expect(h.room.phase).toBe('reveal');
    expect(kr(h).items).toHaveLength(2);
    expect(kr(h).index).toBe(1);
    expect(cur(h).stage).toBe('solved');
    expect(viewRound(h, b).history).toHaveLength(2);
    expect(viewRound(h, b).total).toBe(2);

    const empty = makeHarness(['Host', 'B']);
    startKids(empty, { count: 2 });
    expectOk(empty.act(empty.host, { type: 'end_round' }));
    expect(empty.room.phase).toBe('reveal');
    expect(kr(empty).items).toHaveLength(0);
    const v = viewRound(empty, empty.ids[1]!);
    expect(v).toMatchObject({ stage: 'solved', total: 0, history: [] });
    expect(v.image).toBeUndefined();
    expectOk(empty.act(empty.host, { type: 'to_scoring' }));
  });

  test('verlässt ein Spieler den Raum, zählen nur die Verbliebenen; der neue Host fliegt aus der Runde', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startKids(h, { count: 1 });
    const [a, b, c] = h.ids as [string, string, string];
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(b, { type: 'kids_guess', text: cur(h).face.name }));
    expectOk(h.act(c, { type: 'kids_guess', text: 'Daneben' }));
    expect(h.room.leave(a).ok).toBe(true);
    expect(h.room.hostId).toBe(b);
    expect(kr(h).turnOrder).toEqual([c]);
    expect(cur(h).solved[b]).toBeUndefined();
    expect(cur(h).stage).toBe('open');
    expect(viewRound(h, b).points).toEqual({ [c]: 0 });
    expect(h.room.leave(c).ok).toBe(true);
    expect(h.room.phase).toBe('reveal');

    const g = makeHarness(['Host', 'B', 'C']);
    startKids(g, { count: 1 });
    expectOk(g.act(g.host, { type: 'kids_show' }));
    expectOk(g.act(g.ids[1]!, { type: 'kids_guess', text: cur(g).face.name }));
    expect(g.room.leave(g.ids[2]!).ok).toBe(true);
    expect(cur(g).stage).toBe('solved');
  });
});

describe('Kinderpromis: Buzzern', () => {
  test('nur einer hält den Buzzer, die Bedenkzeit läuft ab, Richtig löst auf, ein Versuch je Promi', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startKids(h, { mode: 'buzz', thinkSeconds: 5, count: 2 });
    const [, b, c] = h.ids as [string, string, string];
    expect(kr(h)).toMatchObject({ mode: 'buzz', thinkSeconds: 5 });
    expect(h.act(b, { type: 'kids_buzz' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expect(h.act(h.host, { type: 'kids_buzz' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'kids_guess', text: 'Tippen geht nicht' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(h.act(h.host, { type: 'kids_verdict', correct: true })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(b, { type: 'kids_buzz' }));
    expect(cur(h).holder).toBe(b);
    expect(kr(h).turnDeadline).toBe(h.room.now + 5000);
    expect(h.act(c, { type: 'kids_buzz' })).toMatchObject({ ok: false, code: 'invalid_action' });
    expect(viewRound(h, c).buzzer).toEqual({ holder: b, deadline: h.room.now + 5000, used: [] });
    expect(viewRound(h, null).buzzer?.holder).toBe(b);

    // Ablauf zählt wie Falsch: Versuch verbraucht, Buzzer frei, alle Geräte bekommen den Stand.
    const emits = h.emits.length;
    h.scheduler.advance(5000);
    expect(h.emits.length).toBe(emits + 1);
    expect(cur(h)).toMatchObject({ holder: null, used: [b], stage: 'open' });
    expect(kr(h).turnDeadline).toBeNull();
    expect(h.act(b, { type: 'kids_buzz' })).toMatchObject({ ok: false, code: 'invalid_action' });

    expectOk(h.act(c, { type: 'kids_buzz' }));
    expect(h.act(c, { type: 'kids_verdict', correct: true })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'kids_verdict', correct: true }));
    expect(cur(h)).toMatchObject({ holder: null, stage: 'solved' });
    expect(cur(h).solved[c]).toBe(h.room.now);
    expect(kr(h).turnDeadline).toBeNull();
    expect(viewRound(h, b).name).toBe(cur(h).face.name);
    expect(viewRound(h, b).solved).toEqual([{ playerId: c, at: h.room.now, rank: 1 }]);
    // Ein alter Timer richtet nach der Auflösung nichts mehr an.
    h.scheduler.advance(10_000);
    expect(cur(h)).toMatchObject({ used: [b], stage: 'solved' });

    // Zweiter Promi: beide falsch, dann ist er ohne Gewinner durch.
    expectOk(h.act(h.host, { type: 'kids_next' }));
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(c, { type: 'kids_buzz' }));
    expectOk(h.act(h.host, { type: 'kids_verdict', correct: false }));
    expect(cur(h)).toMatchObject({ holder: null, used: [c], stage: 'open' });
    expectOk(h.act(b, { type: 'kids_buzz' }));
    expectOk(h.act(h.host, { type: 'kids_verdict', correct: false }));
    expect(cur(h)).toMatchObject({ used: [c, b], stage: 'solved' });
    expectOk(h.act(h.host, { type: 'kids_next' }));
    expect(h.room.phase).toBe('reveal');
    const v = viewRound(h, b);
    expect(v).toMatchObject({ points: { [b]: 0, [c]: 1 }, hits: { [b]: 0, [c]: 1 }, misses: { [b]: 2, [c]: 1 } });
    expect(v.history[1]?.winners).toEqual([]);
  });

  test('Fehlbuzzer kosten nur mit der Regel „minus“ einen Punkt, auch ins Minus', () => {
    const h = makeHarness(['Host', 'B', 'C']);
    startKids(h, { mode: 'buzz', penalty: 'minus', count: 1 });
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(b, { type: 'kids_buzz' }));
    expectOk(h.act(h.host, { type: 'kids_verdict', correct: false }));
    expectOk(h.act(c, { type: 'kids_buzz' }));
    expectOk(h.act(h.host, { type: 'kids_verdict', correct: true }));
    expect(viewRound(h, b).points).toEqual({ [b]: -1, [c]: 1 });
  });

  test('Auflösen durch den Host gibt den Buzzer frei; Verlassen und Hostwechsel räumen auf', () => {
    const h = makeHarness(['Host', 'B', 'C', 'D']);
    startKids(h, { mode: 'buzz', thinkSeconds: 5, count: 1 });
    const [a, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(h.host, { type: 'kids_show' }));
    expectOk(h.act(b, { type: 'kids_buzz' }));
    expect(h.room.leave(b).ok).toBe(true);
    expect(cur(h)).toMatchObject({ holder: null, used: [] });
    expect(kr(h).turnDeadline).toBeNull();
    h.scheduler.advance(5000);
    expect(cur(h).stage).toBe('open');

    expectOk(h.act(c, { type: 'kids_buzz' }));
    h.scheduler.advance(5000);
    expect(cur(h).used).toEqual([c]);
    expect(h.room.leave(a).ok).toBe(true);
    expect(h.room.hostId).toBe(c);
    expect(kr(h).turnOrder).toEqual([d]);
    expect(cur(h).used).toEqual([]);
    expectOk(h.act(d, { type: 'kids_buzz' }));
    expectOk(h.act(c, { type: 'kids_resolve' }));
    expect(cur(h)).toMatchObject({ holder: null, stage: 'solved' });
    expect(cur(h).solved[d]).toBeUndefined();
    h.scheduler.advance(5000);
    expect(cur(h).used).toEqual([]);
    expectOk(h.act(c, { type: 'kids_next' }));
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, d).points).toEqual({ [d]: 0 });
  });
});
