import type { GameModule } from '../registry.ts';
import { handleBluffMessage, onPlayerRemoved, startBluffRound } from './reducer.ts';
import { bluffRoundView } from './view.ts';

export const bluffGame: GameModule = {
  id: 'bluff',
  name: 'Bluff',
  description: 'Alle erfinden eine glaubwürdige Antwort, dann wird abgestimmt. Täuschen bringt Punkte, die Wahrheit erkennen auch.',
  turnBased: false,
  needsCategory: true,
  showReveal: { steps: 1, solutionRequired: true },
  startRound: startBluffRound,
  handle: handleBluffMessage,
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: bluffRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
