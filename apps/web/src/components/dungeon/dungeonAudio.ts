/**
 * Dungeon-Klänge, komplett mit WebAudio synthetisiert (keine Dateien): Schritte auf Stein, knarrendes Holz,
 * Herzschlag und gedämpfte Trommel in der Spannung, Glocke mit leisem Chor bei richtig, dumpfer Schlag mit
 * Kettenrasseln bei falsch. Alles über einen Bus mit Kompressor und einem dunklen Gewölbehall,
 * leise und gedeckt, damit es atmosphärisch bleibt und nie nervt.
 *
 * Browser starten Audio erst nach einer Nutzergeste: `wakeDungeonAudio()` in pointerdown/keydown aufrufen.
 */

const MUTE_KEY = 'quiz:dungeon:muted';
const MASTER = 0.5;

let muted = readMuted();

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

interface Bus {
  ctx: AudioContext;
  master: GainNode;
  dry: GainNode;
  wet: GainNode;
  noise: AudioBuffer;
}

let bus: Bus | null = null;
const lastPlayed = new Map<string, number>();

function makeBus(): Bus | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);
    const dry = ctx.createGain();
    dry.connect(master);
    // Gewölbe: längeres, dunkles Abklingen.
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp = lp * 0.78 + (Math.random() * 2 - 1) * 0.22;
        d[i] = lp * Math.pow(1 - i / len, 2.6);
      }
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 1.1;
    wet.connect(verb).connect(master);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return { ctx, master, dry, wet, noise };
  } catch {
    return null;
  }
}

/** Innerhalb einer Nutzergeste aufrufen; weckt oder baut den Audio-Kontext. Mehrfach aufrufen ist billig. */
export function wakeAudio(): void {
  if (typeof window === 'undefined') return;
  if (!bus || bus.ctx.state === 'closed') bus = makeBus();
  const ctx = bus?.ctx;
  if (!ctx) return;
  if (ctx.state !== 'running') {
    void ctx.resume().catch(() => undefined);
    // iOS: ein stiller Puffer innerhalb der Geste schaltet die Ausgabe sicher frei.
    try {
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // egal
    }
  }
}

export function setAudioMuted(on: boolean): void {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    // privater Modus
  }
  if (bus) bus.master.gain.setTargetAtTime(on ? 0 : MASTER, bus.ctx.currentTime, 0.03);
}

export function isAudioMuted(): boolean {
  return muted;
}

// ------------------------------------------------------------- Bausteine

function ready(key: string, gapMs = 0): Bus | null {
  if (muted || !bus || bus.ctx.state !== 'running') return null;
  const now = performance.now();
  if (gapMs > 0 && now - (lastPlayed.get(key) ?? -Infinity) < gapMs) return null;
  lastPlayed.set(key, now);
  return bus;
}

function env(b: Bus, t: number, peak: number, attack: number, decay: number, wet = 0): GainNode {
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(b.dry);
  if (wet > 0) {
    const s = b.ctx.createGain();
    s.gain.value = wet;
    g.connect(s).connect(b.wet);
  }
  return g;
}

function tone(b: Bus, o: { f: number; t?: number; to?: number; glide?: number; type?: OscillatorType; gain: number; attack?: number; decay: number; wet?: number; detune?: number }): void {
  const t = b.ctx.currentTime + (o.t ?? 0);
  const osc = b.ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? o.decay));
  if (o.detune) osc.detune.value = o.detune;
  const g = env(b, t, o.gain, o.attack ?? 0.004, o.decay, o.wet);
  osc.connect(g);
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.004) + o.decay + 0.05);
}

function noise(b: Bus, o: { t?: number; gain: number; attack?: number; decay: number; filter?: BiquadFilterType; f: number; to?: number; q?: number; wet?: number }): void {
  const t = b.ctx.currentTime + (o.t ?? 0);
  const src = b.ctx.createBufferSource();
  src.buffer = b.noise;
  src.loop = true;
  const flt = b.ctx.createBiquadFilter();
  flt.type = o.filter ?? 'bandpass';
  flt.frequency.setValueAtTime(o.f, t);
  if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t + (o.attack ?? 0.004) + o.decay);
  flt.Q.value = o.q ?? 1;
  const g = env(b, t, o.gain, o.attack ?? 0.004, o.decay, o.wet);
  src.connect(flt).connect(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + (o.attack ?? 0.004) + o.decay + 0.05);
}

/** Glocke; `t` ist der Versatz ab jetzt in Sekunden. */
function bell(b: Bus, f: number, t: number, gain: number, decay = 1.2, wet = 0.45): void {
  tone(b, { f, t, gain, decay, wet, attack: 0.003 });
  tone(b, { f: f * 2.76, t, gain: gain * 0.3, decay: decay * 0.4, wet, attack: 0.002 });
  tone(b, { f: f * 5.4, t, gain: gain * 0.1, decay: decay * 0.18, wet, attack: 0.002 });
}

/** Ein Schritt auf Stein: gedämpfter Tritt plus Sandknirschen. */
function step(b: Bus, t: number, gain: number): void {
  const f = 95 + Math.random() * 30;
  tone(b, { t, f, to: f * 0.6, gain: gain * 0.9, decay: 0.07, wet: 0.15 });
  noise(b, { t, gain: gain * 0.7, decay: 0.05 + Math.random() * 0.03, filter: 'bandpass', f: 1400 + Math.random() * 900, q: 1.4, wet: 0.2 });
}

/** Holzknarren: gefilterte Sägezahn-Reibung mit schnellem Zittern. */
function creak(b: Bus, t: number, gain: number, length = 0.55, pitch = 1): void {
  const at = b.ctx.currentTime + t;
  const osc = b.ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(70 * pitch, at);
  osc.frequency.linearRampToValueAtTime(115 * pitch, at + length * 0.6);
  osc.frequency.linearRampToValueAtTime(90 * pitch, at + length);
  const bp = b.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 * pitch;
  bp.Q.value = 5;
  const trem = b.ctx.createGain();
  const lfo = b.ctx.createOscillator();
  const depth = b.ctx.createGain();
  lfo.frequency.setValueAtTime(19, at);
  lfo.frequency.linearRampToValueAtTime(31, at + length);
  depth.gain.value = 0.5;
  trem.gain.value = 0.5;
  lfo.connect(depth).connect(trem.gain);
  const g = env(b, at, gain, 0.08, length, 0.25);
  osc.connect(bp).connect(trem).connect(g);
  osc.start(at);
  lfo.start(at);
  osc.stop(at + length + 0.15);
  lfo.stop(at + length + 0.15);
}

/** Schwerer, dumpfer Schlag (Tür knallt). */
function thud(b: Bus, t: number, gain: number): void {
  tone(b, { t, f: 72, to: 38, gain, decay: 0.45, glide: 0.3, wet: 0.35 });
  noise(b, { t, gain: gain * 0.8, decay: 0.22, filter: 'lowpass', f: 420, q: 0.7, wet: 0.4 });
  noise(b, { t, gain: gain * 0.3, decay: 0.04, filter: 'bandpass', f: 1800, q: 1 });
}

/** Ketten und Eisen: viele kleine metallische Klicks. */
function chains(b: Bus, t: number, gain: number, count = 9, span = 0.45): void {
  for (let i = 0; i < count; i++) {
    const at = t + (i / count) * span + Math.random() * 0.03;
    const f = 1800 + Math.random() * 2200;
    tone(b, { t: at, f, gain: gain * (0.6 + Math.random() * 0.4), decay: 0.06 + Math.random() * 0.05, wet: 0.3 });
    tone(b, { t: at, f: f * 1.47, gain: gain * 0.35, decay: 0.04, wet: 0.2 });
  }
}

const semis = (base: number, n: number) => base * Math.pow(2, n / 12);

// ------------------------------------------------------------- Klänge

export const dungeonSound = {
  /** Ein paar Schritte (eigene lauter, fremde leiser). */
  steps(count = 4, gain = 0.07): void {
    const b = ready(`steps${gain}`, 300);
    if (!b) return;
    for (let i = 0; i < count; i++) step(b, i * 0.21, gain * (i === count - 1 ? 0.8 : 1));
  },

  /** In die Tür treten: Holz knarrt. */
  creak(): void {
    const b = ready('creak', 400);
    if (!b) return;
    creak(b, 0, 0.05, 0.6);
  },

  /** Herzschlag mit gedämpfter Trommel unter der Spannung, `ms` lang. */
  suspense(ms: number): void {
    const b = ready('suspense', 800);
    if (!b) return;
    const beats = Math.max(1, Math.floor(ms / 520));
    for (let i = 0; i < beats; i++) {
      const t = i * 0.52;
      const k = 0.7 + (i / beats) * 0.3;
      tone(b, { t, f: 58, to: 42, gain: 0.16 * k, decay: 0.16, wet: 0.2 });
      tone(b, { t: t + 0.16, f: 52, to: 40, gain: 0.11 * k, decay: 0.14, wet: 0.2 });
    }
    // Leiser Trommelwirbel, der anschwillt.
    noise(b, { gain: 0.035, attack: Math.max(0.2, ms / 1000 - 0.1), decay: 0.15, filter: 'bandpass', f: 220, q: 0.8, wet: 0.3 });
  },

  /** Richtig: Tür schwingt auf, Glocke und leiser Chor-Akkord. `gain` kleiner für andere Spieler. */
  correct(gain = 1): void {
    const b = ready(`correct${gain}`, 150);
    if (!b) return;
    creak(b, 0, 0.035 * gain, 0.45, 1.3);
    const t = 0.12;
    bell(b, 784, t, 0.06 * gain, 1.6);
    bell(b, 1175, t + 0.08, 0.04 * gain, 1.4);
    if (gain < 0.8) return;
    // Chor: gestimmte Dreiecke mit langsamem Einschwingen, leicht verstimmt.
    for (const [i, n] of [0, 4, 7, 12].entries()) {
      for (const d of [-7, 7]) tone(b, { t: 0.15 + i * 0.02, f: semis(261.63, n), gain: 0.016, attack: 0.25, decay: 1.4, type: 'triangle', wet: 0.6, detune: d });
    }
  },

  /** Falsch: dumpfer Schlag, Gitter rasselt herunter. */
  wrong(gain = 1): void {
    const b = ready(`wrong${gain}`, 150);
    if (!b) return;
    thud(b, 0, 0.22 * gain);
    chains(b, 0.08, 0.018 * gain, gain < 0.8 ? 5 : 10, 0.4);
    thud(b, 0.5, 0.1 * gain);
    if (gain < 0.8) return;
    tone(b, { t: 0.15, f: 196, to: 185, gain: 0.03, attack: 0.05, decay: 0.9, type: 'triangle', wet: 0.4 });
    tone(b, { t: 0.15, f: 233, to: 220, gain: 0.025, attack: 0.05, decay: 0.9, type: 'triangle', wet: 0.4 });
  },

  /** Ausgang erreicht: kleine Fanfare aus Glocken und Bläser-Akkord. */
  exit(): void {
    const b = ready('exit', 2000);
    if (!b) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(b, f, i * 0.11, 0.06, 1.2, 0.5));
    for (const f of [261.63, 329.63, 392, 523.25]) {
      tone(b, { t: 0.44, f, gain: 0.03, attack: 0.06, decay: 1.6, type: 'sawtooth', wet: 0.5, detune: 5 });
      tone(b, { t: 0.44, f, gain: 0.02, attack: 0.06, decay: 1.6, type: 'triangle', wet: 0.5, detune: -5 });
    }
  },

  /** Antwort festgelegt: Feder kratzt, kurzer Holzklopfer. */
  answer(): void {
    const b = ready('answer', 300);
    if (!b) return;
    noise(b, { gain: 0.04, attack: 0.02, decay: 0.12, f: 3200, to: 5200, q: 2 });
    tone(b, { t: 0.1, f: 330, gain: 0.04, decay: 0.12, wet: 0.2 });
  },

  /** Neuer Raum, neue Türwahl: Gitter heben sich leise. */
  newRound(): void {
    const b = ready('newRound', 1500);
    if (!b) return;
    chains(b, 0, 0.008, 8, 0.7);
    tone(b, { f: 110, gain: 0.03, attack: 0.3, decay: 0.8, type: 'triangle', wet: 0.5 });
  },
};
