import type { GameModule } from '../registry.ts';
import { clearTurn, handleSortMessage, isBusy, isRoundComplete, onReveal, penalizeActive, startSortRound } from './reducer.ts';
import { sortRoundView } from './view.ts';

export const sortGame: GameModule = {
  id: 'sort',
  name: 'Sortieren',
  description: 'Karten reihum in eine Kette einsortieren. Wer falsch legt, ist raus.',
  turnBased: true,
  startRound: (room, category) => startSortRound(room, category),
  handle: handleSortMessage,
  onHostChanged: () => {},
  roundView: (room, revealed) => sortRoundView(room, revealed),
  isBusy,
  isRoundComplete,
  penalizeActive,
  clearTurn,
  onReveal,
};
