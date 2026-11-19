import { describe, expect, test } from 'bun:test';
import { TOWER_GOAL_HEIGHT } from '@quiz/shared';
import { dropBot, goodBot, idleBot, runBot, type BotAttack, type BotRun, type TowerBot } from './towerBot.ts';

/**
 * Balance: Nichtstun darf nicht gewinnen, geschicktes Spielen muss sich klar lohnen. Bots spielen das Rennen bis
 * zur mittleren Ziellinie über mehrere Seeds (rein simuliert, ohne DOM, je Lauf unter 0,1 s).
 */
const GOAL = TOWER_GOAL_HEIGHT.mid;
const SEEDS = Array.from({ length: 10 }, (_, i) => (i + 1) * 7919);
/** So lange dauert ein Rennen höchstens, bevor der Host es abbricht. */
const RACE_MS = 150_000;

function runs(make: () => TowerBot, attacks: BotAttack[] = []): BotRun[] {
  return SEEDS.map((seed) => runBot(seed, GOAL, make(), RACE_MS, attacks));
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

describe('Hochstapler-Balance', () => {
  test('Nichtstun erreicht die Ziellinie nie', () => {
    const r = runs(idleBot);
    expect(r.filter((x) => x.finishedAt !== null)).toHaveLength(0);
    // Die meisten Steine fallen daneben.
    expect(r.reduce((s, x) => s + x.lost, 0) / r.reduce((s, x) => s + x.pieces, 0)).toBeGreaterThan(0.6);
  });

  test('Nur ▼ drücken ohne Steuern reicht praktisch nie', () => {
    const r = runs(dropBot);
    expect(r.filter((x) => x.finishedAt !== null).length).toBeLessThanOrEqual(1);
  });

  test('ein guter Spieler ist klar schneller', () => {
    const r = runs(goodBot);
    const done = r.filter((x) => x.finishedAt !== null);
    expect(done.length).toBeGreaterThanOrEqual(9);
    expect(median(done.map((x) => x.finishedAt!))).toBeLessThan(75_000);
  });

  test('dunkle Magie bremst, aber gutes Spiel gewinnt trotzdem; Nichtstun mit hellem Glück auch nicht', () => {
    const dark: BotAttack[] = [
      { at: 12_000, special: 'gust' },
      { at: 20_000, special: 'boulder' },
      { at: 30_000, special: 'ice' },
      { at: 45_000, special: 'round' },
      { at: 55_000, special: 'turbo' },
      { at: 70_000, special: 'gust' },
    ];
    const good = runs(goodBot, dark);
    expect(good.filter((x) => x.finishedAt !== null).length).toBeGreaterThanOrEqual(8);
    const light: BotAttack[] = [
      { at: 20_000, special: 'petrify' },
      { at: 40_000, special: 'glue' },
      { at: 60_000, special: 'beam' },
      { at: 80_000, special: 'petrify' },
    ];
    expect(runs(idleBot, light).filter((x) => x.finishedAt !== null)).toHaveLength(0);
  });
});
