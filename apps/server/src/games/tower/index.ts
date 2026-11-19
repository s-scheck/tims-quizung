import type { GameModule } from '../registry.ts';
import { handleTowerMessage, onPlayerRemoved, startTowerRound } from './reducer.ts';
import { towerRoundView } from './view.ts';

export const towerGame: GameModule = {
  id: 'tower',
  name: 'Hochstapler',
  description: 'Jeder stapelt auf dem Handy seinen eigenen wackligen Turm. Wer zuerst ruhig über der Ziellinie steht, gewinnt.',
  turnBased: false,
  needsCategory: false,
  startRound: startTowerRound,
  handle: handleTowerMessage,
  // Ein nachrückender Host spielt mit und baut einfach an seinem Turm weiter.
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: towerRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
