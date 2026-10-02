import type { ClientMsg } from './protocol.ts';
import { GAME_IDS, GUESS_MAX_LENGTH, LIVES_MAX, LIVES_MIN, TIMER_OPTIONS, type GameId, type TimerSeconds } from './types.ts';
import { isValidLatLng } from './rules/geo.ts';

export const NAME_MIN = 1;
export const NAME_MAX = 20;
export const SCORE_MIN = -999;
export const SCORE_MAX = 999;

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

export function isValidName(name: string): boolean {
  const n = normalizeName(name);
  return n.length >= NAME_MIN && n.length <= NAME_MAX;
}

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= SCORE_MIN && value <= SCORE_MAX;
}

export function isTimerSeconds(value: unknown): value is TimerSeconds {
  return typeof value === 'number' && (TIMER_OPTIONS as readonly number[]).includes(value);
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && (GAME_IDS as readonly string[]).includes(value);
}

export function isLives(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= LIVES_MIN && value <= LIVES_MAX;
}

/** Ein Tipp nach Trimmen: 1 bis GUESS_MAX_LENGTH Zeichen. */
export function isValidGuess(text: string): boolean {
  const t = text.trim();
  return t.length >= 1 && t.length <= GUESS_MAX_LENGTH;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isStr(x: unknown, max = 200): x is string {
  return typeof x === 'string' && x.length <= max;
}

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

/** Strukturelle Prüfung einer eingehenden Nachricht. Fachliche Prüfungen macht der Raum. */
export function isClientMsg(x: unknown): x is ClientMsg {
  if (!isRecord(x) || typeof x.type !== 'string') return false;
  switch (x.type) {
    case 'create':
      return isStr(x.name) && isInt(x.version);
    case 'join':
      return (
        isStr(x.code, 8) &&
        isInt(x.version) &&
        (x.name === undefined || isStr(x.name)) &&
        (x.token === undefined || isStr(x.token, 100))
      );
    case 'watch':
      return isStr(x.code, 8) && isInt(x.version);
    case 'leave':
    case 'to_scoring':
    case 'next_round':
    case 'end_game':
    case 'back_to_lobby':
    case 'ping':
      return true;
    case 'kick':
      return isStr(x.playerId, 100);
    case 'set_settings':
      return (
        (x.timerSeconds !== undefined || x.hostPlays !== undefined) &&
        (x.timerSeconds === undefined || isTimerSeconds(x.timerSeconds)) &&
        (x.hostPlays === undefined || typeof x.hostPlays === 'boolean')
      );
    case 'start_game':
      return true;
    case 'choose_category':
      return (
        isGameId(x.gameId) &&
        isStr(x.categoryId, 100) &&
        (x.lives === undefined || isLives(x.lives)) &&
        (x.targetId === undefined || isStr(x.targetId, 100)) &&
        (x.borders === undefined || typeof x.borders === 'boolean')
      );
    case 'place_pin':
      return isValidLatLng(x.lat, x.lng);
    case 'confirm_pin':
    case 'end_round':
      return true;
    case 'guess':
      return isInt(x.turnNo) && isStr(x.text, 200);
    case 'judge':
      return (
        isInt(x.turnNo) &&
        typeof x.correct === 'boolean' &&
        (x.rank === undefined || (isInt(x.rank) && x.rank >= 1))
      );
    case 'select':
      return (
        isInt(x.turnNo) &&
        (x.cardId === undefined || isStr(x.cardId, 50)) &&
        (x.targetId === undefined || isStr(x.targetId, 50)) &&
        (x.gapIndex === undefined || (isInt(x.gapIndex) && x.gapIndex >= 0))
      );
    case 'confirm':
    case 'skip_turn':
      return isInt(x.turnNo);
    case 'host_decision':
      return typeof x.continue === 'boolean';
    case 'submit_scores':
      return isRecord(x.scores) && Object.values(x.scores).every(isValidScore) && Object.keys(x.scores).length <= 50;
    default:
      return false;
  }
}
