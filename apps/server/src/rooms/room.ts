import {
  generateId,
  generateToken,
  isValidName,
  isTimerSeconds,
  LIVES_DEFAULT,
  normalizeName,
  type ClientMsg,
  type GameId,
  type Phase,
  type RoomSettings,
  type RoundResult,
} from '@quiz/shared';
import type { Category } from '@quiz/content';
import type { Scheduler, TimerHandle } from './scheduler.ts';
import type { Player, Round } from './state.ts';
import { fail, OK, type Result } from './result.ts';
import { getGame, type GameModule, type StartRoundOptions } from '../games/registry.ts';
import { handleCommon, removePlayerFromRound } from '../games/common.ts';

export interface CategoryProvider {
  list(): Category[];
  get(id: string): Category | undefined;
}

export interface RoomDeps {
  scheduler: Scheduler;
  categories: CategoryProvider;
  random?: () => number;
  /** Wird nach jeder Zustandsänderung aufgerufen (Broadcast). */
  onChange?: (room: Room) => void;
}

export const MAX_PLAYERS = 12;

export type JoinResult =
  | { ok: true; player: Player; reconnected: boolean }
  | { ok: false; code: 'name_taken' | 'name_invalid' | 'token_invalid' | 'room_full'; message: string };

/**
 * Ein Raum: Spieler, Host, Einstellungen, Scores und der laufende Spielzustand.
 * Synchron aufgerufene Aktionen ändern den Zustand, der Aufrufer ruft danach `emit()`.
 * Timer-Callbacks rufen `emit()` selbst.
 */
export class Room {
  readonly code: string;
  readonly createdAt: number;
  hostId: string | null = null;
  players: Player[] = [];
  settings: RoomSettings = { timerSeconds: 0, hostPlays: true };
  scores: Record<string, number> = {};
  phase: Phase = 'lobby';
  /** Spiel der laufenden bzw. zuletzt gespielten Runde. */
  gameId: GameId | null = null;
  round: Round | null = null;
  rounds: RoundResult[] = [];
  playedCategoryIds: string[] = [];
  lastStartPlayerId: string | null = null;
  /** Zuletzt gewählte Leben für Top X, Vorgabe für die nächste Runde. */
  topxLives: number = LIVES_DEFAULT;
  seq = 0;
  lastActivity: number;
  screenCount = 0;
  timers: { turn: TimerHandle | null; placement: TimerHandle | null } = { turn: null, placement: null };
  readonly scheduler: Scheduler;
  readonly categories: CategoryProvider;
  readonly random: () => number;
  private readonly onChange: ((room: Room) => void) | undefined;
  private nextOrder = 1;
  private disposed = false;

  constructor(code: string, deps: RoomDeps) {
    this.code = code;
    this.scheduler = deps.scheduler;
    this.categories = deps.categories;
    this.random = deps.random ?? Math.random;
    this.onChange = deps.onChange;
    this.createdAt = this.scheduler.now();
    this.lastActivity = this.createdAt;
  }

  get now(): number {
    return this.scheduler.now();
  }

  get game(): GameModule | null {
    return this.gameId ? (getGame(this.gameId) ?? null) : null;
  }

  touch(): void {
    this.lastActivity = this.now;
  }

  emit(): void {
    if (this.disposed) return;
    this.seq++;
    this.onChange?.(this);
  }

  // ---------------------------------------------------------------- Spieler

  getPlayer(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  isHost(playerId: string): boolean {
    return this.hostId === playerId;
  }

  playersByOrder(): Player[] {
    return [...this.players].sort((a, b) => a.order - b.order);
  }

  /** Moderiert der Host nur, statt mitzuspielen? */
  isModerator(playerId: string): boolean {
    return this.hostId === playerId && !this.settings.hostPlays;
  }

  /** Spieler in Beitrittsreihenfolge, die in Runden mitspielen (ohne moderierenden Host). */
  playingPlayers(): Player[] {
    return this.playersByOrder().filter((p) => !this.isModerator(p.id));
  }

  private nameTaken(name: string, exceptId?: string): boolean {
    const key = name.toLowerCase();
    return this.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === key);
  }

  /** Beitritt oder Reconnect. Ein gültiges Token gewinnt immer, sonst zählt der Name. */
  join(rawName: string | undefined, token: string | undefined): JoinResult {
    this.touch();
    if (token) {
      const existing = this.players.find((p) => p.token === token);
      if (existing) {
        existing.connected = true;
        return { ok: true, player: existing, reconnected: true };
      }
      if (rawName === undefined) {
        return { ok: false, code: 'token_invalid', message: 'Sitzung unbekannt, bitte Namen eingeben' };
      }
    }
    if (rawName === undefined || !isValidName(rawName)) {
      return { ok: false, code: 'name_invalid', message: 'Name muss 1 bis 20 Zeichen haben' };
    }
    const name = normalizeName(rawName);
    if (this.nameTaken(name)) return { ok: false, code: 'name_taken', message: `„${name}“ ist schon vergeben` };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, code: 'room_full', message: 'Der Raum ist voll' };

    const player: Player = {
      id: generateId(),
      name,
      token: generateToken(),
      order: this.nextOrder++,
      connected: true,
    };
    this.players.push(player);
    this.scores[player.id] ??= 0;
    if (this.hostId === null) this.hostId = player.id;
    return { ok: true, player, reconnected: false };
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.getPlayer(playerId);
    if (!p) return;
    p.connected = connected;
    if (connected) this.touch();
  }

  /** Ausdrückliches Verlassen. Host-Rolle wandert weiter, Spiel wird angepasst. */
  leave(playerId: string): Result {
    const player = this.getPlayer(playerId);
    if (!player) return fail('invalid_action', 'Spieler nicht im Raum');
    this.touch();
    this.players = this.players.filter((p) => p.id !== playerId);
    delete this.scores[playerId];
    if (this.hostId === playerId) this.transferHost();
    removePlayerFromRound(this, playerId);
    return OK;
  }

  private pickNewHost(): string | null {
    const ordered = this.playersByOrder();
    return ordered.find((p) => p.connected)?.id ?? ordered[0]?.id ?? null;
  }

  private transferHost(): void {
    this.hostId = this.pickNewHost();
    // Ein nachrückender Host spielt immer mit, sonst würde er ungewollt aussetzen.
    this.settings = { ...this.settings, hostPlays: true };
    if (this.hostId !== null) this.game?.onHostChanged(this);
  }

  /** Besetzt eine leere Host-Rolle, etwa nach dem Reconnect in einen verwaisten Raum. */
  ensureHost(): void {
    if (this.hostId !== null && this.getPlayer(this.hostId)) return;
    this.transferHost();
  }

  kick(byId: string, targetId: string): Result {
    if (!this.isHost(byId)) return fail('not_host', 'Nur der Host darf Spieler entfernen');
    if (byId === targetId) return fail('invalid_action', 'Du kannst dich nicht selbst entfernen');
    if (!this.getPlayer(targetId)) return fail('invalid_action', 'Spieler nicht im Raum');
    return this.leave(targetId);
  }

  // ------------------------------------------------------------ Einstellungen

  setSettings(byId: string, patch: { timerSeconds?: unknown; hostPlays?: unknown }): Result {
    if (!this.isHost(byId)) return fail('not_host', 'Nur der Host darf Einstellungen ändern');
    if (this.phase !== 'lobby' && this.phase !== 'choosing_category') {
      return fail('invalid_action', 'Einstellungen nur in der Lobby oder vor einer Runde');
    }
    const next = { ...this.settings };
    if (patch.timerSeconds !== undefined) {
      if (!isTimerSeconds(patch.timerSeconds)) return fail('bad_message', 'Ungültiger Timer');
      next.timerSeconds = patch.timerSeconds;
    }
    if (patch.hostPlays !== undefined) {
      if (typeof patch.hostPlays !== 'boolean') return fail('bad_message', 'Ungültige Einstellung');
      next.hostPlays = patch.hostPlays;
    }
    this.touch();
    this.settings = next;
    return OK;
  }

  // ------------------------------------------------------------------- Spiel

  /** Aus der Lobby zur Spiel- und Kategoriewahl. Scores beginnen bei null. */
  startGame(byId: string): Result {
    if (!this.isHost(byId)) return fail('not_host', 'Nur der Host darf das Spiel starten');
    if (this.phase !== 'lobby') return fail('invalid_action', 'Ein Spiel läuft bereits');
    this.touch();
    this.cancelAllTimers();
    this.gameId = null;
    this.round = null;
    this.scores = Object.fromEntries(this.players.map((p) => [p.id, 0]));
    this.rounds = [];
    this.playedCategoryIds = [];
    this.lastStartPlayerId = null;
    this.phase = 'choosing_category';
    return OK;
  }

  /** Spiel und Kategorie für die nächste Runde festlegen und die Runde starten. */
  chooseCategory(byId: string, gameId: string, categoryId: string, opts: StartRoundOptions = {}): Result {
    if (!this.isHost(byId)) return fail('not_host', 'Nur der Host wählt die Kategorie');
    if (this.phase !== 'choosing_category') return fail('invalid_action', 'Gerade keine Kategoriewahl');
    const game = getGame(gameId);
    if (!game) return fail('invalid_action', `Unbekanntes Spiel „${gameId}“`);
    const category = this.categories.get(categoryId);
    if (!category) return fail('unknown_category', 'Kategorie unbekannt');
    if (!category.games.includes(game.id)) return fail('unknown_category', 'Diese Kategorie passt nicht zum Spiel');
    this.touch();
    this.gameId = game.id;
    const res = game.startRound(this, category, opts);
    if (res.ok && !this.playedCategoryIds.includes(category.id)) this.playedCategoryIds.push(category.id);
    return res;
  }

  backToLobby(byId: string): Result {
    if (!this.isHost(byId)) return fail('not_host', 'Nur der Host darf zurück in die Lobby');
    if (this.phase !== 'finished') return fail('invalid_action', 'Erst das Spiel beenden');
    this.touch();
    this.cancelAllTimers();
    this.phase = 'lobby';
    this.gameId = null;
    this.round = null;
    return OK;
  }

  /** Verteilt Aktionen eines angemeldeten Spielers. `create`, `join`, `watch`, `ping`, `leave`, `kick` behandelt die WS-Schicht. */
  handle(playerId: string, msg: ClientMsg): Result {
    if (!this.getPlayer(playerId)) return fail('invalid_action', 'Spieler nicht im Raum');
    this.touch();
    switch (msg.type) {
      case 'set_settings':
        return this.setSettings(playerId, { timerSeconds: msg.timerSeconds, hostPlays: msg.hostPlays });
      case 'start_game':
        return this.startGame(playerId);
      case 'choose_category':
        return this.chooseCategory(playerId, msg.gameId, msg.categoryId, msg.lives !== undefined ? { lives: msg.lives } : {});
      case 'back_to_lobby':
        return this.backToLobby(playerId);
      case 'create':
      case 'join':
      case 'watch':
      case 'ping':
      case 'leave':
      case 'kick':
        return fail('invalid_action', 'Nachricht hier nicht erlaubt');
      default: {
        const common = handleCommon(this, playerId, msg);
        if (common) return common;
        const game = this.game;
        if (!game) return fail('invalid_action', 'Kein Spiel gestartet');
        return game.handle(this, playerId, msg);
      }
    }
  }

  // ------------------------------------------------------------------ Timer

  cancelTimer(kind: 'turn' | 'placement'): void {
    const h = this.timers[kind];
    if (h) {
      this.scheduler.cancel(h);
      this.timers[kind] = null;
    }
  }

  cancelAllTimers(): void {
    this.cancelTimer('turn');
    this.cancelTimer('placement');
  }

  dispose(): void {
    this.cancelAllTimers();
    this.disposed = true;
  }
}
