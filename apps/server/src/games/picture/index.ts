import type { GameModule } from '../registry.ts';
import {
  clearTurn,
  handlePictureMessage,
  isBusy,
  isRevealComplete,
  isRoundComplete,
  isTurnBasedRound,
  onHostChanged,
  onPlayerRemoved,
  onReveal,
  penalizeActive,
  startPictureRound,
} from './reducer.ts';
import { pictureRoundView } from './view.ts';

export const pictureGame: GameModule = {
  id: 'picture',
  name: 'Bilderrätsel',
  description: 'Ein Bild mit verdeckten Stellen. Reihum nennt einer eine Nummer und tippt, was dort fehlt, oder alle füllen gleichzeitig jedes Feld aus. Der Host entscheidet.',
  turnBased: isTurnBasedRound,
  needsCategory: true,
  startRound: startPictureRound,
  handle: handlePictureMessage,
  onHostChanged,
  onPlayerRemoved,
  roundView: pictureRoundView,
  isBusy,
  isRoundComplete,
  isRevealComplete,
  penalizeActive,
  clearTurn,
  onReveal,
};
