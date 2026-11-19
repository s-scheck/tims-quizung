import { unpackStones, type TowerEffectView, type TowerFrame, type TowerStone } from '@quiz/shared';

interface FeedEntry {
  prev: TowerStone[] | null;
  last: TowerStone[];
  frame: TowerFrame;
  prevAt: number;
  lastAt: number;
}

/**
 * Hochstapler: zuletzt empfangene Türme der anderen. Frames kommen etwa achtmal pro Sekunde; gezeichnet wird
 * zwischen den letzten beiden interpoliert, also gut eine Frame-Länge hinterher, dafür ruckelfrei.
 */
class TowerFeed {
  /** Zählt jede Ankunft, für Anzeigen wie die Höhe. */
  version = $state(0);
  private map = new Map<string, FeedEntry>();

  push(playerId: string, frame: TowerFrame): void {
    const now = performance.now();
    const e = this.map.get(playerId);
    this.map.set(playerId, { prev: e?.last ?? null, prevAt: e?.lastAt ?? now, last: unpackStones(frame.s), lastAt: now, frame });
    this.version++;
  }

  /** Letzter Frame, sofern er zur Runde ab `since` (Serverzeit) gehört. */
  frame(playerId: string, since: number): TowerFrame | null {
    const f = this.map.get(playerId)?.frame;
    return f && f.t >= since - 5000 ? f : null;
  }

  /** Steine zum Zeitpunkt `now` (performance.now), zwischen den letzten beiden Frames geglättet. */
  stones(playerId: string, now: number): TowerStone[] {
    const e = this.map.get(playerId);
    if (!e) return [];
    if (!e.prev) return e.last;
    const span = Math.max(60, Math.min(400, e.lastAt - e.prevAt));
    const k = Math.min(1, Math.max(0, (now - e.lastAt) / span));
    const before = new Map(e.prev.map((s) => [s.id, s]));
    return e.last.map((s) => {
      const p = before.get(s.id);
      if (!p || p.form !== s.form) return s;
      let da = s.a - p.a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return { ...s, x: p.x + (s.x - p.x) * k, y: p.y + (s.y - p.y) * k, a: p.a + da * k };
    });
  }

  clear(): void {
    this.map.clear();
    this.version++;
  }

  // Gewirkte Zauber der Runde, für die Zusammenfassung in der Auswertung. Der Server vergisst abgelaufene Effekte,
  // also merkt sich jedes Gerät selbst, was es gesehen hat (nach dem Neuladen fehlt, was davor lag).
  private spells = new Map<number, TowerEffectView>();
  private spellRound = 0;

  noteSpells(roundStart: number, effects: TowerEffectView[]): void {
    if (roundStart !== this.spellRound) {
      this.spells.clear();
      this.spellRound = roundStart;
    }
    for (const e of effects) if (!this.spells.has(e.id)) this.spells.set(e.id, { ...e });
  }

  spellsOf(roundStart: number): TowerEffectView[] {
    return roundStart === this.spellRound ? [...this.spells.values()] : [];
  }
}

export const towerFeed = new TowerFeed();
