/** Phasen eines Raums. Ein flaches Modell, kein verschachteltes Spiel-Phasenfeld. */
export type Phase =
  | 'lobby'
  | 'choosing_category'
  | 'playing'
  | 'host_decision'
  | 'reveal'
  | 'scoring'
  | 'scoreboard'
  | 'finished';

export type GameId = 'sort' | 'topx' | 'match' | 'map';
export const GAME_IDS: readonly GameId[] = ['sort', 'topx', 'match', 'map'];

export type SortOrder = 'asc' | 'desc';
export type TimerSeconds = 0 | 30 | 60;
export const TIMER_OPTIONS: readonly TimerSeconds[] = [0, 30, 60];
export type PlacementStatus = 'pending' | 'correct' | 'wrong';
export type GuessStatus = 'judging' | 'pending' | 'correct' | 'wrong';
export type Role = 'player' | 'screen';

export const LIVES_MIN = 1;
export const LIVES_MAX = 5;
export const LIVES_DEFAULT = 3;
export const GUESS_MAX_LENGTH = 60;

export interface RoomSettings {
  timerSeconds: TimerSeconds;
  /** false: der Host moderiert nur, spielt nicht mit und taucht nicht in der Wertung auf. */
  hostPlays: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  order: number;
  connected: boolean;
}

/** Karte aus Sicht der Clients. `value` und `label` gibt es erst ab der Auflösung. */
export interface CardView {
  id: string;
  name: string;
  value?: number;
  label?: string;
}

export interface CategoryInfo {
  id: string;
  title: string;
  question: string;
  topLabel: string;
  bottomLabel: string;
  unit: string;
  order: SortOrder;
  source?: string;
  /** `plain` unterdrückt Tausendertrennzeichen, z. B. bei Jahreszahlen. */
  valueFormat?: 'grouped' | 'plain';
}

export interface MapTargetSummary {
  id: string;
  name: string;
  played: boolean;
}

export interface CategorySummary {
  id: string;
  title: string;
  question: string;
  count: number;
  played: boolean;
  games: GameId[];
  /** Nur bei Ortslisten und nur in der Sicht des Hosts: wählbare Ziele. */
  targets?: MapTargetSummary[];
}

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
}

export interface Selection {
  cardId?: string;
  gapIndex?: number;
}

export interface PlacementView {
  cardId: string;
  gapIndex: number;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

/** Kategorie eines Zuordnen-Spiels: Paare und Köder, ohne Werte. */
export interface MatchCategoryInfo {
  id: string;
  title: string;
  question: string;
  leftLabel: string;
  rightLabel: string;
  source?: string;
}

/** Felder, die jede Runde unabhängig vom Spiel hat. */
export interface BaseRoundView {
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  turnDeadline: number | null;
  soloMode: boolean;
}

export interface SortRoundView extends BaseRoundView {
  game: 'sort';
  category: CategoryInfo;
  cards: CardView[];
  chain: string[];
  pool: string[];
  startCardId: string;
  selection: Selection;
  placement: PlacementView | null;
  /** Karten-IDs in der richtigen Reihenfolge, nur ab der Auflösung. */
  solution?: string[];
}

export interface TopXSlotView {
  rank: number;
  revealed: boolean;
  name?: string;
  value?: number;
  label?: string;
  revealedBy?: string;
}

export interface GuessView {
  by: string;
  text: string;
  status: GuessStatus;
  /** Vorschlag bzw. Treffer des Servers, null wenn kein Treffer. */
  matchRank: number | null;
  resolveAt: number | null;
  applyAt: number | null;
}

export interface TopXRoundView extends BaseRoundView {
  game: 'topx';
  category: CategoryInfo;
  slots: TopXSlotView[];
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  wrongGuesses: { by: string; text: string }[];
  guess: GuessView | null;
  /** true: der moderierende Host prüft Tipps von Hand. */
  hostJudges: boolean;
  /** Nur in der Sicht des moderierenden Hosts: alle Slots sind gefüllt. */
  privileged?: boolean;
}

export interface MatchCardView {
  id: string;
  text: string;
}

export interface MatchTargetView {
  id: string;
  text: string;
  matchedCardId: string | null;
  matchedBy?: string;
  /** Nur in der Host-Sicht oder ab der Auflösung. */
  solutionCardId?: string | null;
  /** Nur in der Host-Sicht oder ab der Auflösung: Ziel ohne passende Karte. */
  decoy?: boolean;
}

export interface MatchSelection {
  cardId?: string;
  targetId?: string;
}

export interface MatchAttemptView {
  cardId: string;
  targetId: string;
  status: PlacementStatus;
  by: string;
  resolveAt: number;
  applyAt: number;
}

export interface MatchRoundView extends BaseRoundView {
  game: 'match';
  category: MatchCategoryInfo;
  cards: MatchCardView[];
  pool: string[];
  targets: MatchTargetView[];
  selection: MatchSelection;
  attempt: MatchAttemptView | null;
  lives: Record<string, number>;
  maxLives: number;
  hits: Record<string, number>;
  /** Nur in der Sicht des moderierenden Hosts: Lösung und Köder sind sichtbar. */
  privileged?: boolean;
}

/** Süd-West- und Nord-Ost-Ecke: [[south, west], [north, east]]. */
export type LatLngBounds = [[number, number], [number, number]];

export interface MapCategoryInfo {
  id: string;
  title: string;
  question: string;
  source?: string;
  /** Startausschnitt der Karte, Standard ist die Welt. */
  bounds?: LatLngBounds;
}

export interface MapPinView {
  playerId: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

export interface MapRoundView extends BaseRoundView {
  game: 'map';
  category: MapCategoryInfo;
  targetName: string;
  /** Zielkoordinaten, nur für den Moderator oder ab der Auflösung. */
  target?: { lat: number; lng: number };
  borders: boolean;
  /** Spieler, die ihren Pin bestätigt haben. */
  confirmed: string[];
  /** Nur der eigene Pin des Betrachters. */
  myPin?: { lat: number; lng: number; confirmed: boolean };
  /** Ab der Auflösung: alle bestätigten Pins mit Entfernung. */
  pins?: MapPinView[];
  /** Ab der Auflösung: Teilnehmer nach Entfernung, ohne Pin hinten mit null. */
  ranking?: { playerId: string; distanceKm: number | null }[];
  privileged?: boolean;
}

export type RoundView = SortRoundView | TopXRoundView | MatchRoundView | MapRoundView;

export interface RoundResult {
  gameId: GameId;
  categoryId: string;
  categoryTitle: string;
  survivors: string[];
  eliminatedOrder: string[];
  scores: Record<string, number>;
}

export interface RoomView {
  code: string;
  hostId: string | null;
  players: PlayerView[];
  settings: RoomSettings;
  scores: Record<string, number>;
  phase: Phase;
  gameId: GameId | null;
  round: RoundView | null;
  rounds: RoundResult[];
  /** Zuletzt gewählte Leben, Vorgabe für Top X und Zuordnen. */
  defaultLives: number;
  /** Zuletzt gewählte Grenzen-Einstellung für Karte. */
  mapBorders: boolean;
  /** Nur in `choosing_category` enthalten. */
  categories?: CategorySummary[];
  /** Nur in `choosing_category` enthalten. */
  games?: GameInfo[];
}
