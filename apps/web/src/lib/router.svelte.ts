import { GAME_IDS, isValidRoomCode, normalizeRoomCode, type GameId } from '@quiz/shared';

export type Route =
  | { name: 'home' }
  | { name: 'room'; code: string }
  | { name: 'screen'; code: string }
  | { name: 'editor' }
  | { name: 'editor-new'; game: GameId }
  | { name: 'editor-edit'; id: string }
  | { name: 'notfound' };

function parse(path: string): Route {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'editor') {
    if (parts.length === 1) return { name: 'editor' };
    if (parts.length === 3 && parts[1] === 'neu' && (GAME_IDS as readonly string[]).includes(parts[2]!)) return { name: 'editor-new', game: parts[2] as GameId };
    if (parts.length === 2 && /^[a-z0-9-]{1,80}$/.test(parts[1]!)) return { name: 'editor-edit', id: parts[1]! };
  }
  if (parts.length === 2 && (parts[0] === 'room' || parts[0] === 'screen')) {
    const code = normalizeRoomCode(parts[1] ?? '');
    if (isValidRoomCode(code)) return { name: parts[0], code };
  }
  return { name: 'notfound' };
}

class Router {
  path = $state(typeof location !== 'undefined' ? location.pathname : '/');
  route = $derived(parse(this.path));

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', () => {
        this.path = location.pathname;
      });
    }
  }

  navigate(path: string, replace = false) {
    if (replace) history.replaceState(null, '', path);
    else history.pushState(null, '', path);
    this.path = path;
  }
}

export const router = new Router();
