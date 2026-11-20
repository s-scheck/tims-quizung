import { DUNGEON_RESULT_MS, type DungeonRoundView } from '@quiz/shared';
import { client } from '../../lib/client.svelte.ts';
import { DUNGEON_STAGGER_MS, DUNGEON_SUSPENSE_MS } from './dungeonFeedback.ts';

/**
 * Dungeon: gemeinsamer Takt für Szene und Klang im Ergebnis. Erst Spannung (alle Türen zu), dann je Spieler
 * gestaffelt die Auflösung. Szene und Handy-Klang rechnen mit denselben Zahlen, damit Bild und Ton zusammenpassen.
 */

/** So lange läuft eine einzelne Auflösung (Tür auf und hindurch, oder zuschlagen und zurückstoßen). */
export const DUNGEON_REVEAL_MS = 1100;

/**
 * Reihenfolge der Auflösung in einem Raum: der eigene Spieler zuerst (dann passt der Text auf dem Handy zur
 * eigenen Tür), danach in Zugreihenfolge.
 */
export function dungeonRevealOrder(round: DungeonRoundView, roomIndex: number, meId: string | null): string[] {
  const ids = round.turnOrder.filter((id) => round.results?.[id]?.room === roomIndex);
  if (meId && ids.includes(meId)) return [meId, ...ids.filter((id) => id !== meId)];
  return ids;
}

/** Ab Beginn des Ergebnisses: wann die Auflösung für den k-ten Spieler kommt. */
export function dungeonRevealAt(k: number): number {
  return DUNGEON_SUSPENSE_MS + k * DUNGEON_STAGGER_MS;
}

/** Wie lange das Ergebnis schon steht (lokale ms), aus `nextAt` und Serverzeit; null, wenn unbekannt. */
export function dungeonResultElapsed(round: DungeonRoundView): number | null {
  if (round.stage !== 'result' || round.nextAt === null) return null;
  return client.serverNow() - (round.nextAt - DUNGEON_RESULT_MS);
}

/**
 * Entscheidet, ab wann die Ergebnis-Animation läuft (lokale Zeit in ms) oder ob gleich der Endzustand gilt (null).
 * `live`: der Wechsel auf `result` wurde gerade miterlebt. Sonst (Neuladen, später geöffnet) nur, wenn die
 * Spannung noch kaum angefangen hat; mittendrin wird nicht noch einmal von vorn gezittert.
 */
export function dungeonAnimationStart(round: DungeonRoundView, live: boolean): number | null {
  if (reducedMotion()) return null;
  const now = Date.now();
  const elapsed = dungeonResultElapsed(round);
  if (live) return now - Math.min(Math.max(elapsed ?? 0, 0), 250);
  if (elapsed !== null && elapsed >= 0 && elapsed < DUNGEON_SUSPENSE_MS * 0.6) return now - elapsed;
  return null;
}

export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
