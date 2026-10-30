import type { GameModule } from '../registry.ts';
import { handleSongsMessage, onPlayerRemoved, startSongsRound } from './reducer.ts';
import { songsRoundView } from './view.ts';

export const songsGame: GameModule = {
  id: 'songs',
  name: 'Songs erraten',
  description: 'Ein Ausschnitt läuft, alle tippen Titel und Interpret. Je ein Punkt für Titel und Interpret.',
  turnBased: false,
  needsCategory: true,
  startRound: startSongsRound,
  handle: handleSongsMessage,
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: songsRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
