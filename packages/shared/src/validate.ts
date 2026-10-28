import type { ClientMsg } from './protocol.ts';
import {
  FACE_COLS_MAX,
  FACE_COLS_MIN,
  FACE_EFFECTS,
  FACE_LEVEL_MAX,
  GAME_IDS,
  GUESS_MAX_LENGTH,
  LIVES_MAX,
  LIVES_MIN,
  MORSE_SPEEDS,
  REVEAL_MODES,
  TIMER_OPTIONS,
  type FaceEffect,
  type GameId,
  type MorseSpeed,
  type RevealMode,
  type TimerSeconds,
} from './types.ts';
import { isValidLatLng } from './rules/geo.ts';
import { isTimelineYear } from './rules/timeline.ts';
import { isRiskDuplicates, isRiskMissPoints } from './rules/risk.ts';

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

export function isMorseSpeed(value: unknown): value is MorseSpeed {
  return typeof value === 'string' && value in MORSE_SPEEDS;
}

export function isRevealMode(value: unknown): value is RevealMode {
  return typeof value === 'string' && (REVEAL_MODES as readonly string[]).includes(value);
}

export function isFaceEffect(value: unknown): value is FaceEffect {
  return typeof value === 'string' && (FACE_EFFECTS as readonly string[]).includes(value);
}

export function isFaceLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= FACE_LEVEL_MAX;
}

export function isFaceCols(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= FACE_COLS_MIN && value <= FACE_COLS_MAX;
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
        (x.borders === undefined || typeof x.borders === 'boolean') &&
        (x.duplicates === undefined || isRiskDuplicates(x.duplicates)) &&
        (x.missPoints === undefined || isRiskMissPoints(x.missPoints)) &&
        (x.word === undefined || isStr(x.word, 200)) &&
        (x.reveal === undefined || isRevealMode(x.reveal)) &&
        (x.effect === undefined || isFaceEffect(x.effect)) &&
        (x.level === undefined || isFaceLevel(x.level)) &&
        (x.cols === undefined || isFaceCols(x.cols))
      );
    case 'face_guess':
      return isStr(x.text, GUESS_MAX_LENGTH) && x.text.trim().length > 0;
    case 'face_judge':
      return isStr(x.playerId, 100) && isInt(x.index) && x.index >= 0 && typeof x.correct === 'boolean';
    case 'face_effect':
      return (
        (x.level !== undefined || x.cols !== undefined || x.revealed !== undefined) &&
        (x.level === undefined || isFaceLevel(x.level)) &&
        (x.cols === undefined || isFaceCols(x.cols)) &&
        (x.revealed === undefined ||
          (Array.isArray(x.revealed) && x.revealed.length <= 1000 && x.revealed.every((i) => isInt(i) && i >= 0)))
      );
    case 'reveal_player':
      return isStr(x.playerId, 100);
    case 'picture_guess':
      return isInt(x.turnNo) && isStr(x.fieldId, 20) && isStr(x.text, GUESS_MAX_LENGTH) && x.text.trim().length > 0;
    case 'picture_judge':
      return isInt(x.turnNo) && typeof x.correct === 'boolean';
    case 'reveal_solution':
    case 'reveal_all':
      return true;
    case 'morse_guess':
      return isStr(x.text, 200);
    case 'morse_accept':
      return isStr(x.playerId, 100) && isInt(x.index) && x.index >= 0;
    case 'morse_show_light':
    case 'morse_show_code':
    case 'morse_show_table':
      return typeof x.shown === 'boolean';
    case 'morse_play':
      return isMorseSpeed(x.speed);
    case 'morse_stop':
      return true;
    case 'place_pin':
      return isValidLatLng(x.lat, x.lng);
    case 'place_year':
      return isTimelineYear(x.year);
    case 'risk_guess':
      return isStr(x.text, GUESS_MAX_LENGTH);
    case 'risk_correct':
      return isStr(x.playerId, 100) && (x.rank === null || (isInt(x.rank) && x.rank >= 1));
    case 'confirm_pin':
    case 'end_round':
    case 'next_pass':
    case 'advance':
      return true;
    case 'submit_text':
      return isStr(x.text, 400);
    case 'vote':
      return isStr(x.entryId, 20);
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
