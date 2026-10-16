import type { ClientMsg } from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Room } from '../../rooms/room.ts';
import type { MapRound } from '../../rooms/state.ts';
import { fail, OK, type Result } from '../../rooms/result.ts';
import type { StartRoundOptions } from '../registry.ts';
import { baseRound, buildTurnOrder, pickTarget, rememberTarget, scheduleRoundTimer, toReveal } from '../common.ts';

export function mapRound(room: Room): MapRound | null {
  return room.round?.game === 'map' ? room.round : null;
}

export function startMapRound(room: Room, category: Category | null, opts: StartRoundOptions): Result {
  if (!category || category.kind !== 'places') return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
  const picked = pickTarget(room, category.id, category.places, opts.targetId);
  if ('error' in picked) return picked.error;
  const turnOrder = buildTurnOrder(room);
  if (turnOrder.length === 0) return fail('invalid_action', 'Ohne Mitspieler geht es nicht los');
  rememberTarget(room, category.id, picked.target.id);
  const { target } = picked;

  const borders = opts.borders ?? room.mapBorders;
  room.mapBorders = borders;

  room.round = {
    ...baseRound(category, turnOrder),
    activePlayerId: null,
    soloMode: false,
    game: 'map',
    category,
    target: { id: target.id, name: target.name, lat: target.lat, lng: target.lng },
    borders,
    pins: {},
  };
  room.phase = 'playing';
  scheduleRoundTimer(room, () => timerExpired(room));
  return OK;
}

/** Zeit abgelaufen: gesetzte Pins zählen auch unbestätigt, dann direkt zur Auflösung. */
function timerExpired(room: Room): void {
  const round = mapRound(room);
  if (!round) return;
  for (const pin of Object.values(round.pins)) pin.confirmed = true;
  toReveal(room);
}

export function handleMapMessage(room: Room, playerId: string, msg: ClientMsg): Result {
  switch (msg.type) {
    case 'place_pin':
      return placePin(room, playerId, msg.lat, msg.lng);
    case 'confirm_pin':
      return confirmPin(room, playerId);
    case 'end_round':
      return endRound(room, playerId);
    default:
      return fail('invalid_action', 'Unbekannte Spielaktion');
  }
}

function participantRound(room: Room, playerId: string): { round: MapRound } | { error: Result } {
  const round = mapRound(room);
  if (room.phase !== 'playing' || !round) return { error: fail('invalid_action', 'Gerade wird nicht gespielt') };
  if (!round.turnOrder.includes(playerId)) return { error: fail('not_allowed', 'Du bist in dieser Runde nicht dabei') };
  return { round };
}

function placePin(room: Room, playerId: string, lat: number, lng: number): Result {
  const r = participantRound(room, playerId);
  if ('error' in r) return r.error;
  const existing = r.round.pins[playerId];
  if (existing?.confirmed) return fail('invalid_action', 'Dein Pin ist schon bestätigt');
  r.round.pins[playerId] = { lat, lng, confirmed: false };
  return OK;
}

function confirmPin(room: Room, playerId: string): Result {
  const r = participantRound(room, playerId);
  if ('error' in r) return r.error;
  const pin = r.round.pins[playerId];
  if (!pin) return fail('invalid_action', 'Erst einen Pin setzen');
  if (pin.confirmed) return fail('invalid_action', 'Dein Pin ist schon bestätigt');
  pin.confirmed = true;
  return OK;
}

function endRound(room: Room, playerId: string): Result {
  if (!room.isHost(playerId)) return fail('not_host', 'Nur der Host beendet die Runde');
  if (room.phase !== 'playing' || !mapRound(room)) return fail('invalid_action', 'Gerade läuft keine Karten-Runde');
  toReveal(room);
  return OK;
}

// --------------------------------------------------------- Modul-Hooks

export function onPlayerRemoved(room: Room, playerId: string): void {
  const round = mapRound(room);
  if (round) delete round.pins[playerId];
}
