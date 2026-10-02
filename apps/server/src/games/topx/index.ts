import type { GameModule } from '../registry.ts';
import { clearTurn, handleTopXMessage, isBusy, isRoundComplete, onHostChanged, onReveal, penalizeActive, startTopXRound } from './reducer.ts';
import { topxRoundView } from './view.ts';

export const topxGame: GameModule = {
  id: 'topx',
  name: 'Top X',
  description: 'Eine verdeckte Top-Liste erraten. Fehltipps kosten Leben.',
  turnBased: true,
  startRound: startTopXRound,
  handle: handleTopXMessage,
  onHostChanged,
  roundView: topxRoundView,
  isBusy,
  isRoundComplete,
  penalizeActive,
  clearTurn,
  onReveal,
};
