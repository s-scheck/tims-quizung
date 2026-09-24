import type { PlacementStatus, Selection } from '@quiz/shared';
import type { Category } from '@quiz/content';

export interface Player {
  id: string;
  name: string;
  token: string;
  order: number;
  connected: boolean;
}

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

export interface SortRound {
  category: Category;
  cards: SortCard[];
  startCardId: string;
  chain: string[];
  pool: string[];
  turnOrder: string[];
  turnNo: number;
  activePlayerId: string | null;
  eliminated: string[];
  selection: Selection;
  placement: Placement | null;
  turnDeadline: number | null;
  soloMode: boolean;
}
