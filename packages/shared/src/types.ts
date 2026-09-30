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

export type GameId = 'sort' | 'topx';
export const GAME_IDS: readonly GameId[] = ['sort', 'topx'];

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

export interface CategorySummary {
  id: string;
  title: string;
  question: string;
  count: number;
  played: boolean;
  games: GameId[];
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

/** Felder, die jede Runde unabhängig vom Spiel hat. */
export interface BaseRoundView {
  category: CategoryInfo;
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  turnDeadline: number | null;
  soloMode: boolean;
}

export interface SortRoundView extends BaseRoundView {
  game: 'sort';
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

export type RoundView = SortRoundView | TopXRoundView;

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
  /** Zuletzt gewählte Leben für Top X. */
  topxLives: number;
  /** Nur in `choosing_category` enthalten. */
  categories?: CategorySummary[];
  /** Nur in `choosing_category` enthalten. */
  games?: GameInfo[];
}
