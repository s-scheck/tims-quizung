import type { MorseBeep } from '@quiz/shared';

const TONE_HZ = 650;

export interface AudioReadiness {
  ok: boolean;
  /** Zustand des Audio-Kontexts oder die Fehlermeldung, für Hinweise an den Host. */
  state: string;
}

/**
 * Blinkt (und beim Host: tönt) nach einem Zeitplan, der relativ zu einem gemeinsamen Startzeitpunkt läuft.
 * Alle Geräte rufen `schedule` mit derselben Serverzeit auf, nur der Host mit Ton.
 *
 * Browser halten Audio-Kontexte gern an: ohne Nutzergeste, nach App-Wechseln, auf iOS auch als
 * „interrupted“. Deshalb wird vor jeder Wiedergabe geweckt und notfalls ein frischer Kontext gebaut.
 */
export class MorsePlayer {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private readonly onLight: (on: boolean) => void,
    private readonly onDone: () => void,
  ) {}

  /** Innerhalb einer Nutzergeste aufrufen, sonst bleibt der Browser stumm. */
  async prepareAudio(): Promise<AudioReadiness> {
    try {
      if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext();
      if (this.ctx.state !== 'running') await this.ctx.resume();
      if (this.ctx.state !== 'running') {
        // Zweiter Versuch mit frischem Kontext, falls der alte vom System eingefroren wurde.
        void this.ctx.close().catch(() => undefined);
        this.ctx = new AudioContext();
        await this.ctx.resume();
      }
      return { ok: this.ctx.state === 'running', state: this.ctx.state };
    } catch (err) {
      return { ok: false, state: err instanceof Error ? err.message : String(err) };
    }
  }

  get audioState(): string {
    return this.ctx?.state ?? 'kein Kontext';
  }

  /**
   * Plant Licht und optional Ton. `delayMs` ist die Zeit bis zum Start, negativ heißt: läuft schon.
   * Signale, die bereits vorbei sind, werden übersprungen.
   */
  schedule(beeps: MorseBeep[], delayMs: number, withSound: boolean): void {
    this.stop();
    const last = beeps[beeps.length - 1];
    if (!last) return;
    const end = delayMs + last.at + last.duration;
    if (end <= 0) {
      this.onDone();
      return;
    }

    for (const b of beeps) {
      const on = delayMs + b.at;
      const off = on + b.duration;
      if (off <= 0) continue;
      if (on <= 0) this.onLight(true);
      else this.timers.push(setTimeout(() => this.onLight(true), on));
      this.timers.push(setTimeout(() => this.onLight(false), off));
    }
    this.timers.push(
      setTimeout(() => {
        this.timers = [];
        this.onLight(false);
        this.onDone();
      }, end + 30),
    );

    if (!withSound || !this.ctx) return;
    const planned = performance.now();
    const startSound = () => {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      // Falls erst geweckt werden musste, ist inzwischen Zeit vergangen.
      this.scheduleSound(ctx, beeps, delayMs - (performance.now() - planned));
    };
    if (this.ctx.state === 'running') startSound();
    else void this.ctx.resume().then(startSound, () => undefined);
  }

  private scheduleSound(ctx: AudioContext, beeps: MorseBeep[], delayMs: number): void {
    const last = beeps[beeps.length - 1]!;
    const end = delayMs + last.at + last.duration;
    if (end <= 0) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = TONE_HZ;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    for (const b of beeps) {
      const start = now + (delayMs + b.at) / 1000;
      const stop = start + b.duration / 1000;
      if (stop <= now) continue;
      const s = Math.max(start, now);
      gain.gain.setValueAtTime(0, s);
      gain.gain.linearRampToValueAtTime(0.5, s + 0.004);
      gain.gain.setValueAtTime(0.5, Math.max(s + 0.004, stop - 0.004));
      gain.gain.linearRampToValueAtTime(0, stop);
    }
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + Math.max(0, delayMs) / 1000);
    osc.stop(now + end / 1000 + 0.05);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      if (this.osc === osc) this.osc = null;
    };
    this.osc = osc;
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.osc) {
      try {
        this.osc.stop();
      } catch {
        // schon beendet oder nie gestartet
      }
      this.osc = null;
    }
    this.onLight(false);
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
