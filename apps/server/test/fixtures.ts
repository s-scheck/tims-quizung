import type { Category } from '@quiz/content';
import type { ClientMsg, TimerSeconds } from '@quiz/shared';
import { Room, type CategoryProvider } from '../src/rooms/room.ts';
import { FakeScheduler } from '../src/rooms/scheduler.ts';
import '../src/games/sort/index.ts';

export const CITIES: Category = {
  id: 'cities',
  title: 'Städte',
  question: 'Welche Stadt hat mehr Einwohner?',
  topLabel: 'meiste Einwohner',
  bottomLabel: 'wenigste Einwohner',
  unit: 'Einwohner',
  order: 'desc',
  items: Array.from({ length: 10 }, (_, i) => ({ name: `Stadt ${i + 1}`, value: (10 - i) * 100 })),
};

export const TIMES: Category = {
  id: 'times',
  title: 'Zeiten',
  question: 'Wer war schneller?',
  topLabel: 'schnellste Zeit',
  bottomLabel: 'langsamste Zeit',
  unit: 's',
  order: 'asc',
  items: Array.from({ length: 12 }, (_, i) => ({ name: `Läufer ${i + 1}`, value: 100 + i * 7 })),
};

export const provider: CategoryProvider = {
  list: () => [CITIES, TIMES],
  get: (id) => [CITIES, TIMES].find((c) => c.id === id),
};

/** Deterministischer Zufall (mulberry32). */
export function seeded(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Harness {
  room: Room;
  scheduler: FakeScheduler;
  emits: number[];
  ids: string[];
  host: string;
  /** Aktion eines Spielers wie über die WS-Schicht: bei Erfolg wird emittiert. */
  act(playerId: string, msg: ClientMsg): ReturnType<Room['handle']>;
  valueOf(cardId: string): number;
  chainValues(): number[];
}

export function makeHarness(names: string[], opts: { timer?: TimerSeconds; seed?: number } = {}): Harness {
  const scheduler = new FakeScheduler();
  const emits: number[] = [];
  const room = new Room('ABCD', {
    scheduler,
    categories: provider,
    random: seeded(opts.seed ?? 42),
    onChange: (r) => emits.push(r.seq),
  });
  const ids: string[] = [];
  for (const name of names) {
    const res = room.join(name, undefined);
    if (!res.ok) throw new Error(res.message);
    ids.push(res.player.id);
  }
  const host = ids[0]!;
  if (opts.timer !== undefined) room.setSettings(host, { timerSeconds: opts.timer });
  return {
    room,
    scheduler,
    emits,
    ids,
    host,
    act(playerId, msg) {
      const res = room.handle(playerId, msg);
      if (res.ok) room.emit();
      return res;
    },
    valueOf(cardId) {
      return room.round!.cards.find((c) => c.id === cardId)!.value;
    },
    chainValues() {
      return room.round!.chain.map((id) => this.valueOf(id));
    },
  };
}

/** Startet Spiel und Runde, damit Tests direkt in `playing` beginnen. */
export function startRound(h: Harness, categoryId = 'cities'): void {
  expectOk(h.act(h.host, { type: 'start_game', gameId: 'sort' }));
  expectOk(h.act(h.host, { type: 'choose_category', categoryId }));
}

export function expectOk(res: { ok: boolean; message?: string }): void {
  if (!res.ok) throw new Error(`Aktion fehlgeschlagen: ${res.message}`);
}

/** Wählt für den aktiven Spieler eine Poolkarte und legt sie richtig oder falsch. */
export function place(h: Harness, correct: boolean): { cardId: string; gapIndex: number } {
  const round = h.room.round!;
  const active = round.activePlayerId!;
  const cardId = round.pool[0]!;
  const value = h.valueOf(cardId);
  const chain = h.chainValues();
  const order = round.category.order;
  const fits = (gap: number) => {
    const above = chain[gap - 1];
    const below = chain[gap];
    const okAbove = above === undefined || (order === 'desc' ? above >= value : above <= value);
    const okBelow = below === undefined || (order === 'desc' ? value >= below : value <= below);
    return okAbove && okBelow;
  };
  const gaps = Array.from({ length: chain.length + 1 }, (_, i) => i);
  const gapIndex = correct ? gaps.find(fits) : gaps.find((g) => !fits(g));
  if (gapIndex === undefined) throw new Error(`Keine ${correct ? 'richtige' : 'falsche'} Lücke gefunden`);
  expectOk(h.act(active, { type: 'select', turnNo: round.turnNo, cardId, gapIndex }));
  expectOk(h.act(active, { type: 'confirm', turnNo: round.turnNo }));
  return { cardId, gapIndex };
}

/** Lässt eine Platzierung komplett durchlaufen (2 s + 1,5 s). */
export function resolve(h: Harness): void {
  h.scheduler.advance(2000);
  h.scheduler.advance(1500);
}
