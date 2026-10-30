/**
 * Kurzer Buzzer-Ton für das Host-Gerät bei Filmfotos.
 * Browser spielen erst nach einer Nutzergeste, deshalb weckt `unlockBuzzer` den Kontext bei jedem Antippen.
 */
let ctx: AudioContext | null = null;

export function unlockBuzzer(): void {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  } catch {
    // Ohne Audio bleibt es beim großen Namen auf allen Geräten.
  }
}

export function playBuzzer(): void {
  unlockBuzzer();
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
