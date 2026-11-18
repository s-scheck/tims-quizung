import { describe, expect, test } from 'bun:test';
import { SPLASH_AFTER_LAND_MS, SPLASH_COUNTDOWN_MS, SPLASH_DEFAULTS } from '@quiz/shared';
import { toView } from '../src/rooms/view.ts';
import type { SplashRound } from '../src/rooms/state.ts';
import { coverageByPlayer } from '../src/games/splash/view.ts';
import { expectOk, makeHarness, startSplash, type Harness } from './fixtures.ts';

function sr(h: Harness): SplashRound {
  const round = h.room.round;
  if (round?.game !== 'splash') throw new Error('keine Splash-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'splash') throw new Error('keine Splash-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

/** Richtige Antwort auf die aktuelle Frage, frei oder als Option. */
function right(h: Harness, id: string) {
  const step = sr(h).step!;
  return h.act(id, step.choices ? { type: 'splash_answer', choice: step.correctChoice! } : { type: 'splash_answer', text: step.question.answer });
}

function wrong(h: Harness, id: string) {
  const step = sr(h).step!;
  return h.act(id, step.choices ? { type: 'splash_answer', choice: (step.correctChoice! + 1) % 4 } : { type: 'splash_answer', text: 'völlig falsch' });
}

/** Zur nächsten Frage einer bestimmten Art springen (Reihenfolge ist gemischt). */
function forceQuestion(h: Harness, free: boolean) {
  const r = sr(h);
  const step = r.step!;
  const index = r.category.questions.findIndex((q) => !q.wrong === free);
  step.question = r.category.questions[index]!;
  if (free) {
    step.choices = null;
    step.correctChoice = null;
  } else {
    step.choices = [step.question.answer, ...step.question.wrong!];
    step.correctChoice = 0;
  }
}

/** Countdown abwarten und schießen. */
function fire(h: Harness, id: string, power = 0.5, aim = 0.5) {
  h.scheduler.advance(SPLASH_COUNTDOWN_MS);
  return h.act(id, { type: 'splash_shoot', power, aim });
}

/** Flug und Reaktion abwarten. */
function land(h: Harness) {
  h.scheduler.advance(3000 + SPLASH_AFTER_LAND_MS);
}

describe('Splash!: Ablauf', () => {
  test('gleichzeitig: alle antworten, die Richtigen schießen, der Schnellste zuletzt', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b, c] = h.ids as [string, string, string];
    startSplash(h, { answerSeconds: 0, count: 2 });
    const r = sr(h);
    expect(h.room.phase).toBe('playing');
    expect(r.totalSteps).toBe(2);
    expect(r.step?.stage).toBe('answering');

    expectOk(right(h, a));
    h.scheduler.advance(500);
    expectOk(right(h, c));
    h.scheduler.advance(500);
    // Noch offen: fremde Antworten und Lösung sind geheim, sichtbar ist nur, wer geantwortet hat.
    const open = viewRound(h, b).step!;
    expect(open.answered).toEqual([a, c]);
    expect(open.answers).toBeUndefined();
    expect(open.answer).toBeUndefined();
    expect(h.act(a, { type: 'splash_answer', text: 'nochmal' })).toMatchObject({ ok: false });
    expectOk(wrong(h, b));

    // Alle haben geantwortet: schießen, a war am schnellsten und kommt zuletzt.
    expect(r.step!.stage).toBe('shooting');
    expect(r.step!.shooters).toEqual([c, a]);
    expect(r.step!.shot?.shooter).toBe(c);
    expect(h.act(c, { type: 'splash_shoot', power: 0.5, aim: 0.5 })).toMatchObject({ ok: false, message: 'Der Countdown läuft noch' });
    expect(fire(h, a)).toMatchObject({ ok: false, code: 'not_your_turn' });
    expectOk(h.act(c, { type: 'splash_shoot', power: 0.5, aim: 0.5 }));
    expect(h.act(c, { type: 'splash_shoot', power: 0.5, aim: 0.5 })).toMatchObject({ ok: false });
    expect(r.blobs).toHaveLength(1);
    expect(r.blobs[0]).toMatchObject({ owner: c, onField: true });
    land(h);
    expect(r.step!.shot?.shooter).toBe(a);
    expectOk(fire(h, a, 0.55, 0.52));
    land(h);
    expect(r.step!.stage).toBe('done');
    // Nach der Frage: Lösung und Antworten für alle.
    const done = viewRound(h, b).step!;
    expect(done.answer).toBeDefined();
    expect(done.answers?.map((x) => [x.playerId, x.correct]).sort()).toEqual([[a, true], [b, false], [c, true]].sort());

    expect(h.act(b, { type: 'splash_next' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'splash_next' }));
    expect(r.step!.no).toBe(2);
    expect(viewRound(h, null).coverage).toBeUndefined();
    expectOk(h.act(h.host, { type: 'splash_close' }));
    expect(r.step!.stage).toBe('done');
    expectOk(h.act(h.host, { type: 'splash_next' }));

    // Auflösung mit Prozenten: der spätere Fleck übermalt den früheren.
    expect(h.room.phase).toBe('reveal');
    const cov = viewRound(h, null).coverage!;
    expect(cov[a]).toBeGreaterThan(2.5);
    expect(cov[c]).toBeGreaterThan(0);
    expect(cov[c]).toBeLessThan(cov[a]!);
    expect(cov[b]).toBeUndefined();
  });

  test('nacheinander: jeder bekommt eigene Fragen, nur er antwortet, falsch heißt kein Schuss', () => {
    const h = makeHarness(['A', 'B']);
    const [a, b] = h.ids as [string, string];
    startSplash(h, { mode: 'turns', count: 2, countdown: false });
    const r = sr(h);
    expect(r.totalSteps).toBe(4);
    const first = r.step!.askedTo!;
    const second = first === a ? b : a;
    expect(r.turnOrder[0]).toBe(first);
    expect(right(h, second)).toMatchObject({ ok: false, code: 'not_allowed' });
    expectOk(wrong(h, first));
    expect(r.step!.stage).toBe('done');
    expect(r.blobs).toHaveLength(0);
    expectOk(h.act(h.host, { type: 'splash_next' }));
    expect(r.step!.askedTo).toBe(second);
    expectOk(right(h, second));
    expect(r.step!.shooters).toEqual([second]);
    // Ohne Countdown darf sofort geschossen werden.
    expectOk(h.act(second, { type: 'splash_shoot', power: 0.4, aim: 0.3 }));
  });

  test('freie Antwort: der moderierende Host prüft mit Vorschlag, spielt er mit, entscheidet der Server', () => {
    const h = moderated(['Host', 'B', 'C']);
    const [, b, c] = h.ids as [string, string, string];
    startSplash(h, { answerSeconds: 0 });
    forceQuestion(h, true);
    const r = sr(h);
    expectOk(right(h, b));
    expectOk(h.act(c, { type: 'splash_answer', text: 'Pariss' }));
    expect(r.step!.stage).toBe('judging');
    // Der Host sieht Antworten und Vorschläge, die Spieler nicht.
    expect(viewRound(h, h.host).step!.answers?.find((x) => x.playerId === b)?.correct).toBe(true);
    expect(viewRound(h, b).step!.answers).toBeUndefined();
    expectOk(h.act(h.host, { type: 'splash_judge', playerId: c, correct: true }));
    expect(h.act(b, { type: 'splash_release' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'splash_release' }));
    expect(r.step!.stage).toBe('shooting');
    expect(r.step!.shooters).toHaveLength(2);

    const p = makeHarness(['Host', 'B']);
    startSplash(p, { answerSeconds: 0 });
    forceQuestion(p, true);
    expectOk(p.act(p.ids[0]!, { type: 'splash_answer', text: sr(p).step!.question.answer }));
    expectOk(p.act(p.ids[1]!, { type: 'splash_answer', text: 'nein' }));
    expect(sr(p).step!.stage).toBe('shooting');
    expect(sr(p).step!.shooters).toEqual([p.ids[0]]);
  });

  test('Antwortzeit läuft ab, Host überspringt einen Schuss, nie automatisch', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b, c] = h.ids as [string, string, string];
    startSplash(h, { answerSeconds: 10 });
    const r = sr(h);
    expect(r.turnDeadline).toBe(h.room.now + 10_000);
    expectOk(right(h, a));
    expectOk(right(h, b));
    h.scheduler.advance(10_000);
    expect(r.step!.stage).toBe('shooting');
    const first = r.step!.shot!.shooter;
    // Lange warten schießt nicht von selbst.
    h.scheduler.advance(60_000);
    expect(r.blobs).toHaveLength(0);
    expect(r.step!.shot!.shooter).toBe(first);
    expect(h.act(c, { type: 'splash_skip' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'splash_skip' }));
    expect(r.step!.skipped).toEqual([first]);
    const secondShooter = r.step!.shot!.shooter;
    expect(secondShooter).not.toBe(first);
    expectOk(fire(h, secondShooter));
    expect(h.act(h.host, { type: 'splash_skip' })).toMatchObject({ ok: false, message: 'Die Kugel fliegt schon' });
  });

  test('daneben zählt nicht, Spieler weg mitten im Schießen', () => {
    const h = makeHarness(['A', 'B', 'C']);
    const [a, b, c] = h.ids as [string, string, string];
    startSplash(h, { answerSeconds: 0 });
    expectOk(right(h, a));
    expectOk(right(h, b));
    expectOk(wrong(h, c));
    const r = sr(h);
    const [firstShooter, lastShooter] = r.step!.shooters as [string, string];
    // Volle Kraft fliegt über den oberen Rand.
    expectOk(fire(h, firstShooter, 1, 0.5));
    expect(r.blobs[0]!.onField).toBe(false);
    expect(coverageByPlayer(r)[firstShooter] ?? 0).toBe(0);
    land(h);
    expect(r.step!.shot?.shooter).toBe(lastShooter);
    h.room.leave(lastShooter);
    expect(r.step!.stage).toBe('done');
    expect(r.step!.skipped).toEqual([lastShooter]);
  });

  test('Optionen: werden gemerkt, zu wenige Fragen für den Modus nacheinander', () => {
    const h = makeHarness(['A', 'B', 'C']);
    startSplash(h, { wind: true, obstacles: 2, speed: 'fast' });
    expect(h.room.splashOptions).toMatchObject({ wind: true, obstacles: 2, speed: 'fast' });
    expect(toView(h.room, null).splashOptions.obstacles).toBe(2);
    expect(sr(h).totalSteps).toBe(4);
    // Wind gilt je Schuss und steht in der Sicht.
    for (const id of h.ids) expectOk(right(h, id));
    expect(viewRound(h, null).step!.shot!.wind).not.toBeNull();

    const many = makeHarness(['A', 'B', 'C', 'D', 'E']);
    expectOk(many.act(many.host, { type: 'start_game' }));
    expectOk(many.act(many.host, { type: 'intro_done' }));
    expect(many.act(many.host, { type: 'choose_category', gameId: 'splash', categoryId: 'quiz', splash: { ...SPLASH_DEFAULTS, mode: 'turns' } })).toMatchObject({
      ok: false,
      message: 'Zu wenige Fragen für so viele Spieler',
    });
    expect(many.act(many.host, { type: 'choose_category', gameId: 'splash', categoryId: 'cities' })).toMatchObject({ ok: false, code: 'unknown_category' });
  });
});
