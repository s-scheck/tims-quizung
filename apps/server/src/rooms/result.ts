import type { ErrorCode } from '@quiz/shared';

export type Result = { ok: true } | { ok: false; code: ErrorCode; message: string };

export const OK: Result = { ok: true };

export function fail(code: ErrorCode, message: string): Result {
  return { ok: false, code, message };
}
