import type { GuessStatus, PlacementStatus, Selection } from '@quiz/shared';
import type { Category } from '@quiz/content';

export interface Player {
  id: string;
  name: string;
  token: string;
  order: number;
  connected: boolean;
}

/** Felder, die jede Runde unabhängig vom Spiel hat. `games/common.ts` arbeitet nur damit. */
export interface BaseRound {
  category: Category;
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  turnDeadline: number | null;
  soloMode: boolean;
}

// ---------------------------------------------------------------- Sortieren

export interface SortCard {
  id: string;
  name: string;
  value: number;
  label?: string;
}

export interface Placement {
  cardId: string;
  gapIndex: number;
  /** Position im Pool vor dem Zug, dorthin kehrt die Karte bei Fehler zurück. */
  poolIndex: number;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

export interface SortRound extends BaseRound {
  game: 'sort';
  cards: SortCard[];
  startCardId: string;
  chain: string[];
  pool: string[];
  selection: Selection;
  placement: Placement | null;
}

// -------------------------------------------------------------------- Top X

export interface TopXCard {
  rank: number;
  name: string;
  value: number;
  label?: string;
  aliases: string[];
}

export interface Guess {
  by: string;
  text: string;
  status: GuessStatus;
  /** Treffer des Abgleichs auf eine noch verdeckte Karte, sonst null. */
  matchRank: number | null;
  resolveAt: number | null;
  applyAt: number | null;
}

export interface TopXRound extends BaseRound {
  game: 'topx';
  cards: TopXCard[];
  /** Rang → Spieler, der die Karte aufgedeckt hat. */
  revealed: Record<number, string>;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; text: string }[];
  guess: Guess | null;
}

export type Round = SortRound | TopXRound;
