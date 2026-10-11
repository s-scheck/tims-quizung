import type { GameModule } from '../registry.ts';
import { handleTimelineMessage, onPlayerRemoved, startTimelineRound } from './reducer.ts';
import { timelineRoundView } from './view.ts';

export const timelineGame: GameModule = {
  id: 'timeline',
  name: 'Zeitstrahl',
  description: 'Alle tippen gleichzeitig auf dem Zeitstrahl, wann ein Ereignis war. Wer liegt am nächsten dran?',
  turnBased: false,
  startRound: startTimelineRound,
  handle: handleTimelineMessage,
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: timelineRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
