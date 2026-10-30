import type { AudioReadiness } from './morseAudio.ts';

/**
 * Kurzer Buzzer-Ton für das Host-Gerät bei Filmfotos, nach dem Muster von `MorsePlayer`:
 * innerhalb einer Nutzergeste mit `prepareAudio` wecken, am Ende `dispose`.
 */
export class BuzzerPlayer {
  private ctx: AudioContext | null = null;

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

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  play(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.45);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.setValueAtTime(0.25, now + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}
