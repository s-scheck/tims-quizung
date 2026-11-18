import { client } from './client.svelte.ts';

/**
 * Serverzeit pro Bildschirmbild, für Animationen, die auf allen Geräten gleich laufen sollen
 * (Countdown, fliegende Kugel, pendelnde Hindernisse). `start()` in einem `$effect` aufrufen, es gibt das Aufräumen zurück.
 */
export class FrameClock {
  now = $state(0);

  start(): () => void {
    let raf = 0;
    const tick = () => {
      this.now = client.serverNow();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }
}
