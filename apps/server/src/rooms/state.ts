import type { GuessStatus, MatchSelection, PlacementStatus, Selection } from '@quiz/shared';
import type { Category, PairsCategory, PlacesCategory, RankedCategory } from '@quiz/content';

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
  category: RankedCategory;
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
  category: RankedCategory;
  cards: TopXCard[];
  /** Rang → Spieler, der die Karte aufgedeckt hat. */
  revealed: Record<number, string>;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; text: string }[];
  guess: Guess | null;
}

// ----------------------------------------------------------------- Zuordnen

export interface MatchCard {
  id: string;
  text: string;
}

export interface MatchTarget {
  id: string;
  text: string;
  /** null = Köder ohne passende Karte. */
  solutionCardId: string | null;
}

export interface MatchAttempt {
  cardId: string;
  targetId: string;
  /** Position im Pool vor dem Zug, dorthin kehrt die Karte bei Fehler zurück. */
  poolIndex: number;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

export interface MatchRound extends BaseRound {
  game: 'match';
  category: PairsCategory;
  cards: MatchCard[];
  pool: string[];
  targets: MatchTarget[];
  /** Ziel-ID → zugeordnete Karte und wer sie gelegt hat. */
  matched: Record<string, { cardId: string; by: string }>;
  selection: MatchSelection;
  attempt: MatchAttempt | null;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
}

// -------------------------------------------------------------------- Karte

export interface MapPin {
  lat: number;
  lng: number;
  confirmed: boolean;
}

export interface MapRound extends BaseRound {
  game: 'map';
  category: PlacesCategory;
  target: { id: string; name: string; lat: number; lng: number };
  borders: boolean;
  /** Spieler-ID → Pin. Nur bestätigte zählen in der Auflösung. */
  pins: Record<string, MapPin>;
}

export type Round = SortRound | TopXRound | MatchRound | MapRound;
