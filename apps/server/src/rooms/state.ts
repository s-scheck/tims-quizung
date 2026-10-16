import type { BluffStage, GuessStatus, MatchSelection, PlacementStatus, RiskRules, Selection } from '@quiz/shared';
import type { Category, EventsCategory, PairsCategory, PlacesCategory, PromptsCategory, RankedCategory, TimelineEvent } from '@quiz/content';

export interface Player {
  id: string;
  name: string;
  token: string;
  order: number;
  connected: boolean;
}

/** Ersatz für Spiele ohne Kategorie aus der Liste, damit Auflösung und Punkte einheitlich bleiben. */
export interface PseudoCategory {
  kind: 'none';
  id: string;
  title: string;
}

/** Felder, die jede Runde unabhängig vom Spiel hat. `games/common.ts` arbeitet nur damit. */
export interface BaseRound {
  category: Category | PseudoCategory;
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

// ---------------------------------------------------------------- Zeitstrahl

export interface TimelineGuess {
  year: number;
  confirmed: boolean;
}

export interface TimelineRound extends BaseRound {
  game: 'timeline';
  category: EventsCategory;
  target: TimelineEvent;
  /** Spieler-ID → Tipp. Nur bestätigte zählen in der Auflösung. */
  guesses: Record<string, TimelineGuess>;
}

// ---------------------------------------------------------- No Risk No Fun

export interface RiskGuess {
  text: string;
  /** Getroffener Platz oder null. Vom Server vorgeschlagen, vom Host korrigierbar. */
  rank: number | null;
}

export interface RiskPass {
  /** Spieler-ID → eingeloggter Tipp. Wer fehlt, hat keinen Tipp abgegeben. */
  guesses: Record<string, RiskGuess>;
}

export interface RiskRound extends BaseRound {
  game: 'risk';
  category: RankedCategory;
  rules: RiskRules;
  /** Alle Durchgänge, der laufende zuletzt. */
  passes: RiskPass[];
}

// -------------------------------------------------------------------- Bluff

export interface BluffEntry {
  /** Opake ID, verrät nichts über den Autor. */
  id: string;
  /** null = die echte Antwort. */
  authorId: string | null;
}

export interface BluffRound extends BaseRound {
  game: 'bluff';
  category: PromptsCategory;
  prompt: { id: string; name: string; answer: string };
  stage: BluffStage;
  texts: Record<string, string>;
  /** Spieler-ID → Eintrags-ID. */
  votes: Record<string, string>;
  /** Gemischte Einträge, entstehen beim Wechsel zur Abstimmung. */
  entries: BluffEntry[];
}

// -------------------------------------------------------------------- Morse

export interface MorseAttempt {
  text: string;
  at: number;
  correct: boolean;
}

export interface MorseRound extends BaseRound {
  game: 'morse';
  category: PseudoCategory;
  /** Normalisiertes Wort, z. B. „HALLO WELT“. */
  word: string;
  code: string;
  startedAt: number;
  attempts: Record<string, MorseAttempt[]>;
  /** Spieler-ID → Zeitpunkt der Lösung. */
  solved: Record<string, number>;
  plays: number;
  /** Laufende bzw. letzte Wiedergabe, nach der alle Geräte blinken. */
  playback: { id: number; startAt: number; unitMs: number } | null;
  lightShown: boolean;
  codeShown: boolean;
  tableShown: boolean;
}

export type Round = SortRound | TopXRound | MatchRound | MapRound | TimelineRound | RiskRound | BluffRound | MorseRound;
