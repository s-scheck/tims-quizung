import type { GameModule } from '../registry.ts';
import { clearTurn, handleMatchMessage, isBusy, isRoundComplete, onReveal, penalizeActive, startMatchRound } from './reducer.ts';
import { matchRoundView } from './view.ts';

export const matchGame: GameModule = {
  id: 'match',
  name: 'Zuordnen',
  description: 'Karten den richtigen Zielen zuordnen. Einige Ziele sind Köder, Fehler kosten Leben.',
  hasPrivateView: true,
  startRound: startMatchRound,
  handle: handleMatchMessage,
  onHostChanged: () => {},
  roundView: matchRoundView,
  isBusy,
  isRoundComplete,
  penalizeActive,
  clearTurn,
  onReveal,
};
