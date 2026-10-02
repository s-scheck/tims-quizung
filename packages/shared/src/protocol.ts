import type { GameId, Role, RoomView, Selection, TimerSeconds } from './types.ts';

export const PROTOCOL_VERSION = 2;

export const CLOSE_CODES = {
  KICKED: 4001,
  REPLACED: 4002,
  ROOM_CLOSED: 4003,
  RATE_LIMIT: 4008,
} as const;

export type ErrorCode =
  | 'bad_message'
  | 'version'
  | 'room_not_found'
  | 'name_taken'
  | 'name_invalid'
  | 'not_host'
  | 'not_your_turn'
  | 'invalid_action'
  | 'server_full'
  | 'not_allowed'
  | 'rate_limited'
  | 'unknown_category'
  | 'token_invalid'
  | 'room_full';

export type ClientMsg =
  | { type: 'create'; name: string; version: number }
  | { type: 'join'; code: string; name?: string; token?: string; version: number }
  | { type: 'watch'; code: string; version: number }
  | { type: 'leave' }
  | { type: 'kick'; playerId: string }
  | { type: 'set_settings'; timerSeconds?: TimerSeconds; hostPlays?: boolean }
  | { type: 'start_game' }
  | { type: 'choose_category'; gameId: GameId; categoryId: string; lives?: number; targetId?: string; borders?: boolean }
  | ({ type: 'select'; turnNo: number; targetId?: string } & Selection)
  | { type: 'confirm'; turnNo: number }
  | { type: 'guess'; turnNo: number; text: string }
  | { type: 'judge'; turnNo: number; correct: boolean; rank?: number }
  | { type: 'place_pin'; lat: number; lng: number }
  | { type: 'confirm_pin' }
  | { type: 'end_round' }
  | { type: 'skip_turn'; turnNo: number }
  | { type: 'host_decision'; continue: boolean }
  | { type: 'to_scoring' }
  | { type: 'submit_scores'; scores: Record<string, number> }
  | { type: 'next_round' }
  | { type: 'end_game' }
  | { type: 'back_to_lobby' }
  | { type: 'ping' };

export type ClientMsgType = ClientMsg['type'];

export type ServerMsg =
  | { type: 'welcome'; code: string; role: Role; playerId: string | null; token?: string }
  | { type: 'state'; seq: number; serverNow: number; room: RoomView }
  | { type: 'error'; code: ErrorCode; message: string }
  | { type: 'pong'; serverNow: number };
