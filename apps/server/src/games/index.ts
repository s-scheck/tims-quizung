import { registerGame } from './registry.ts';
import { sortGame } from './sort/index.ts';
import { topxGame } from './topx/index.ts';
import { matchGame } from './match/index.ts';

registerGame(sortGame);
registerGame(topxGame);
registerGame(matchGame);

export { sortGame, topxGame, matchGame };
