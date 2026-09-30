import { registerGame } from './registry.ts';
import { sortGame } from './sort/index.ts';
import { topxGame } from './topx/index.ts';

registerGame(sortGame);
registerGame(topxGame);

export { sortGame, topxGame };
