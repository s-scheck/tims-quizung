import type { GameModule } from '../registry.ts';
import { handleStillsMessage, onHostChanged, onPlayerRemoved, startStillsRound } from './reducer.ts';
import { stillsRoundView } from './view.ts';

export const stillsGame: GameModule = {
  id: 'stills',
  name: 'Filmfotos',
  description: 'Fünf Fotos aus einem Film, vom schwersten zum leichtesten. Wer den Film früher erkennt, bekommt mehr Punkte. Getippt oder gebuzzert.',
  turnBased: false,
  needsCategory: true,
  startRound: startStillsRound,
  handle: handleStillsMessage,
  onHostChanged,
  onPlayerRemoved,
  roundView: stillsRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
