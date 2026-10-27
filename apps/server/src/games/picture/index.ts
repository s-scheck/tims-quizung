import type { GameModule } from '../registry.ts';
import { clearTurn, handlePictureMessage, isBusy, isRoundComplete, onHostChanged, onReveal, penalizeActive, startPictureRound } from './reducer.ts';
import { pictureRoundView } from './view.ts';

export const pictureGame: GameModule = {
  id: 'picture',
  name: 'Bilderrätsel',
  description: 'Ein Bild mit verdeckten Stellen. Wer dran ist, nennt eine Nummer und tippt, was dort fehlt. Der Host entscheidet.',
  turnBased: true,
  needsCategory: true,
  startRound: startPictureRound,
  handle: handlePictureMessage,
  onHostChanged,
  roundView: pictureRoundView,
  isBusy,
  isRoundComplete,
  penalizeActive,
  clearTurn,
  onReveal,
};
