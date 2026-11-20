import type { GameModule } from '../registry.ts';
import { handleDungeonMessage, onHostChanged, onPlayerRemoved, startDungeonRound } from './reducer.ts';
import { dungeonRoundView } from './view.ts';

export const dungeonGame: GameModule = {
  id: 'dungeon',
  name: 'Dungeon',
  description: 'Alle wählen gleichzeitig eine Tür mit Wissensgebiet. Richtig heißt nächster Raum, falsch heißt Tür zu. Wer zuerst draußen ist, gewinnt.',
  turnBased: false,
  needsCategory: false,
  startRound: startDungeonRound,
  handle: handleDungeonMessage,
  onHostChanged,
  onPlayerRemoved,
  roundView: dungeonRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
