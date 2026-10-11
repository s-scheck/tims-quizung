import { describe, expect, test } from 'bun:test';
import { toView } from '../src/rooms/view.ts';
import type { RiskRound } from '../src/rooms/state.ts';
import { expectOk, makeHarness, startRisk, type Harness } from './fixtures.ts';

function rr(h: Harness): RiskRound {
  const round = h.room.round;
  if (round?.game !== 'risk') throw new Error('keine No-Risk-Runde');
  return round;
}

function viewRound(h: Harness, viewerId: string | null) {
  const round = toView(h.room, viewerId).round;
  if (round?.game !== 'risk') throw new Error('keine No-Risk-Runde in der Sicht');
  return round;
}

function moderated(names: string[]): Harness {
  const h = makeHarness(names);
  expectOk(h.act(h.host, { type: 'set_settings', hostPlays: false }));
  return h;
}

describe('No Risk No Fun: Durchgang', () => {
  test('Regeln werden übernommen und gemerkt', () => {
    const h = makeHarness(['A', 'B']);
    startRisk(h, { duplicates: 'none', missPoints: -10 });
    expect(rr(h).rules).toEqual({ duplicates: 'none', missPoints: -10 });
    expect(toView(h.room, null).riskRules).toEqual({ duplicates: 'none', missPoints: -10 });
    expect(h.room.phase).toBe('playing');
  });

  test('geheim einloggen, einmal pro Durchgang, aufgelöst wird wenn alle drin sind', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h);
    const [, b, c] = h.ids as [string, string, string];
    expect(h.act(h.host, { type: 'risk_guess', text: 'Peru' })).toMatchObject({ ok: false, code: 'not_allowed' });
    expect(h.act(b, { type: 'risk_guess', text: '   ' })).toMatchObject({ ok: false });
    expectOk(h.act(b, { type: 'risk_guess', text: 'Mongolei' }));
    expect(h.act(b, { type: 'risk_guess', text: 'Peru' })).toMatchObject({ ok: false, code: 'invalid_action' });

    const cView = viewRound(h, c);
    expect(cView.loggedIn).toEqual([b]);
    expect(cView.myGuess).toBeUndefined();
    expect(JSON.stringify(cView)).not.toContain('Mongolei');
    expect(cView.solution).toBeUndefined();
    expect(viewRound(h, b).myGuess).toBe('Mongolei');
    expect(viewRound(h, h.host).solution?.length).toBe(20);

    expectOk(h.act(c, { type: 'risk_guess', text: 'Deutschland' }));
    expect(h.room.phase).toBe('reveal');
    const pub = viewRound(h, null);
    expect(pub.passes).toEqual([
      {
        passNo: 1,
        results: [
          { playerId: b, text: 'Mongolei', rank: 18, points: 18 },
          { playerId: c, text: 'Deutschland', rank: null, points: 0 },
        ],
      },
    ]);
    expect(pub.totals).toEqual({ [b]: 18, [c]: 0 });
    expect(pub.hitSlots).toEqual([{ rank: 18, name: 'Mongolei', value: 1830, passNo: 1, by: [b] }]);
    expect(pub.solution).toBeUndefined();
    expect(pub.loggedIn).toEqual([]);
  });

  test('Aliasse treffen, gleicher Treffer je nach Regel, Fehltipp und kein Tipp kosten', () => {
    const h = moderated(['Host', 'B', 'C', 'D']);
    startRisk(h, { duplicates: 'none', missPoints: -10 });
    const [, b, c, d] = h.ids as [string, string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'vereinigte staaten' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'USA' }));
    expectOk(h.act(h.host, { type: 'end_round' }));
    const pass = viewRound(h, null).passes[0]!;
    expect(pass.results.map((x) => [x.playerId, x.rank, x.points])).toEqual([
      [b, 3, 0],
      [c, 3, 0],
      [d, null, -10],
    ]);
  });

  test('Zeitlimit löst den Durchgang auf', () => {
    const h = makeHarness(['A', 'B'], { timer: 30 });
    startRisk(h);
    expectOk(h.act(h.ids[0]!, { type: 'risk_guess', text: 'Kanada' }));
    h.scheduler.advance(30_000);
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, null).totals).toEqual({ [h.ids[0]!]: 2, [h.ids[1]!]: 0 });
  });
});

describe('No Risk No Fun: Host-Korrektur und weitere Durchgänge', () => {
  test('Host korrigiert in der Auflösung, die Punkte rechnen sich neu', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'Kasachtan' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Peru' }));
    expect(viewRound(h, null).totals[b]).toBe(0);
    expect(h.act(b, { type: 'risk_correct', playerId: b, rank: 9 })).toMatchObject({ ok: false, code: 'not_host' });
    expect(h.act(h.host, { type: 'risk_correct', playerId: b, rank: 21 })).toMatchObject({ ok: false });
    expectOk(h.act(h.host, { type: 'risk_correct', playerId: b, rank: 9 }));
    expectOk(h.act(h.host, { type: 'risk_correct', playerId: c, rank: null }));
    expect(viewRound(h, null).totals).toEqual({ [b]: 9, [c]: 0 });
  });

  test('nächster Durchgang: Punkte summieren sich, getroffene Plätze sind gesperrt', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'Peru' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Mexiko' }));
    expect(h.act(b, { type: 'next_pass' })).toMatchObject({ ok: false, code: 'not_host' });
    expectOk(h.act(h.host, { type: 'next_pass' }));
    expect(h.room.phase).toBe('playing');
    expect(viewRound(h, null).passNo).toBe(2);
    expect(viewRound(h, null).passes.length).toBe(1);
    expect(h.act(b, { type: 'risk_guess', text: 'Mexiko' })).toMatchObject({ ok: false, message: 'Mexiko ist schon aufgedeckt' });
    expectOk(h.act(b, { type: 'risk_guess', text: 'Tschad' }));
    expectOk(h.act(c, { type: 'risk_guess', text: 'Atlantis' }));
    expect(h.act(h.host, { type: 'risk_correct', playerId: c, rank: 19 })).toMatchObject({ ok: false });
    const pub = viewRound(h, null);
    expect(pub.totals).toEqual({ [b]: 19 + 20, [c]: 13 });
    expect(pub.hitSlots.map((s) => [s.rank, s.passNo])).toEqual([
      [13, 1],
      [19, 1],
      [20, 2],
    ]);
  });

  test('Kategorie beenden: alle sehen die ganze Liste, Punkte trägt der Host ein', () => {
    const h = makeHarness(['A', 'B']);
    startRisk(h);
    const [a, b] = h.ids as [string, string];
    expectOk(h.act(a, { type: 'risk_guess', text: 'Iran' }));
    expectOk(h.act(b, { type: 'risk_guess', text: 'Iran' }));
    expect(viewRound(h, null).totals).toEqual({ [a]: 17, [b]: 17 });
    expectOk(h.act(h.host, { type: 'to_scoring' }));
    const sol = viewRound(h, b).solution!;
    expect(sol.length).toBe(20);
    expect(sol[16]).toMatchObject({ rank: 17, name: 'Iran', by: [a, b] });
    expect(sol[0]).toEqual({ rank: 1, name: 'Russland', value: 2000 });
    expectOk(h.act(h.host, { type: 'submit_scores', scores: { [a]: 3, [b]: 3 } }));
    expect(h.room.scores).toEqual({ [a]: 3, [b]: 3 });
  });

  test('wer geht, fehlt; sind die Übrigen drin, wird aufgelöst', () => {
    const h = moderated(['Host', 'B', 'C']);
    startRisk(h);
    const [, b, c] = h.ids as [string, string, string];
    expectOk(h.act(b, { type: 'risk_guess', text: 'Peru' }));
    expectOk(h.room.leave(c));
    expect(h.room.phase).toBe('reveal');
    expect(viewRound(h, null).totals).toEqual({ [b]: 19 });
  });
});
