import { registerGame } from './registry.ts';
import { sortGame } from './sort/index.ts';
import { topxGame } from './topx/index.ts';
import { matchGame } from './match/index.ts';
import { mapGame } from './map/index.ts';
import { timelineGame } from './timeline/index.ts';

registerGame(sortGame);
registerGame(topxGame);
registerGame(matchGame);
registerGame(mapGame);
registerGame(timelineGame);

export { sortGame, topxGame, matchGame, mapGame, timelineGame };
