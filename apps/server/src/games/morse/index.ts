import type { GameModule } from '../registry.ts';
import { handleMorseMessage, onPlayerRemoved, onReveal, startMorseRound } from './reducer.ts';
import { morseRoundView } from './view.ts';

export const morseGame: GameModule = {
  id: 'morse',
  name: 'Morse',
  description: 'Der Host morst ein Wort an seinem Gerät, alle raten. Die drei Schnellsten bekommen 3, 2 und 1 Punkt.',
  turnBased: false,
  needsCategory: false,
  startRound: startMorseRound,
  handle: handleMorseMessage,
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: morseRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal,
};
