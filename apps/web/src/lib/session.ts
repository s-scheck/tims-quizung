import { AVATAR_PARTS, isHeadShape } from '@quiz/shared';
import type { LocalAvatar } from './avatar.ts';

export interface StoredSession {
  playerId: string;
  token: string;
}

const NAME_KEY = 'quiz:name';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadSession(code: string): StoredSession | null {
  return safe(() => {
    const raw = localStorage.getItem(`quiz:${code}:session`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.playerId !== 'string' || typeof parsed.token !== 'string') return null;
    return { playerId: parsed.playerId, token: parsed.token };
  }, null);
}

export function saveSession(code: string, session: StoredSession): void {
  safe(() => localStorage.setItem(`quiz:${code}:session`, JSON.stringify(session)), undefined);
}

export function clearSession(code: string): void {
  safe(() => localStorage.removeItem(`quiz:${code}:session`), undefined);
}

export function loadName(): string {
  return safe(() => localStorage.getItem(NAME_KEY) ?? '', '');
}

export function saveName(name: string): void {
  safe(() => localStorage.setItem(NAME_KEY, name), undefined);
}

const AVATAR_KEY = 'quiz:avatar';

/** Zuletzt fertig gemalte Figur, damit sie im nächsten Spiel wieder genommen werden kann. */
export function loadAvatar(): LocalAvatar | null {
  return safe(() => {
    const raw = localStorage.getItem(AVATAR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalAvatar>;
    if (!isHeadShape(parsed.shape) || typeof parsed.color !== 'string' || !parsed.parts || typeof parsed.parts !== 'object') return null;
    const parts: LocalAvatar['parts'] = {};
    for (const part of AVATAR_PARTS) {
      const url = (parsed.parts as Record<string, unknown>)[part];
      if (typeof url === 'string' && url.startsWith('data:image/png')) parts[part] = url;
    }
    return { shape: parsed.shape, color: parsed.color, parts };
  }, null);
}

export function saveAvatar(avatar: LocalAvatar): void {
  safe(() => localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar)), undefined);
}
