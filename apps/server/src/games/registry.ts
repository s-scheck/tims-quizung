import type { ClientMsg } from '@quiz/shared';
import type { Room } from '../rooms/room.ts';
import type { Result } from '../rooms/result.ts';
import type { RoundView } from '@quiz/shared';

/** Ein Spiel der Suite. Der Raum kümmert sich um Spieler, Host und Scores, das Modul um die Runde. */
export interface GameModule {
  id: string;
  name: string;
  start(room: Room): void;
  handle(room: Room, playerId: string, msg: ClientMsg): Result;
  onPlayerRemoved(room: Room, playerId: string): void;
  roundView(room: Room, revealed: boolean): RoundView | null;
}

const games = new Map<string, GameModule>();

export function registerGame(game: GameModule): void {
  games.set(game.id, game);
}

export function getGame(id: string): GameModule | undefined {
  return games.get(id);
}

export function listGames(): GameModule[] {
  return [...games.values()];
}
