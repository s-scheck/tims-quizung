import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  type ClientMsg,
  type ErrorCode,
  type Role,
  type RoomView,
  type ServerMsg,
} from '@quiz/shared';
import { clearSession, saveSession } from './session.ts';
import { toasts } from './toast.svelte.ts';

export type Status = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Me {
  code: string;
  role: Role;
  playerId: string | null;
  token?: string;
}

type Intent =
  | { kind: 'create'; name: string }
  | { kind: 'join'; code: string; name?: string; token?: string }
  | { kind: 'watch'; code: string };

const TERMINAL_CODES = new Set<number>([CLOSE_CODES.KICKED, CLOSE_CODES.REPLACED, CLOSE_CODES.ROOM_CLOSED]);
const NAME_ERRORS = new Set<ErrorCode>(['token_invalid', 'name_taken', 'name_invalid']);

/**
 * Eine WebSocket-Verbindung zum Server. Hält die aktuelle Raumsicht und weiß, wer „ich“ bin.
 * Verbindet nach Abbrüchen mit Backoff neu und meldet sich dabei per Token wieder an.
 */
export class Client {
  status = $state<Status>('idle');
  view = $state<RoomView | null>(null);
  me = $state<Me | null>(null);
  lastError = $state<{ code: ErrorCode; message: string } | null>(null);
  /** Endgültiges Ende der Sitzung: gekickt, in anderem Tab geöffnet, Raum geschlossen. */
  terminal = $state<{ code: number; reason: string } | null>(null);
  /** Der Server hat Beitritt ohne gültigen Namen abgelehnt oder das Token kennt er nicht. */
  needsName = $state(false);
  serverOffset = $state(0);

  private ws: WebSocket | null = null;
  private intent: Intent | null = null;
  private seq = -1;
  private retries = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.kickReconnect();
      });
      window.addEventListener('online', () => this.kickReconnect());
    }
  }

  // ------------------------------------------------------------- Ableitungen

  get myId(): string | null {
    return this.me?.playerId ?? null;
  }

  get isScreen(): boolean {
    return this.me?.role === 'screen';
  }

  get isHost(): boolean {
    return !!this.view && !!this.myId && this.view.hostId === this.myId;
  }

  /** Ich bin Host und moderiere nur, ohne mitzuspielen. */
  get isModerator(): boolean {
    return this.isHost && !!this.view && !this.view.settings.hostPlays;
  }

  get isActive(): boolean {
    return !!this.myId && this.view?.round?.activePlayerId === this.myId;
  }

  get isEliminated(): boolean {
    return !!this.myId && (this.view?.round?.eliminated.includes(this.myId) ?? false);
  }

  get inRound(): boolean {
    return !!this.myId && (this.view?.round?.turnOrder.includes(this.myId) ?? false);
  }

  /** Raumcode, mit dem diese Verbindung gerade verbunden ist oder es versucht. */
  get intentCode(): string | null {
    if (!this.intent) return null;
    return this.intent.kind === 'create' ? this.me?.code ?? null : this.intent.code;
  }

  serverNow(): number {
    return Date.now() + this.serverOffset;
  }

  // ------------------------------------------------------------------ Aktionen

  create(name: string): void {
    this.start({ kind: 'create', name });
  }

  join(code: string, opts: { name?: string; token?: string } = {}): void {
    this.start({ kind: 'join', code, ...opts });
  }

  watch(code: string): void {
    this.start({ kind: 'watch', code });
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    else toasts.error('Keine Verbindung zum Server');
  }

  /** Raum ausdrücklich verlassen: Server entfernt den Spieler, Sitzung wird vergessen. */
  leave(): void {
    const code = this.me?.code;
    if (this.ws?.readyState === WebSocket.OPEN && this.me?.role === 'player') {
      this.ws.send(JSON.stringify({ type: 'leave' } satisfies ClientMsg));
    }
    if (code) clearSession(code);
    this.disconnect();
  }

  /** Verbindung schließen, Sitzung behalten (Seite verlassen, später zurück). */
  disconnect(): void {
    this.closedByUser = true;
    this.clearTimers();
    this.intent = null;
    this.ws?.close(1000, 'bye');
    this.ws = null;
    this.reset();
    this.status = 'idle';
  }

  private reset(): void {
    this.view = null;
    this.me = null;
    this.seq = -1;
    this.retries = 0;
    this.needsName = false;
    this.lastError = null;
  }

  // -------------------------------------------------------------- Verbindung

  private start(intent: Intent): void {
    this.clearTimers();
    this.ws?.close(1000, 'restart');
    this.ws = null;
    this.reset();
    this.terminal = null;
    this.intent = intent;
    this.open();
  }

  private open(): void {
    const intent = this.intent;
    if (!intent) return;
    this.closedByUser = false;
    this.status = this.retries > 0 ? 'reconnecting' : 'connecting';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      if (ws !== this.ws) return;
      this.status = 'open';
      this.retries = 0;
      this.sendIntent();
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' } satisfies ClientMsg));
      }, 30_000);
    };

    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      this.handle(msg);
    };

    ws.onclose = (ev) => {
      if (ws !== this.ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.closedByUser) {
        this.status = 'closed';
        return;
      }
      if (TERMINAL_CODES.has(ev.code)) {
        const code = this.me?.code ?? (this.intent && this.intent.kind !== 'create' ? this.intent.code : null);
        if (code && ev.code !== CLOSE_CODES.REPLACED) clearSession(code);
        this.terminal = { code: ev.code, reason: ev.reason };
        this.intent = null;
        this.status = 'closed';
        return;
      }
      this.scheduleReconnect();
    };
  }

  private sendIntent(): void {
    const intent = this.intent;
    if (!intent || !this.ws) return;
    let msg: ClientMsg;
    switch (intent.kind) {
      case 'create':
        msg = { type: 'create', name: intent.name, version: PROTOCOL_VERSION };
        break;
      case 'join':
        msg = { type: 'join', code: intent.code, name: intent.name, token: intent.token, version: PROTOCOL_VERSION };
        break;
      case 'watch':
        msg = { type: 'watch', code: intent.code, version: PROTOCOL_VERSION };
        break;
    }
    this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome': {
        this.me = { code: msg.code, role: msg.role, playerId: msg.playerId, token: msg.token };
        this.needsName = false;
        this.lastError = null;
        if (msg.role === 'player' && msg.playerId && msg.token) {
          saveSession(msg.code, { playerId: msg.playerId, token: msg.token });
          // Ab jetzt läuft jeder Reconnect über das Token.
          this.intent = { kind: 'join', code: msg.code, token: msg.token };
        }
        return;
      }
      case 'state': {
        if (this.view?.code === msg.room.code && msg.seq <= this.seq) return;
        this.seq = msg.seq;
        this.serverOffset = msg.serverNow - Date.now();
        this.view = msg.room;
        return;
      }
      case 'error': {
        this.lastError = { code: msg.code, message: msg.message };
        if (NAME_ERRORS.has(msg.code)) {
          this.needsName = true;
          if (msg.code === 'token_invalid' && this.intent?.kind === 'join') clearSession(this.intent.code);
        }
        if (msg.code === 'version') {
          toasts.error('Neue Version verfügbar, Seite wird neu geladen');
          setTimeout(() => location.reload(), 1500);
          return;
        }
        if (msg.code === 'room_not_found') {
          this.intent = null;
          this.status = 'closed';
          this.ws?.close(1000, 'room_not_found');
        }
        toasts.error(msg.message);
        return;
      }
      case 'pong':
        this.serverOffset = msg.serverNow - Date.now();
        return;
    }
  }

  private scheduleReconnect(): void {
    if (!this.intent) {
      this.status = 'closed';
      return;
    }
    this.status = 'reconnecting';
    const delay = Math.min(15_000, 400 * 2 ** this.retries) + Math.random() * 300;
    this.retries++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private kickReconnect(): void {
    if (this.status === 'reconnecting' && this.reconnectTimer && this.intent) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.open();
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.reconnectTimer = null;
    this.heartbeat = null;
  }
}

export const client = new Client();
