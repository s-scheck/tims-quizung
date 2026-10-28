import type { GameModule } from '../registry.ts';
import { handleFacesMessage, onHostChanged, onPlayerRemoved, startFacesRound } from './reducer.ts';
import { facesRoundView } from './view.ts';

export const facesGame: GameModule = {
  id: 'faces',
  name: 'Wer ist das?',
  description: 'Ein Promi-Foto, verschwommen, verpixelt oder hinter Kacheln. Der Host gibt es Stück für Stück frei, alle raten um die Wette.',
  turnBased: false,
  needsCategory: true,
  startRound: startFacesRound,
  handle: handleFacesMessage,
  onHostChanged,
  onPlayerRemoved,
  roundView: facesRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
