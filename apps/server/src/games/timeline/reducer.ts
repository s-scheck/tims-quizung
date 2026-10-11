import { isTimelineYear, type ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { TimelineRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, pickTarget, rememberTarget, scheduleRoundTimer, toReveal } from '../common.ts';

export function timelineRound(room: Room): TimelineRound | null {
  return room.round?.game === 'timeline' ? room.round : null;
}

export function startTimelineRound(room: Room, category: Category, opts: StartRoundOptions): Result {
  if (category.kind !== 'events') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const picked = pickTarget(room, category.id, category.events, opts.targetId);
  if ('error' in picked) return picked.error;
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  rememberTarget(room, category.id, picked.target.id);

  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'timeline',
    category,
    target: { ...picked.target },
    guesses: {},
  };
  room.phase = 'playing';
  scheduleRoundTimer(room, () => timerExpired(room));
  return OK;
}

/** Zeit abgelaufen: gesetzte Tipps zählen auch unbestätigt, dann direkt zur Auflösung. */
function timerExpired(room: Room): void {
  const round = timelineRound(room);
  if (!round) return;
  for (const guess of Object.values(round.guesses)) guess.confirmed = true;
  toReveal(room);
}

export function handleTimelineMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'place_year':
      return placeYear(room, playerId, msg.year);
    case 'confirm_pin':
      return confirmGuess(room, playerId);
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function participantRound(room: Room, playerId: string): { round: TimelineRound } | { error: Result } {
  const round = timelineRound(room);
  if (room.phase !== 'playing' || !round) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  if (!round.turnOrder.includes(playerId)) return { error: fail('not_allowed', 'Du bist in dieser Runde nicht dabei') };
  return { round };
}

function placeYear(room: Room, playerId: string, year: number): Result {
  const r = participantRound(room, playerId);
  if ('error' in r) return r.error;
  if (!isTimelineYear(year)) return fail('bad_message', 'Jahr liegt nicht auf dem Zeitstrahl');
  if (r.round.guesses[playerId]?.confirmed) return fail('invalid_action', 'Dein Tipp ist schon bestätigt');
  r.round.guesses[playerId] = { year, confirmed: false };
  return OK;
}

function confirmGuess(room: Room, playerId: string): Result {
  const r = participantRound(room, playerId);
  if ('error' in r) return r.error;
  const guess = r.round.guesses[playerId];
  if (!guess) return fail('invalid_action', 'Erst ein Jahr wählen');
  if (guess.confirmed) return fail('invalid_action', 'Dein Tipp ist schon bestätigt');
  guess.confirmed = true;
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  if (room.phase !== 'playing' || !timelineRound(room)) return fail('invalid_action', 'Gerade läuft keine Zeitstrahl-Runde');
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = timelineRound(room);
  if (round) delete round.guesses[playerId];
}
