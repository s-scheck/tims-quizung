import type { GameModule } from '../registry.ts';
import { handleRiskMessage, onPlayerRemoved, startRiskRound } from './reducer.ts';
import { riskRoundView } from './view.ts';

export const riskGame: GameModule = {
  id: 'risk',
  name: 'No Risk No Fun',
  description: 'Alle nennen geheim einen Eintrag aus einer Top-50-Liste. Je tiefer der Platz, desto mehr Punkte, aber daneben ist daneben.',
  turnBased: false,
  needsCategory: true,
  startRound: startRiskRound,
  handle: handleRiskMessage,
  onHostChanged: () => {},
  onPlayerRemoved,
  roundView: riskRoundView,
  isBusy: () => false,
  isRoundComplete: () => false,
  penalizeActive: () => {},
  clearTurn: () => {},
  onReveal: () => {},
};
