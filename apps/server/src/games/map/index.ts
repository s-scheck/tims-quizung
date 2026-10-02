import type { GameModule } from '../registry.ts';
import { handleMapMessage, onPlayerRemoved, startMapRound } from './reducer.ts';
import { mapRoundView } from './view.ts';

export const mapGame: GameModule = {
  id: 'map',
  name: 'Karte',
  description: 'Alle setzen gleichzeitig einen Pin auf der stummen Weltkarte. Wer liegt am nächsten dran?',
  turnBased: false,
  startRound: startMapRound,
  handle: handleMapMessage,
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: mapRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
