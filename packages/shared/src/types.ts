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

export type SortOrder = 'asc' | 'desc';
export type TimerSeconds = 0 | 30 | 60;
export const TIMER_OPTIONS: readonly TimerSeconds[] = [0, 30, 60];
export type PlacementStatus = 'pending' | 'correct' | 'wrong';
export type Role = 'player' | 'screen';

export interface RoomSettings {
  timerSeconds: TimerSeconds;
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

export interface RoundView {
  category: CategoryInfo;
  cards: CardView[];
  chain: string[];
  pool: string[];
  startCardId: string;
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  selection: Selection;
  placement: PlacementView | null;
  turnDeadline: number | null;
  soloMode: boolean;
  /** Karten-IDs in der richtigen Reihenfolge, nur ab der Auflösung. */
  solution?: string[];
}

export interface RoundResult {
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
  gameId: string | null;
  round: RoundView | null;
  rounds: RoundResult[];
  /** Nur in `choosing_category` enthalten. */
  categories?: CategorySummary[];
}
