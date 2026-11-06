import { DEVLOCK_MAX_DECLINES } from '@quiz/shared';
import type { Room } from './room.ts';
import { fail, OK, type Result } from './result.ts';

/**
 * Ein kleiner Scherz des Entwicklers: Am 7.11. erscheint einmal pro Raum eine gespielte „Entwickler-Sperre“,
 * die um eine Spende bittet. Bezahlt wird nichts, beide Wege lösen nur auf. Sie kommt nur zwischen zwei
 * Runden, direkt nachdem der Host Punkte eingetragen hat, und nur, wenn schon richtig gespielt wird.
 */
export const DEVLOCK_DAY = { month: 11, day: 7 };
const MIN_UPTIME_SECONDS = 20 * 60;
const MIN_ROUNDS = 2;
const MIN_PLAYERS = 3;

/** Austauschbar für Tests. */
export const devLockClock = {
  now: (): Date => new Date(),
  uptimeSeconds: (): number => process.uptime(),
};

/**
 * Mit DEVLOCK_PREVIEW=1 (`bun run devlock`) zum Ausprobieren: Datum und Laufzeit egal,
 * schon nach der ersten Runde und ab zwei Spielern, etwa Host plus ein Handy im Netzwerk.
 */
export function devLockDue(
  input: { now: Date; uptimeSeconds: number; roundsPlayed: number; players: number },
  preview = process.env.DEVLOCK_PREVIEW === '1',
): boolean {
  return (
    (preview || (input.now.getMonth() + 1 === DEVLOCK_DAY.month && input.now.getDate() === DEVLOCK_DAY.day && input.uptimeSeconds >= MIN_UPTIME_SECONDS)) &&
    input.roundsPlayed >= (preview ? 1 : MIN_ROUNDS) &&
    input.players >= (preview ? 2 : MIN_PLAYERS)
  );
}

/** Nach dem Punkte-Eintragen aufrufen: Zeigt die Sperre, wenn alles passt und sie in diesem Raum noch nicht kam. */
export function maybeShowDevLock(room: Room): void {
  if (room.devLockShown || room.phase !== 'scoreboard') return;
  const due = devLockDue({
    now: devLockClock.now(),
    uptimeSeconds: devLockClock.uptimeSeconds(),
    roundsPlayed: room.rounds.length,
    players: room.players.length,
  });
  if (!due) return;
  room.devLockShown = true;
  room.devLock = { declines: 0, paid: false, seed: Math.floor(room.random() * 2 ** 31) };
}

export function devLockAction(room: Room, playerId: string, action: 'decline' | 'pay' | 'close'): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host kann freischalten');
  const lock = room.devLock;
  if (!lock) return fail('invalid_action', 'Keine Sperre aktiv');
  const done = lock.paid || lock.declines >= DEVLOCK_MAX_DECLINES;
  switch (action) {
    case 'decline':
      if (done) return fail('invalid_action', 'Schon entschieden');
      lock.declines++;
      return OK;
    case 'pay':
      if (done) return fail('invalid_action', 'Schon entschieden');
      lock.paid = true;
      return OK;
    case 'close':
      if (!done) return fail('invalid_action', 'Erst entscheiden');
      room.devLock = null;
      return OK;
  }
}
