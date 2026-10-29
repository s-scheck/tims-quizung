import type { GameModule } from '../registry.ts';
import { handleKidsMessage, onHostChanged, onPlayerRemoved, startKidsRound } from './reducer.ts';
import { kidsRoundView } from './view.ts';

export const kidsGame: GameModule = {
  id: 'kids',
  name: 'Kinderpromis',
  description: 'Kinderfotos von Promis, der Host zeigt eins nach dem anderen. Entweder tippen alle gleichzeitig um die Wette, oder einer buzzert und sagt den Namen laut.',
  turnBased: false,
  needsCategory: true,
  startRound: startKidsRound,
  handle: handleKidsMessage,
  onHostChanged,
  onPlayerRemoved,
  roundView: kidsRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
