import type { ServerWebSocket } from 'bun';
import {
  CLOSE_CODES,
  isClientMsg,
  normalizeRoomCode,
  PROTOCOL_VERSION,
  type ClientMsg,
  type ErrorCode,
  type Role,
  type ServerMsg,
} from '@quiz/shared';
import type { RoomRegistry } from '../rooms/registry.ts';
import type { Room } from '../rooms/room.ts';
import { toView } from '../rooms/view.ts';
import type { TokenBucket } from './ratelimit.ts';

export interface WsData {
  code: string | null;
  role: Role | null;
  playerId: string | null;
  bucket: TokenBucket;
}

export type Socket = ServerWebSocket<WsData>;

/**
 * Verbindet Sockets mit Räumen. Hält pro Raum die Spieler-Sockets, damit Kick und
 * Tab-Übernahme gezielt schließen können. Der Broadcast geht an jeden Socket einzeln,
 * weil ein moderierender Host bei Top X eine eigene Sicht bekommt.
 */
export class Hub {
  private conns = new Map<string, Map<string, Socket>>();
  private screens = new Map<string, Set<Socket>>();

  constructor(private readonly registry: RoomRegistry) {}

  // -------------------------------------------------------------- Senden

  private send(ws: Socket, msg: ServerMsg): void {
    ws.send(JSON.stringify(msg));
  }

  private error(ws: Socket, code: ErrorCode, message: string): void {
    this.send(ws, { type: 'error', code, message });
  }

  stateMessage(room: Room, viewerId: string | null): string {
    const msg: ServerMsg = { type: 'state', seq: room.seq, serverNow: room.now, room: toView(room, viewerId) };
    return JSON.stringify(msg);
  }

  /** Öffentliche Sicht an alle, die private Sicht nur an den moderierenden Host, wenn das Spiel eine hat. */
  broadcast(room: Room): void {
    const publicJson = this.stateMessage(room, null);
    const privateFor =
      room.game?.hasPrivateView && room.round && room.hostId !== null && room.isModerator(room.hostId) ? room.hostId : null;
    for (const [playerId, ws] of this.conns.get(room.code) ?? []) {
      ws.send(playerId === privateFor ? this.stateMessage(room, playerId) : publicJson);
    }
    for (const ws of this.screens.get(room.code) ?? []) ws.send(publicJson);
  }

  closeRoomSockets(code: string, closeCode: number = CLOSE_CODES.ROOM_CLOSED, reason = 'Raum geschlossen'): void {
    for (const ws of this.conns.get(code)?.values() ?? []) ws.close(closeCode, reason);
    for (const ws of this.screens.get(code) ?? []) ws.close(closeCode, reason);
    this.conns.delete(code);
    this.screens.delete(code);
  }

  playerSocket(code: string, playerId: string): Socket | undefined {
    return this.conns.get(code)?.get(playerId);
  }

  // ---------------------------------------------------------- Lifecycle

  private attachPlayer(ws: Socket, room: Room, playerId: string): void {
    ws.data.code = room.code;
    ws.data.role = 'player';
    ws.data.playerId = playerId;
    let map = this.conns.get(room.code);
    if (!map) {
      map = new Map();
      this.conns.set(room.code, map);
    }
    map.set(playerId, ws);
  }

  private attachScreen(ws: Socket, room: Room): void {
    ws.data.code = room.code;
    ws.data.role = 'screen';
    let set = this.screens.get(room.code);
    if (!set) {
      set = new Set();
      this.screens.set(room.code, set);
    }
    set.add(ws);
    room.screenCount = set.size;
  }

  private detach(ws: Socket): void {
    const { code, role, playerId } = ws.data;
    if (code) {
      if (role === 'player' && playerId) {
        const map = this.conns.get(code);
        if (map?.get(playerId) === ws) map.delete(playerId);
        if (map && map.size === 0) this.conns.delete(code);
      } else if (role === 'screen') {
        const set = this.screens.get(code);
        set?.delete(ws);
        const room = this.registry.get(code);
        if (room) room.screenCount = set?.size ?? 0;
        if (set && set.size === 0) this.screens.delete(code);
      }
    }
    ws.data.code = null;
    ws.data.role = null;
    ws.data.playerId = null;
  }

  onClose(ws: Socket): void {
    const { code, role, playerId } = ws.data;
    if (!code) return;
    const room = this.registry.get(code);
    // Nur abmelden, wenn dieser Socket noch der aktuelle des Spielers ist (Tab-Übernahme).
    const isCurrent = role !== 'player' || !playerId || this.conns.get(code)?.get(playerId) === ws;
    this.detach(ws);
    if (room && role === 'player' && playerId && isCurrent) {
      room.setConnected(playerId, false);
      room.emit();
    }
  }

  // ------------------------------------------------------------ Nachricht

  onMessage(ws: Socket, raw: string | Buffer): void {
    if (typeof raw !== 'string') {
      this.error(ws, 'bad_message', 'Nur Text-Nachrichten');
      return;
    }
    if (!ws.data.bucket.take()) {
      ws.close(CLOSE_CODES.RATE_LIMIT, 'Zu viele Nachrichten');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.error(ws, 'bad_message', 'Kein gültiges JSON');
      return;
    }
    if (!isClientMsg(parsed)) {
      this.error(ws, 'bad_message', 'Unbekannte Nachricht');
      return;
    }
    const msg = parsed;

    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong', serverNow: Date.now() });
      return;
    }

    if (ws.data.code === null) {
      this.handleUnattached(ws, msg);
      return;
    }

    const room = this.registry.get(ws.data.code);
    if (!room) {
      this.detach(ws);
      ws.close(CLOSE_CODES.ROOM_CLOSED, 'Raum existiert nicht mehr');
      return;
    }

    if (ws.data.role === 'screen') {
      this.error(ws, 'not_allowed', 'Der Bildschirm kann nur zuschauen');
      return;
    }

    const playerId = ws.data.playerId!;
    switch (msg.type) {
      case 'create':
      case 'join':
      case 'watch':
        this.error(ws, 'invalid_action', 'Du bist schon in einem Raum');
        return;
      case 'leave': {
        room.leave(playerId);
        this.detach(ws);
        this.afterPlayerGone(room);
        return;
      }
      case 'kick': {
        const res = room.kick(playerId, msg.playerId);
        if (!res.ok) {
          this.error(ws, res.code, res.message);
          return;
        }
        const target = this.playerSocket(room.code, msg.playerId);
        if (target) {
          this.detach(target);
          target.close(CLOSE_CODES.KICKED, 'Du wurdest aus dem Raum entfernt');
        }
        this.afterPlayerGone(room);
        return;
      }
      default: {
        const res = room.handle(playerId, msg);
        if (!res.ok) {
          this.error(ws, res.code, res.message);
          return;
        }
        room.emit();
      }
    }
  }

  private afterPlayerGone(room: Room): void {
    if (room.players.length === 0) this.registry.remove(room.code);
    else room.emit();
  }

  private handleUnattached(ws: Socket, msg: ClientMsg): void {
    switch (msg.type) {
      case 'create': {
        if (msg.version !== PROTOCOL_VERSION) return this.error(ws, 'version', 'Bitte Seite neu laden');
        const room = this.registry.create();
        if (!room) return this.error(ws, 'server_full', 'Gerade sind zu viele Räume offen');
        const res = room.join(msg.name, undefined);
        if (!res.ok) {
          this.registry.remove(room.code);
          return this.error(ws, res.code, res.message);
        }
        this.attachPlayer(ws, room, res.player.id);
        this.send(ws, { type: 'welcome', code: room.code, role: 'player', playerId: res.player.id, token: res.player.token });
        room.emit();
        return;
      }
      case 'join': {
        if (msg.version !== PROTOCOL_VERSION) return this.error(ws, 'version', 'Bitte Seite neu laden');
        const room = this.registry.get(normalizeRoomCode(msg.code));
        if (!room) return this.error(ws, 'room_not_found', 'Diesen Raum gibt es nicht');
        const res = room.join(msg.name, msg.token);
        if (!res.ok) return this.error(ws, res.code, res.message);
        if (res.reconnected) {
          const old = this.playerSocket(room.code, res.player.id);
          if (old && old !== ws) {
            this.detach(old);
            old.close(CLOSE_CODES.REPLACED, 'In einem anderen Tab geöffnet');
          }
        }
        room.ensureHost();
        this.attachPlayer(ws, room, res.player.id);
        this.send(ws, { type: 'welcome', code: room.code, role: 'player', playerId: res.player.id, token: res.player.token });
        room.emit();
        return;
      }
      case 'watch': {
        if (msg.version !== PROTOCOL_VERSION) return this.error(ws, 'version', 'Bitte Seite neu laden');
        const room = this.registry.get(normalizeRoomCode(msg.code));
        if (!room) return this.error(ws, 'room_not_found', 'Diesen Raum gibt es nicht');
        this.attachScreen(ws, room);
        this.send(ws, { type: 'welcome', code: room.code, role: 'screen', playerId: null });
        ws.send(this.stateMessage(room, null));
        return;
      }
      default:
        this.error(ws, 'not_allowed', 'Erst einem Raum beitreten');
    }
  }
}
