import { describe, expect, test } from 'bun:test';
import { luckFor, seededRandom, TOWER_GOAL_HEIGHT, TOWER_SPECIALS, towerPool, type TowerSpecial } from '@quiz/shared';
import { dropBot, goodBot, idleBot, runBot, type BotAttack, type BotRun, type TowerBot } from './towerBot.ts';

/**
 * Balance: Nichtstun darf nie gewinnen, geschicktes Spielen muss sich klar lohnen. Bots spielen das Rennen über
 * mehrere Seeds (rein simuliert, ohne DOM). Den Glücks-Slot des Servers spielt der Test selbst nach: alle 15 s
 * zieht der Bot einen Zauber über `luckFor` (Mittelfeld von vier Spielern). Helle wirken sofort auf den eigenen
 * Turm (Wegzaubern hebt sich ein Mensch für einen schlechten Stein auf, der Bot lässt es), dunkle gehen an die
 * anderen. Dafür trifft ihn versetzt der Glücks-Zauber eines Gegners, wenn der dunkel ist.
 */
const SEEDS = Array.from({ length: 10 }, (_, i) => (i + 1) * 7919);
/** So lange dauert ein Rennen höchstens, bevor der Host es abbricht (bei hohen Zielen großzügiger). */
const RACE_MS = 150_000;
const LUCK_MS = 15_000;

/** Glücks-Zauber eines Rennens: eigene helle und fremde dunkle, deterministisch aus dem Seed. */
function luckPlan(seed: number, maxMs: number): BotAttack[] {
  const rnd = seededRandom(seed ^ 0x5bd1e995);
  const pool = towerPool(rnd);
  const out: BotAttack[] = [];
  for (let t = LUCK_MS; t < maxMs; t += LUCK_MS) {
    const own: TowerSpecial = luckFor(2, 4, pool, rnd);
    if (TOWER_SPECIALS[own].group === 'light' && own !== 'vanish') out.push({ at: t, special: own });
    // Der Führende bekommt am ehesten dunkle Magie und wirft sie auf die anderen.
    const foe: TowerSpecial = luckFor(1, 4, pool, rnd);
    if (TOWER_SPECIALS[foe].group === 'dark') out.push({ at: t + LUCK_MS / 2, special: foe });
  }
  return out;
}

function runs(make: () => TowerBot, goal: number, opts: { luck?: boolean; light?: boolean; attacks?: BotAttack[]; maxMs?: number } = {}): BotRun[] {
  const maxMs = opts.maxMs ?? RACE_MS;
  return SEEDS.map((seed) => {
    let attacks = opts.attacks ?? (opts.luck ? luckPlan(seed, maxMs) : []);
    if (opts.light) attacks = attacks.filter((a) => TOWER_SPECIALS[a.special].group === 'light');
    return runBot(seed, goal, make(), maxMs, attacks);
  });
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const done = (r: BotRun[]) => r.filter((x) => x.finishedAt !== null);
const seconds = (ms: number) => Math.round(ms / 100) / 10;

describe('Hochstapler-Balance', () => {
  const MID = TOWER_GOAL_HEIGHT.mid;

  test('Nichtstun erreicht die Ziellinie nie, auch nicht mit allem hellen Glück', () => {
    const r = runs(idleBot, MID);
    expect(done(r)).toHaveLength(0);
    // Die meisten Steine fallen daneben.
    expect(r.reduce((s, x) => s + x.lost, 0) / r.reduce((s, x) => s + x.pieces, 0)).toBeGreaterThan(0.6);
    expect(done(runs(idleBot, MID, { luck: true, light: true }))).toHaveLength(0);
    // Gezielt die stärksten hellen Zauber: Versteinern, Balken, Ranken, Vergrößern, Schwerer Stein.
    const light: BotAttack[] = [];
    for (let t = 10_000; t < RACE_MS; t += 10_000) light.push({ at: t, special: (['petrify', 'glue', 'beam', 'grow', 'heavy'] as const)[(t / 10_000) % 5]! });
    expect(done(runs(idleBot, MID, { attacks: light }))).toHaveLength(0);
  }, 30_000);

  test('Nur ▼ drücken ohne Steuern reicht praktisch nie', () => {
    expect(done(runs(dropBot, MID)).length).toBeLessThanOrEqual(1);
    expect(done(runs(dropBot, MID, { luck: true, light: true })).length).toBeLessThanOrEqual(1);
  }, 30_000);

  test('ein guter Spieler ist klar schneller', () => {
    const r = done(runs(goodBot, MID));
    expect(r.length).toBeGreaterThanOrEqual(9);
    expect(median(r.map((x) => x.finishedAt!))).toBeLessThan(75_000);
  }, 30_000);

  test('dunkle Magie bremst, aber gutes Spiel gewinnt trotzdem', () => {
    const dark: BotAttack[] = [
      { at: 12_000, special: 'gust' },
      { at: 20_000, special: 'mini' },
      { at: 30_000, special: 'ice' },
      { at: 45_000, special: 'round' },
      { at: 55_000, special: 'turbo' },
      { at: 70_000, special: 'gust' },
    ];
    expect(done(runs(goodBot, MID, { attacks: dark })).length).toBeGreaterThanOrEqual(8);
  }, 30_000);

  test('mit Glücks-Slot: Ziellinien 16, 32 und 40 m', () => {
    const table: string[] = [];
    for (const [goal, maxMs, minDone] of [
      [MID, RACE_MS, 9],
      [TOWER_GOAL_HEIGHT.xhigh, 300_000, 4],
      [TOWER_GOAL_HEIGHT.sky, 300_000, 3],
    ] as const) {
      const r = runs(goodBot, goal, { maxMs, luck: true });
      const d = done(r);
      table.push(`${goal} m: ${d.length}/10 im Ziel, Median ${d.length ? seconds(median(d.map((x) => x.finishedAt!))) : '–'} s, ${r.reduce((s, x) => s + x.lost, 0)} Steine verloren`);
      expect(d.length).toBeGreaterThanOrEqual(minDone);
      // Nichtstun gewinnt nie, auch nicht hoch hinaus mit Glück.
      expect(done(runs(idleBot, goal, { maxMs: 120_000, luck: true }))).toHaveLength(0);
    }
    console.log(`\nHochstapler-Balance mit Glücks-Slot (guter Bot, 10 Seeds)\n${table.join('\n')}`);
  }, 90_000);
});
