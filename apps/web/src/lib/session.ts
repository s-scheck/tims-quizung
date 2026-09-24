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
