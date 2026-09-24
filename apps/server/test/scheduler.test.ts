import { describe, expect, test } from 'bun:test';
import { FakeScheduler } from '../src/rooms/scheduler.ts';

describe('FakeScheduler', () => {
  test('führt Timer in zeitlicher Reihenfolge aus', () => {
    const s = new FakeScheduler(0);
    const log: string[] = [];
    s.schedule(300, () => log.push('c'));
    s.schedule(100, () => log.push('a'));
    s.schedule(200, () => log.push('b'));
    s.advance(250);
    expect(log).toEqual(['a', 'b']);
    expect(s.now()).toBe(250);
    s.advance(100);
    expect(log).toEqual(['a', 'b', 'c']);
  });

  test('cancel entfernt Timer', () => {
    const s = new FakeScheduler(0);
    let ran = false;
    const h = s.schedule(100, () => (ran = true));
    s.cancel(h);
    s.advance(1000);
    expect(ran).toBe(false);
    expect(s.pending).toBe(0);
  });

  test('Timer, die in Callbacks geplant werden, laufen im selben advance', () => {
    const s = new FakeScheduler(0);
    const log: number[] = [];
    s.schedule(100, () => {
      log.push(s.now());
      s.schedule(50, () => log.push(s.now()));
    });
    s.advance(200);
    expect(log).toEqual([100, 150]);
  });
});
