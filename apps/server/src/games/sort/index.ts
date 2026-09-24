import { registerGame, type GameModule } from '../registry.ts';
import { handleSortMessage, onPlayerRemoved, startSortGame } from './reducer.ts';
import { sortRoundView } from './view.ts';

export const SORT_GAME_ID = 'sort';

export const sortGame: GameModule = {
  id: SORT_GAME_ID,
  name: 'Sortieren',
  start: startSortGame,
  handle: handleSortMessage,
  onPlayerRemoved,
  roundView: sortRoundView,
};

registerGame(sortGame);
