import type { TowerEffectView, TowerSpecial } from '@quiz/shared';

/**
 * Hochstapler: Ereignisse für Ticker und Ansagen, aus den Server-Ständen und den Live-Höhen abgeleitet.
 * Rein und ohne Svelte, damit es testbar bleibt: `observe` bekommt den aktuellen Stand und gibt nur neue Meldungen zurück.
 * Beim ersten Aufruf (z. B. nach dem Neuladen) wird alles Bestehende still übernommen, damit nichts nachträglich aufpoppt.
 */

export type TickerItem =
  | { id: number; kind: 'effect'; at: number; player: string; target: string; special: TowerSpecial; blocked: boolean }
  | { id: number; kind: 'mark'; at: number; player: string; value: number }
  | { id: number; kind: 'lead'; at: number; player: string }
  | { id: number; kind: 'close'; at: number; player: string; value: number }
  | { id: number; kind: 'hold'; at: number; player: string }
  | { id: number; kind: 'drop'; at: number; player: string; value: number };

type NewItem = TickerItem extends unknown ? (TickerItem extends infer T ? (T extends TickerItem ? Omit<T, 'id' | 'at'> : never) : never) : never;

export interface TickerInput {
  /** Zeit in ms (performance.now), nur für Abklingzeiten. */
  now: number;
  goal: number;
  players: string[];
  heights: Record<string, number>;
  /** Fortschritt der Ruheprüfung über der Linie, 0 bis 1. */
  holds: Record<string, number>;
  marks: Record<string, number[]>;
  effects: TowerEffectView[];
}

/** Ab diesem Rückstand zur Ziellinie gilt ein Turm als „kurz vorm Ziel“. */
export const CLOSE_GAP = 2;
/** So viel muss ein Turm auf einmal verlieren, damit es als Einsturz gilt. */
export const DROP_MIN = 2.5;
/** Neue Führung erst ab diesem Vorsprung und nicht öfter als alle LEAD_COOLDOWN ms, sonst flackert es. */
const LEAD_MARGIN = 0.4;
const LEAD_COOLDOWN = 5000;
const CLOSE_COOLDOWN = 12_000;
const HOLD_COOLDOWN = 4000;
/** Unter dieser Höhe wird noch keine Führung angesagt. */
const LEAD_MIN = 1.5;

export class TowerTickerState {
  private primed = false;
  private nextId = 1;
  private effects = new Set<number>();
  private marks = new Map<string, Set<number>>();
  private peak = new Map<string, number>();
  private leader: string | null = null;
  private leadAt = -Infinity;
  private closeAt = new Map<string, number>();
  private closeArmed = new Set<string>();
  private holding = new Set<string>();
  private holdAt = new Map<string, number>();

  observe(s: TickerInput): TickerItem[] {
    const out: TickerItem[] = [];
    const push = (item: NewItem) => {
      if (this.primed) out.push({ ...item, id: this.nextId++, at: s.now } as TickerItem);
    };

    for (const e of s.effects) {
      if (this.effects.has(e.id)) continue;
      this.effects.add(e.id);
      push({ kind: 'effect', player: e.by, target: e.target, special: e.special, blocked: e.blocked === true });
    }

    for (const id of s.players) {
      const seen = this.marks.get(id) ?? new Set<number>();
      this.marks.set(id, seen);
      const fresh = (s.marks[id] ?? []).filter((m) => !seen.has(m));
      fresh.forEach((m) => seen.add(m));
      // Mehrere Marken auf einmal: nur die höchste ansagen.
      if (fresh.length > 0) push({ kind: 'mark', player: id, value: Math.max(...fresh) });

      const h = s.heights[id] ?? 0;
      const peak = Math.max(this.peak.get(id) ?? 0, h);
      if (peak - h >= DROP_MIN) {
        push({ kind: 'drop', player: id, value: peak - h });
        this.peak.set(id, h);
      } else this.peak.set(id, peak);

      const gap = s.goal - h;
      if (gap > CLOSE_GAP + 1) this.closeArmed.add(id);
      if (gap >= 0.2 && gap <= CLOSE_GAP && this.closeArmed.has(id) && s.now - (this.closeAt.get(id) ?? -Infinity) > CLOSE_COOLDOWN) {
        this.closeArmed.delete(id);
        this.closeAt.set(id, s.now);
        push({ kind: 'close', player: id, value: gap });
      }

      const hold = (s.holds[id] ?? 0) > 0;
      if (hold && !this.holding.has(id) && s.now - (this.holdAt.get(id) ?? -Infinity) > HOLD_COOLDOWN) {
        this.holdAt.set(id, s.now);
        push({ kind: 'hold', player: id });
      }
      if (hold) this.holding.add(id);
      else this.holding.delete(id);
    }

    const ranked = s.players.map((id) => ({ id, h: s.heights[id] ?? 0 })).sort((a, b) => b.h - a.h);
    const top = ranked[0];
    if (top && top.h >= LEAD_MIN && top.id !== this.leader) {
      const prev = this.leader === null ? 0 : (s.heights[this.leader] ?? 0);
      if (top.h - prev >= LEAD_MARGIN && s.now - this.leadAt > LEAD_COOLDOWN) {
        // Die allererste Führung wird nur gemerkt, angesagt wird erst ein Wechsel.
        if (this.leader !== null) push({ kind: 'lead', player: top.id });
        this.leader = top.id;
        this.leadAt = s.now;
      }
    }

    this.primed = true;
    return out;
  }
}
