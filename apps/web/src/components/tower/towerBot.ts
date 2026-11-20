import { Vec2 } from 'planck';
import { formCells, TOWER_FIELD_HALF, TOWER_ROUND, TOWER_ROUND_RADIUS, TOWER_SPECIALS, type TowerSpecial } from '@quiz/shared';
import { STEP_MS, TowerSim } from './TowerSim.ts';

/**
 * Hochstapler-Bots für Balance-Tests (ohne DOM): Sie steuern eine `TowerSim` mit denselben Eingaben wie ein
 * Mensch (halbe Schritte, Vierteldrehungen, ▼), und zwar in menschlichem Tempo.
 */
export interface TowerBot {
  name: string;
  step(sim: TowerSim): void;
}

/** Tut gar nichts. */
export function idleBot(): TowerBot {
  return { name: 'nichts tun', step() {} };
}

/** Lässt jeden Stein sofort schnell fallen, ohne zu steuern. */
export function dropBot(): TowerBot {
  return {
    name: 'nur ▼',
    step(sim) {
      sim.fast = sim.current !== null;
    },
  };
}

interface Plan {
  turns: number;
  x: number;
}

/**
 * Einfacher guter Bot: wählt Drehung und Spalte so, dass der Stein möglichst tief, flach, gestützt und mittig liegt,
 * schiebt ihn hin (eine Eingabe je `inputMs`) und lässt ihn dann schnell fallen.
 */
export function goodBot(opts: { reactMs?: number; inputMs?: number } = {}): TowerBot {
  const reactMs = opts.reactMs ?? 250;
  const inputMs = opts.inputMs ?? 60;
  let pieceId = -1;
  let seenAt = 0;
  let lastInput = -Infinity;
  let plan: Plan | null = null;
  let turnsLeft = 0;
  return {
    name: 'guter Bot',
    step(sim) {
      const cur = sim.current;
      if (!cur) {
        sim.fast = false;
        return;
      }
      if (cur.id !== pieceId) {
        pieceId = cur.id;
        seenAt = sim.time;
        plan = null;
        sim.fast = false;
      }
      if (sim.time - seenAt < reactMs) return;
      if (!plan) {
        // Über der Linie: den Stein seitlich wegwerfen, damit der Turm ruhig stehen kann.
        plan = sim.height >= sim.goalHeight ? { turns: 0, x: cur.body.getPosition().x < 0 ? -5.5 : 5.5 } : choosePlacement(sim);
        const now = ((Math.round(-cur.body.getAngle() / (Math.PI / 2)) % 4) + 4) % 4;
        turnsLeft = (plan.turns - now + 4) % 4;
      }
      if (sim.time - lastInput >= inputMs) {
        if (turnsLeft > 0) {
          sim.rotate();
          turnsLeft--;
          lastInput = sim.time;
        } else if (Math.abs(sim.targetX - plan.x) > 0.01) {
          sim.move(plan.x > sim.targetX ? 1 : -1);
          lastInput = sim.time;
        }
      }
      const aligned = turnsLeft === 0 && Math.abs(sim.targetX - plan.x) < 0.01 && Math.abs(cur.body.getPosition().x - plan.x) < 0.08 && Math.abs(cur.body.getAngle() - sim.targetAngle) < 0.06;
      sim.fast = aligned;
    },
  };
}

const SAMPLE = 0.25;

/** Höchste Oberfläche (ohne den fallenden Stein) senkrecht unter x, -Infinity über dem Abgrund. */
function surfaceAt(sim: TowerSim, x: number, from: number): number {
  let best = -Infinity;
  const self = sim.current?.body;
  sim.world.rayCast(Vec2(x, from), Vec2(x, -3), (f, point, _normal, fraction) => {
    if (f.getBody() === self) return -1;
    best = point.y;
    return fraction;
  });
  return best;
}

export function choosePlacement(sim: TowerSim): Plan {
  const cur = sim.current!;
  const from = sim.height + 3;
  const surf = new Map<number, number>();
  for (let x = -TOWER_FIELD_HALF - 1; x <= TOWER_FIELD_HALF + 1 + 1e-6; x += SAMPLE) surf.set(Math.round(x / SAMPLE), surfaceAt(sim, x, from));
  const at = (x: number) => surf.get(Math.round(x / SAMPLE)) ?? -Infinity;
  const scale = cur.scale;
  // Rundstein: wie ein Quadrat mit dem Durchmesser als Kante.
  const round = cur.form === TOWER_ROUND;
  const cells0 = round ? [{ x: 0, y: 0 }] : formCells(cur.form).map((c) => ({ x: c.x * scale, y: c.y * scale }));
  const half = round ? TOWER_ROUND_RADIUS * scale : 0.5 * scale;
  let best: { score: number; plan: Plan } | null = null;
  for (let turns = 0; turns < 4; turns++) {
    // Drehung im Uhrzeigersinn: (x, y) → (y, −x).
    let cells = cells0;
    for (let k = 0; k < turns; k++) cells = cells.map((c) => ({ x: c.y, y: -c.x }));
    for (let x = -TOWER_FIELD_HALF + 1; x <= TOWER_FIELD_HALF - 1 + 1e-6; x += 0.5) {
      // Ruhehöhe der Mitte: der erste Kontakt von oben.
      let yc = -Infinity;
      const samples: { x: number; s: number; cell: { x: number; y: number } }[] = [];
      for (const c of cells) {
        const below = cells.some((o) => Math.abs(o.x - c.x) < 0.01 && Math.abs(o.y - (c.y - 2 * half)) < 0.01);
        for (let sx = c.x - half + SAMPLE / 2; sx < c.x + half; sx += SAMPLE) {
          const s = at(x + sx);
          if (s > -Infinity) yc = Math.max(yc, s - (c.y - half));
          if (!below) samples.push({ x: x + sx, s, cell: c });
        }
      }
      if (yc === -Infinity) continue;
      let holes = 0;
      let supLo = Infinity;
      let supHi = -Infinity;
      for (const { x: sx, s, cell } of samples) {
        const gap = yc + cell.y - half - (s === -Infinity ? -6 : s);
        holes += Math.min(gap, 6) * SAMPLE;
        if (gap < 0.12) {
          supLo = Math.min(supLo, sx - SAMPLE / 2);
          supHi = Math.max(supHi, sx + SAMPLE / 2);
        }
      }
      const com = x + cells.reduce((s, c) => s + c.x, 0) / cells.length;
      const top = yc + Math.max(...cells.map((c) => c.y + half));
      const tips = com < supLo + 0.3 || com > supHi - 0.3 ? 1 : 0;
      // Hohe, schmale Lagen kippen leicht; Ränder des Sockels sind heikel.
      const tall = Math.max(...cells.map((c) => c.y)) - Math.min(...cells.map((c) => c.y));
      const minX = x + Math.min(...cells.map((c) => c.x)) - half;
      const maxX = x + Math.max(...cells.map((c) => c.x)) + half;
      const outside = Math.max(0, -2.5 - minX) + Math.max(0, maxX - 2.5);
      const score = top + holes * 1.6 + tips * 25 + Math.abs(com) * 0.35 + tall * 1.2 + outside * 1.2;
      if (!best || score < best.score) best = { score, plan: { turns, x } };
    }
  }
  return best?.plan ?? { turns: 0, x: 0 };
}

export interface BotRun {
  /** Zeit bis zum Ziel (drei Sekunden ruhig über der Linie) in ms, sonst null. */
  finishedAt: number | null;
  maxHeight: number;
  lost: number;
  pieces: number;
}

/** Ein Zauber, der zu einer bestimmten Zeit (ms) auf den Turm des Bots wirkt; Dauer-Effekte laufen `durationMs`. */
export interface BotAttack {
  at: number;
  special: TowerSpecial;
}

/** Spielt ein Rennen mit einem Bot bis zum Ziel oder höchstens `maxMs` simulierter Zeit. */
export function runBot(seed: number, goalHeight: number, bot: TowerBot, maxMs: number, attacks: readonly BotAttack[] = []): BotRun {
  const sim = new TowerSim({ seed, goalHeight });
  let maxHeight = 0;
  let next = 0;
  const active: { special: TowerSpecial; until: number }[] = [];
  while (sim.time < maxMs) {
    while (next < attacks.length && attacks[next]!.at <= sim.time) {
      const a = attacks[next++]!;
      sim.applySpecial(a.special, next % 2 ? 1 : -1);
      const ms = TOWER_SPECIALS[a.special].durationMs;
      if (ms > 0) active.push({ special: a.special, until: sim.time + ms });
    }
    const on = (sp: TowerSpecial) => active.some((x) => x.special === sp && x.until > sim.time);
    sim.setIce(on('ice'));
    sim.turbo = on('turbo');
    bot.step(sim);
    sim.advance(STEP_MS);
    sim.drain();
    maxHeight = Math.max(maxHeight, sim.height);
    if (sim.finished) return { finishedAt: sim.time, maxHeight, lost: sim.lostCount, pieces: sim.pieces.length + sim.lostCount };
  }
  return { finishedAt: null, maxHeight, lost: sim.lostCount, pieces: sim.pieces.length + sim.lostCount };
}
