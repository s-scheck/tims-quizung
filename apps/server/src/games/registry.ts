import type { ClientMsg, GameId, RoundView } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../rooms/room.ts';
import type { Result } from '../rooms/result.ts';

export interface StartRoundOptions {
  lives?: number;
}

/**
 * Ein Spiel der Suite. Der Raum kümmert sich um Spieler, Host, Scores und Lobby,
 * `games/common.ts` um Timer, Host-Entscheidung, Auflösung und Punkte,
 * das Modul um die eigentliche Runde.
 */
export interface GameModule {
  id: GameId;
  name: string;
  description: string;
  /** Sieht der moderierende Host mehr als alle anderen? Dann bekommt er eine eigene Sicht. */
  hasPrivateView: boolean;
  startRound(room: Room, category: Category, opts: StartRoundOptions): Result;
  /** Spielspezifische Nachrichten. Gemeinsame behandelt `games/common.ts` vorher. */
  handle(room: Room, playerId: string, msg: ClientMsg): Result;
  /** Der Host hat gewechselt, der neue Host spielt mit. */
  onHostChanged(room: Room): void;
  roundView(room: Room, revealed: boolean, viewerId: string | null): RoundView | null;
  /** Läuft gerade eine Auflösung (Platzierung, Tipp), die keinen neuen Zug erlaubt? */
  isBusy(room: Room): boolean;
  /** Ist die Runde inhaltlich fertig (alle Karten gelegt bzw. aufgedeckt)? */
  isRoundComplete(room: Room): boolean;
  /** Bestraft den aktiven Spieler (Timer-Ablauf, Überspringen). */
  penalizeActive(room: Room): void;
  /** Verwirft die Eingaben des laufenden Zugs. */
  clearTurn(room: Room): void;
  /** Räumt vor der Auflösung auf. */
  onReveal(room: Room): void;
}

const games = new Map<GameId, GameModule>();

export function registerGame(game: GameModule): void {
  games.set(game.id, game);
}

export function getGame(id: string): GameModule | undefined {
  return games.get(id as GameId);
}

export function listGames(): GameModule[] {
  return [...games.values()];
}
