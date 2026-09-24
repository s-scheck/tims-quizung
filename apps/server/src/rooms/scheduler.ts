export interface TimerHandle {
  readonly id: number;
}

/** Zeit und Timer hinter einer Schnittstelle, damit Tests ohne Warten laufen. */
export interface Scheduler {
  now(): number;
  schedule(ms: number, fn: () => void): TimerHandle;
  cancel(handle: TimerHandle): void;
}

export class RealScheduler implements Scheduler {
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  now(): number {
    return Date.now();
  }

  schedule(ms: number, fn: () => void): TimerHandle {
    const id = this.nextId++;
    const t = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.set(id, t);
    return { id };
  }

  cancel(handle: TimerHandle): void {
    const t = this.timers.get(handle.id);
    if (t !== undefined) {
      clearTimeout(t);
      this.timers.delete(handle.id);
    }
  }
}

interface Entry {
  id: number;
  at: number;
  fn: () => void;
}

export class FakeScheduler implements Scheduler {
  private current: number;
  private queue: Entry[] = [];
  private nextId = 1;

  constructor(start = 1_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  schedule(ms: number, fn: () => void): TimerHandle {
    const id = this.nextId++;
    this.queue.push({ id, at: this.current + ms, fn });
    return { id };
  }

  cancel(handle: TimerHandle): void {
    this.queue = this.queue.filter((e) => e.id !== handle.id);
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Lässt die Zeit laufen und führt fällige Timer in Reihenfolge aus. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.queue.filter((e) => e.at <= target).sort((a, b) => a.at - b.at || a.id - b.id);
      const next = due[0];
      if (!next) break;
      this.queue = this.queue.filter((e) => e.id !== next.id);
      this.current = next.at;
      next.fn();
    }
    this.current = target;
  }
}
