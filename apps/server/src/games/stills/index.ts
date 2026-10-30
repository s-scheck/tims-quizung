import type { GameModule } from '../registry.ts';
import { hostLeavesRound } from '../common.ts';
import { handleStillsMessage, onPlayerRemoved, startStillsRound, STILLS_NAME } from './reducer.ts';
import { stillsRoundView } from './view.ts';

export const stillsGame: GameModule = {
  id: 'stills',
  name: STILLS_NAME,
  description: 'Fünf Fotos aus einem Film, vom schwersten zum leichtesten. Wer den Film früher erkennt, bekommt mehr Punkte. Getippt oder gebuzzert.',
  turnBased: false,
  needsCategory: true,
  startRound: startStillsRound,
  handle: handleStillsMessage,
  onHostChanged: hostLeavesRound,
  onPlayerRemoved,
  roundView: stillsRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
