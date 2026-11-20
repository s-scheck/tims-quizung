import type { DungeonRoundView } from '@quiz/shared';

/**
 * Dungeon: Meldungen für den Ticker am Fernseher, aus dem Vergleich zweier Stände abgeleitet.
 * Rein und ohne Svelte, damit es testbar bleibt. Ohne alten Stand (erstes Bild, Neuladen) gibt es nichts,
 * damit nichts nachträglich aufpoppt.
 *
 * Ergebnis-Meldungen (`result: true`) zeigt der Fernseher erst nach dem Spannungsmoment, sonst verraten sie es vorab.
 */

export type DungeonTickerEvent =
  /** Durch die letzte Tür, mit Platz. */
  | { kind: 'exit'; player: string; place: number }
  /** Als Erster in einem neuen Raum (ab Raum 2, ab 0 gezählt also ab 1). */
  | { kind: 'first'; player: string; room: number }
  | { kind: 'eliminated'; player: string }
  /** An dieser Tür sind jetzt schon `fails` gescheitert. */
  | { kind: 'doorFails'; door: string; fails: number }
  /** Alle in der Runde lagen falsch. */
  | { kind: 'allWrong'; count: number }
  /** Jemand stellt sich in eine Tür, an der schon mindestens zwei gescheitert sind. */
  | { kind: 'dare'; player: string; door: string; fails: number };

export type DungeonTickerItem = DungeonTickerEvent & { id: number; at: number; result: boolean };

/** Ab so vielen Gescheiterten ist eine Tür eine Meldung wert. */
export const DOOR_FAILS_MIN = 2;

function doorTitle(round: DungeonRoundView, doorId: string): string {
  for (const doors of round.rooms) {
    const d = doors.find((x) => x.id === doorId);
    if (d) return d.title;
  }
  return '?';
}

function failsAt(round: DungeonRoundView, doorId: string): number {
  for (const doors of round.rooms) {
    const d = doors.find((x) => x.id === doorId);
    if (d) return d.tries.filter((t) => !t.correct).length;
  }
  return 0;
}

/** Neue Meldungen zwischen `prev` und `next`. `result` sagt, ob sie zum Ergebnis gehören (erst nach der Spannung zeigen). */
export function dungeonTicker(prev: DungeonRoundView | null, next: DungeonRoundView): { event: DungeonTickerEvent; result: boolean }[] {
  if (!prev) return [];
  const out: { event: DungeonTickerEvent; result: boolean }[] = [];

  // Türwahl: wer sich an eine berüchtigte Tür wagt (nur einmal, beim Bestätigen).
  if (next.stage === 'choosing') {
    for (const id of next.turnOrder) {
      const w = next.walk[id];
      if (!w?.confirmed || !w.doorId) continue;
      const was = prev.roundNo === next.roundNo && prev.stage === 'choosing' ? prev.walk[id] : undefined;
      if (was?.confirmed) continue;
      const fails = failsAt(next, w.doorId);
      if (fails >= DOOR_FAILS_MIN) out.push({ event: { kind: 'dare', player: id, door: doorTitle(next, w.doorId), fails }, result: false });
    }
  }

  // Ergebnis: einmal je Fragerunde, sobald es da ist.
  const fresh = next.stage === 'result' && (prev.stage !== 'result' || prev.roundNo !== next.roundNo);
  if (!fresh || !next.results) return out;
  const results = next.turnOrder.filter((id) => next.results?.[id]).map((id) => [id, next.results![id]!] as const);
  const push = (event: DungeonTickerEvent) => out.push({ event, result: true });

  // Neue Räume: wer als Erster weiter ist als alle anderen vorher.
  const before = Math.max(0, ...Object.values(prev.players).map((p) => (p.status === 'out' ? -1 : p.room)));
  const deepest = Math.max(0, ...Object.values(next.players).filter((p) => p.status === 'in').map((p) => p.room));

  for (const [id, r] of results) {
    const p = next.players[id];
    if (!p) continue;
    if (r.correct && p.status === 'out') {
      const place = next.ranking.find((x) => x.playerId === id)?.place ?? 1;
      push({ kind: 'exit', player: id, place });
    } else if (!r.correct && p.status === 'eliminated') push({ kind: 'eliminated', player: id });
  }

  if (deepest > before && deepest >= 1) {
    const leaders = results.filter(([id, r]) => r.correct && next.players[id]?.status === 'in' && next.players[id]?.room === deepest);
    if (leaders.length === 1) push({ kind: 'first', player: leaders[0]![0], room: deepest });
  }

  // Berüchtigte Türen: nur Türen, an denen in dieser Runde jemand gescheitert ist.
  const failedDoors = [...new Set(results.filter(([, r]) => !r.correct).map(([, r]) => r.doorId))];
  for (const doorId of failedDoors) {
    const fails = failsAt(next, doorId);
    if (fails >= DOOR_FAILS_MIN) push({ kind: 'doorFails', door: doorTitle(next, doorId), fails });
  }

  if (results.length >= 2 && results.every(([, r]) => !r.correct)) push({ kind: 'allWrong', count: results.length });
  return out;
}
