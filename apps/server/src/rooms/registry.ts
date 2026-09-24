import { generateRoomCode } from '@quiz/shared';
import { Room, type CategoryProvider } from './room.ts';
import type { Scheduler } from './scheduler.ts';

export interface RegistryOptions {
  scheduler: Scheduler;
  categories: CategoryProvider;
  random?: () => number;
  maxRooms?: number;
  ttlMs?: number;
  onChange?: (room: Room) => void;
  onRoomClosed?: (room: Room) => void;
}

export const DEFAULT_TTL_MS = 120 * 60_000;

export class RoomRegistry {
  private rooms = new Map<string, Room>();
  private readonly opts: RegistryOptions;

  constructor(opts: RegistryOptions) {
    this.opts = opts;
  }

  get size(): number {
    return this.rooms.size;
  }

  get ttlMs(): number {
    return this.opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  create(): Room | null {
    if (this.rooms.size >= (this.opts.maxRooms ?? 200)) return null;
    let code = generateRoomCode(this.opts.random);
    while (this.rooms.has(code)) code = generateRoomCode(this.opts.random);
    const room = new Room(code, {
      scheduler: this.opts.scheduler,
      categories: this.opts.categories,
      random: this.opts.random,
      onChange: this.opts.onChange,
    });
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  remove(code: string): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    this.rooms.delete(code);
    room.dispose();
    this.opts.onRoomClosed?.(room);
    return true;
  }

  /** Entfernt Räume ohne Aktivität seit `ttlMs`. Gibt die entfernten Codes zurück. */
  sweep(): string[] {
    const now = this.opts.scheduler.now();
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity >= this.ttlMs) {
        this.remove(code);
        removed.push(code);
      }
    }
    return removed;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }
}
