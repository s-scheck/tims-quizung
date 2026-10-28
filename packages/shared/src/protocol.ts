import type { FaceEffect, GameId, MorseSpeed, PictureMode, RevealMode, Role, RoomView, Selection, TimerSeconds } from './types.ts';
import type { RiskDuplicates, RiskMissPoints } from './rules/risk.ts';

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
  | {
      type: 'choose_category';
      gameId: GameId;
      categoryId: string;
      lives?: number;
      targetId?: string;
      borders?: boolean;
      duplicates?: RiskDuplicates;
      missPoints?: RiskMissPoints;
      word?: string;
      /** Auflösung alles auf einmal oder als Show, nur bei Karte, Zeitstrahl, No Risk No Fun und Bluff mit moderierendem Host. */
      reveal?: RevealMode;
      /** Wer ist das?: Effekt und Startwert. */
      effect?: FaceEffect;
      level?: number;
      cols?: number;
      /** Bilderrätsel: reihum oder alle gleichzeitig. */
      mode?: PictureMode;
    }
  | ({ type: 'select'; turnNo: number; targetId?: string } & Selection)
  | { type: 'confirm'; turnNo: number }
  | { type: 'guess'; turnNo: number; text: string }
  | { type: 'judge'; turnNo: number; correct: boolean; rank?: number }
  /** Bilderrätsel: Feld wählen und Lösung tippen, der Host prüft. */
  | { type: 'picture_guess'; turnNo: number; fieldId: string; text: string }
  | { type: 'picture_judge'; turnNo: number; correct: boolean }
  /** Bilderrätsel „Alle gleichzeitig“: eigene Antwort je Feld (leer löscht), Fertigmeldung, Prüfung durch den Host. */
  | { type: 'picture_fill'; fieldId: string; text: string }
  | { type: 'picture_done' }
  | { type: 'picture_step'; index: number }
  | { type: 'picture_verdict'; playerId: string; fieldId: string; correct: boolean }
  /** Wer ist das?: Tipp, Prüfung durch den Host, neuer Effektzustand vom Host. */
  | { type: 'face_guess'; text: string }
  | { type: 'face_judge'; playerId: string; index: number; correct: boolean }
  | { type: 'face_effect'; level?: number; cols?: number; revealed?: number[] }
  | { type: 'place_pin'; lat: number; lng: number }
  | { type: 'place_year'; year: number }
  | { type: 'confirm_pin' }
  | { type: 'end_round' }
  | { type: 'morse_guess'; text: string }
  | { type: 'morse_accept'; playerId: string; index: number }
  | { type: 'morse_play'; speed: MorseSpeed }
  | { type: 'morse_stop' }
  | { type: 'morse_show_light'; shown: boolean }
  | { type: 'morse_show_code'; shown: boolean }
  | { type: 'morse_show_table'; shown: boolean }
  | { type: 'submit_text'; text: string }
  | { type: 'vote'; entryId: string }
  | { type: 'advance' }
  | { type: 'risk_guess'; text: string }
  | { type: 'risk_correct'; playerId: string; rank: number | null }
  | { type: 'next_pass' }
  | { type: 'skip_turn'; turnNo: number }
  | { type: 'host_decision'; continue: boolean }
  | { type: 'to_scoring' }
  /** Show-Auflösung: Host deckt einen Spieler (einen Schritt weiter), die Lösung oder alles auf. */
  | { type: 'reveal_player'; playerId: string }
  | { type: 'reveal_solution' }
  | { type: 'reveal_all' }
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
