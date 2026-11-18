import type { GameModule } from '../registry.ts';
import { handleSplashMessage, onHostChanged, onPlayerRemoved, startSplashRound } from './reducer.ts';
import { splashRoundView } from './view.ts';

export const splashGame: GameModule = {
  id: 'splash',
  name: 'Splash!',
  description: 'Richtig antworten, dann mit der Farbkanone aufs gemeinsame Feld schießen. Am Ende zählt die sichtbare Fläche.',
  turnBased: false,
  needsCategory: true,
  startRound: startSplashRound,
  handle: handleSplashMessage,
  onHostChanged,
  onPlayerRemoved,
  roundView: splashRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
