import type { RoomView, ShowRevealView } from '@quiz/shared';
import { client } from './client.svelte.ts';

/** Schritt, bis zu dem ein Spieler aufgedeckt ist. Ohne Show-Auflösung ist alles offen. */
export function revealStep(show: ShowRevealView | undefined, playerId: string): number {
  return show ? (show.players[playerId] ?? 0) : Number.POSITIVE_INFINITY;
}

/** Darf dieses Gerät gerade aufdecken? Nur der Host in der Auflösung einer Show-Runde. */
export function canReveal(view: RoomView, show: ShowRevealView | undefined, readonly: boolean): boolean {
  return !readonly && !!show && client.isHost && view.phase === 'reveal';
}

/** Platznummern gibt es erst, wenn alles aufgedeckt ist. Der Moderator sieht sie immer. */
export function ranksVisible(show: ShowRevealView | undefined, moderator: boolean): boolean {
  return !show || show.complete || moderator;
}

/** Spieler, die seit dem letzten Stand einen Schritt weiter aufgedeckt wurden. */
export function newlyRevealed(prev: Record<string, number>, next: Record<string, number>): string[] {
  return Object.keys(next).filter((id) => (next[id] ?? 0) > (prev[id] ?? 0));
}

/** Wie viele Teilnehmer vollständig aufgedeckt sind. */
export function revealedCount(show: ShowRevealView, turnOrder: string[]): number {
  return turnOrder.filter((id) => (show.players[id] ?? 0) >= show.steps).length;
}

export function revealPlayer(playerId: string): void {
  client.send({ type: 'reveal_player', playerId });
}

export function revealSolution(): void {
  client.send({ type: 'reveal_solution' });
}

export function revealAll(): void {
  client.send({ type: 'reveal_all' });
}
