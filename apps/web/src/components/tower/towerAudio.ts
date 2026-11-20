import type { TowerSpecial } from '@quiz/shared';

/**
 * Hochstapler-Klänge, komplett mit WebAudio synthetisiert (keine Dateien): Holz-/Stein-Klacken mit wenigen
 * Teiltönen, weiche Glocken, gefiltertes Rauschen. Alles läuft über einen Bus mit Kompressor und einem kleinen,
 * künstlichen Hall, damit es edel und zusammenhängend klingt und nie piepsig oder zu laut wird.
 *
 * Browser starten Audio erst nach einer Nutzergeste: `wakeTowerAudio()` in pointerdown/keydown aufrufen.
 * Nur auf dem eigenen Handy, nie am Fernseher. Stumm schalten über `setTowerMuted` (wird gemerkt).
 */

const MUTE_KEY = 'quiz:tower:muted';
const MASTER = 0.55;

let muted = readMuted();

function readMuted(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

type Wave = OscillatorType;

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
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    const dry = ctx.createGain();
    dry.connect(master);
    // Kleiner Raum: abklingendes Rauschen als Impulsantwort, leicht tiefpassgefiltert.
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.3);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        d[i] = lp * Math.pow(1 - i / len, 3.2);
      }
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
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
export function wakeTowerAudio(): void {
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

export function setTowerMuted(on: boolean): void {
  muted = on;
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    // privater Modus
  }
  if (bus) bus.master.gain.setTargetAtTime(on ? 0 : MASTER, bus.ctx.currentTime, 0.03);
}

export function isTowerMuted(): boolean {
  return muted;
}

// ------------------------------------------------------------- Bausteine

/** Laufender Kontext oder null; drosselt gleiche Klänge auf `gapMs`. */
function ready(key: string, gapMs = 0): Bus | null {
  if (muted || !bus || bus.ctx.state !== 'running') return null;
  const now = performance.now();
  if (gapMs > 0 && now - (lastPlayed.get(key) ?? -Infinity) < gapMs) return null;
  lastPlayed.set(key, now);
  return bus;
}

/** Ausgang mit Hüllkurve, optional mit Hallanteil. */
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

function tone(b: Bus, o: { f: number; t?: number; to?: number; glide?: number; type?: Wave; gain: number; attack?: number; decay: number; wet?: number; detune?: number }): void {
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

function noise(b: Bus, o: { t?: number; gain: number; attack?: number; decay: number; filter?: BiquadFilterType; f: number; to?: number; q?: number; wet?: number; am?: number }): void {
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
  let out: AudioNode = flt;
  if (o.am) {
    // Amplitudenmodulation (Rollen, Rascheln).
    const am = b.ctx.createGain();
    const lfo = b.ctx.createOscillator();
    const depth = b.ctx.createGain();
    lfo.frequency.value = o.am;
    depth.gain.value = 0.5;
    am.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    lfo.start(t);
    lfo.stop(t + (o.attack ?? 0.004) + o.decay + 0.05);
    flt.connect(am);
    out = am;
  }
  src.connect(flt);
  out.connect(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + (o.attack ?? 0.004) + o.decay + 0.05);
}

/** Glocke: Grundton mit unharmonischen Teiltönen, die schneller abklingen. */
function bell(b: Bus, f: number, t: number, gain: number, decay = 0.9, wet = 0.35): void {
  tone(b, { f, t, gain, decay, wet, attack: 0.003 });
  tone(b, { f: f * 2.76, t, gain: gain * 0.32, decay: decay * 0.45, wet, attack: 0.002 });
  tone(b, { f: f * 5.4, t, gain: gain * 0.12, decay: decay * 0.2, wet, attack: 0.002 });
}

/** Holz/Stein: wenige Moden mit kurzem Abklingen und ein Anschlag-Klick. */
function knock(b: Bus, f: number, gain: number, length: number, bright: number, wet = 0.12): void {
  const modes: [number, number, number][] = [
    [1, 1, 1],
    [2.32, 0.5, 0.55],
    [4.25, 0.24, 0.3],
    [6.8, 0.1, 0.18],
  ];
  for (const [m, g, d] of modes) tone(b, { f: f * m, gain: gain * g, decay: length * d, attack: 0.0015, wet });
  noise(b, { gain: gain * 0.6, decay: 0.02 + 0.015 * bright, filter: 'lowpass', f: 1200 + 3800 * bright, q: 0.7 });
}

const semis = (base: number, n: number) => base * Math.pow(2, n / 12);

// ------------------------------------------------------------- Klänge

export const towerSound = {
  /** Schieben: feiner, trockener Tick, je nach Seite leicht anders. */
  shift(x: number): void {
    const b = ready('shift', 25);
    if (!b) return;
    const f = 2300 + x * 70;
    noise(b, { gain: 0.06, decay: 0.012, f, q: 7 });
    tone(b, { f: f * 0.55, gain: 0.018, decay: 0.022 });
  },

  /** Drehen: kurzes Wischen mit einem weichen Klick. */
  turn(dir: -1 | 1): void {
    const b = ready('turn', 40);
    if (!b) return;
    const [a, c] = dir > 0 ? [900, 2600] : [2600, 900];
    noise(b, { gain: 0.05, attack: 0.02, decay: 0.07, f: a, to: c, q: 2.5 });
    tone(b, { f: dir > 0 ? 620 : 740, to: dir > 0 ? 930 : 560, gain: 0.022, decay: 0.07, type: 'triangle' });
  },

  /** Aufsetzen: Holz-„Tock“, Stärke und Tonhöhe nach Aufprall und Größe. */
  land(impact: number, size = 1): void {
    const b = ready('land', 30);
    if (!b) return;
    const k = Math.min(1, Math.max(0, impact));
    const f = (190 / Math.sqrt(size)) * (0.96 + Math.random() * 0.08);
    knock(b, f, 0.1 + 0.28 * k, 0.16 + 0.12 * k, k);
    // Gewicht: ein tiefer Schub darunter.
    tone(b, { f: 95 / Math.sqrt(size), to: 58, gain: 0.08 + 0.18 * k, decay: 0.14, glide: 0.12 });
  },

  /** Liegende Steine stoßen zusammen: leiser, heller. */
  bump(impact: number): void {
    const b = ready('bump', 55);
    if (!b) return;
    const k = Math.min(1, Math.max(0, impact));
    knock(b, 240 + Math.random() * 120, 0.05 + 0.16 * k, 0.1 + 0.08 * k, k * 0.7, 0.08);
  },

  /** Absturz: fallender Pfeifton, dann ein dumpfer Aufschlag in der Ferne. */
  lost(): void {
    const b = ready('lost', 250);
    if (!b) return;
    tone(b, { f: 560, to: 150, gain: 0.05, attack: 0.03, decay: 0.55, glide: 0.55, type: 'triangle', wet: 0.2 });
    noise(b, { gain: 0.035, attack: 0.05, decay: 0.45, filter: 'bandpass', f: 1600, to: 300, q: 1.2 });
    noise(b, { t: 0.5, gain: 0.12, decay: 0.3, filter: 'lowpass', f: 320, q: 0.8, wet: 0.25 });
    tone(b, { t: 0.5, f: 75, to: 45, gain: 0.12, decay: 0.3 });
  },

  /** Wanken: leises Holzknarzen. */
  wobble(amount: number): void {
    const b = ready('wobble', 900);
    if (!b) return;
    const k = Math.min(1, amount);
    const t = b.ctx.currentTime;
    const osc = b.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85 + Math.random() * 30, t);
    osc.frequency.linearRampToValueAtTime(70, t + 0.4);
    const bp = b.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 6;
    const trem = b.ctx.createGain();
    const lfo = b.ctx.createOscillator();
    const depth = b.ctx.createGain();
    lfo.frequency.value = 23;
    depth.gain.value = 0.5;
    trem.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const g = env(b, t, 0.035 + 0.04 * k, 0.06, 0.38, 0.1);
    osc.connect(bp).connect(trem).connect(g);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.5);
    lfo.stop(t + 0.5);
  },

  /** Halten über der Linie: ein Marimba-Ton je Zwölftel, Schritt für Schritt höher. */
  hold(progress: number): void {
    const b = ready('hold', 80);
    if (!b) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
    const n = scale[Math.min(scale.length - 1, Math.max(0, Math.round(progress * 12)))]!;
    const f = semis(392, n);
    tone(b, { f, gain: 0.05 + 0.04 * progress, decay: 0.28, wet: 0.2 });
    tone(b, { f: f * 4, gain: 0.012, decay: 0.05 });
    tone(b, { f: f * 0.5, gain: 0.02 + 0.03 * progress, decay: 0.18, type: 'triangle' });
  },

  /** Halten abgebrochen: zwei weiche Töne abwärts. */
  holdLost(): void {
    const b = ready('holdLost', 400);
    if (!b) return;
    tone(b, { f: 659, gain: 0.045, decay: 0.2, type: 'triangle', wet: 0.2 });
    tone(b, { t: 0.13, f: 494, to: 470, gain: 0.045, decay: 0.35, type: 'triangle', wet: 0.2 });
  },

  /** Höhenmarke überbaut: helles Glockenpaar. */
  mark(): void {
    const b = ready('mark', 300);
    if (!b) return;
    bell(b, 1046.5, b.ctx.currentTime, 0.06, 0.8);
    bell(b, 1568, b.ctx.currentTime + 0.09, 0.06, 1.1);
  },

  /** Ziel geschafft: Arpeggio mit Glocken, Akkord und Funkeln. */
  finish(): void {
    const b = ready('finish', 2000);
    if (!b) return;
    const t = b.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(b, f, t + i * 0.09, 0.07, 0.9, 0.4));
    for (const f of [523.25, 659.25, 783.99]) tone(b, { t: 0.36, f, gain: 0.04, attack: 0.04, decay: 1.4, type: 'triangle', wet: 0.4 });
    noise(b, { t: 0.36, gain: 0.03, attack: 0.05, decay: 1.2, filter: 'highpass', f: 6500, q: 0.5, wet: 0.5, am: 14 });
  },

  /** Zauber-Angebot erscheint: Schimmern aus hohen Tönen. */
  offer(): void {
    const b = ready('offer', 600);
    if (!b) return;
    const notes = [1318.5, 1568, 1975.5, 2349.3, 2637];
    notes.forEach((f, i) => tone(b, { t: i * 0.045, f, gain: 0.03, decay: 0.5, wet: 0.5 }));
    tone(b, { f: 659.25, gain: 0.025, attack: 0.08, decay: 0.7, type: 'triangle', wet: 0.4 });
  },

  /** Helle Magie gewählt: Dur-Aufstieg, licht. */
  light(): void {
    const b = ready('choose', 300);
    if (!b) return;
    const t = b.ctx.currentTime;
    [659.25, 830.6, 987.8, 1318.5].forEach((f, i) => bell(b, f, t + i * 0.06, 0.05, 0.7, 0.45));
    noise(b, { gain: 0.02, attack: 0.08, decay: 0.6, filter: 'highpass', f: 7000, wet: 0.5, am: 18 });
  },

  /** Dunkle Magie gewählt: tiefer, verminderter Klang. */
  dark(): void {
    const b = ready('choose', 300);
    if (!b) return;
    for (const [i, f] of [220, 261.6, 311.1].entries()) tone(b, { t: i * 0.05, f, gain: 0.05, attack: 0.03, decay: 0.8, type: 'sawtooth', wet: 0.4, detune: (i - 1) * 6 });
    noise(b, { gain: 0.04, attack: 0.1, decay: 0.6, filter: 'lowpass', f: 500, to: 180, wet: 0.3 });
    tone(b, { f: 110, to: 82, gain: 0.08, attack: 0.02, decay: 0.7 });
  },

  /** Eigenen Zauber abgeschickt: Wusch nach oben. */
  cast(): void {
    const b = ready('cast', 200);
    if (!b) return;
    noise(b, { gain: 0.07, attack: 0.08, decay: 0.3, f: 400, to: 3800, q: 2, wet: 0.3 });
    tone(b, { f: 330, to: 990, gain: 0.03, attack: 0.05, decay: 0.3, glide: 0.3, type: 'triangle', wet: 0.3 });
  },

  /** Ein dunkler Zauber trifft den eigenen Turm. */
  hit(special: TowerSpecial): void {
    const b = ready('hit', 150);
    if (!b) return;
    switch (special) {
      case 'gust':
        noise(b, { gain: 0.12, attack: 0.25, decay: 0.75, f: 300, to: 1300, q: 1.2, wet: 0.2 });
        noise(b, { t: 0.3, gain: 0.06, attack: 0.1, decay: 0.6, f: 1100, to: 350, q: 1.5 });
        break;
      case 'ice':
        for (let i = 0; i < 7; i++) tone(b, { t: i * 0.04, f: 2000 + Math.random() * 2400, gain: 0.025, decay: 0.35, wet: 0.5 });
        bell(b, 2093, b.ctx.currentTime + 0.05, 0.035, 1.2, 0.5);
        break;
      case 'fog':
        noise(b, { gain: 0.09, attack: 0.35, decay: 0.9, filter: 'lowpass', f: 380, q: 0.7, wet: 0.4 });
        tone(b, { f: 110, gain: 0.04, attack: 0.3, decay: 0.9, type: 'triangle', wet: 0.3 });
        tone(b, { f: 164.8, gain: 0.03, attack: 0.3, decay: 0.9, type: 'triangle', wet: 0.3 });
        break;
      case 'turbo':
        tone(b, { f: 110, to: 440, gain: 0.04, attack: 0.03, decay: 0.45, glide: 0.45, type: 'sawtooth', wet: 0.1 });
        for (let i = 0; i < 4; i++) noise(b, { t: i * 0.07, gain: 0.05, decay: 0.015, f: 3000, q: 5 });
        break;
      case 'mini':
        // Alles schnurrt zusammen: hohe, fallende Piepser
        for (let i = 0; i < 3; i++) tone(b, { t: i * 0.07, f: 1320 - i * 260, to: 1700 - i * 200, gain: 0.03, decay: 0.12, glide: 0.08, type: 'triangle', wet: 0.3 });
        noise(b, { gain: 0.05, attack: 0.02, decay: 0.25, f: 3200, to: 1200, q: 3 });
        break;
      case 'round':
        noise(b, { gain: 0.08, attack: 0.08, decay: 0.7, filter: 'bandpass', f: 380, q: 2, am: 11, wet: 0.2 });
        tone(b, { f: 300, to: 180, gain: 0.04, decay: 0.3, type: 'triangle' });
        break;
      default:
        tone(b, { f: 233, gain: 0.05, decay: 0.4, type: 'triangle', wet: 0.3 });
        tone(b, { f: 220, gain: 0.05, decay: 0.5, type: 'triangle', wet: 0.3 });
    }
  },

  /** Versteinern: Mahlen, ein tiefer Schlag und Knistern. */
  petrify(): void {
    const b = ready('petrify', 300);
    if (!b) return;
    noise(b, { gain: 0.09, attack: 0.05, decay: 0.55, f: 420, to: 160, q: 1.6, am: 30 });
    tone(b, { t: 0.08, f: 80, to: 50, gain: 0.16, decay: 0.4 });
    for (let i = 0; i < 6; i++) noise(b, { t: 0.05 + Math.random() * 0.4, gain: 0.04, decay: 0.012, f: 2500 + Math.random() * 2500, q: 4 });
  },

  /** Ranken: Rascheln und ein warmer, aufsteigender Klang. */
  vines(): void {
    const b = ready('vines', 300);
    if (!b) return;
    noise(b, { gain: 0.06, attack: 0.12, decay: 0.55, filter: 'highpass', f: 2500, q: 0.6, am: 20, wet: 0.2 });
    [392, 523.25, 659.25].forEach((f, i) => tone(b, { t: 0.05 + i * 0.08, f, gain: 0.035, attack: 0.04, decay: 0.5, type: 'triangle', wet: 0.4 }));
  },

  /** Wegzaubern: Puff. */
  vanish(): void {
    const b = ready('vanish', 150);
    if (!b) return;
    noise(b, { gain: 0.1, attack: 0.01, decay: 0.2, f: 1400, to: 280, q: 0.9, wet: 0.25 });
    tone(b, { f: 600, to: 1500, gain: 0.035, decay: 0.08, glide: 0.06 });
  },

  /** Vergrößern: Ton, der aufbläht und tief landet. */
  grow(): void {
    const b = ready('grow', 200);
    if (!b) return;
    tone(b, { f: 330, to: 165, gain: 0.05, attack: 0.03, decay: 0.45, glide: 0.35, type: 'triangle', wet: 0.35 });
    tone(b, { f: 495, to: 247, gain: 0.03, attack: 0.03, decay: 0.45, glide: 0.35, wet: 0.35 });
  },

  /** Schwerer Stein bereit: tiefer Amboss-Klang. */
  heavy(): void {
    const b = ready('heavy', 250);
    if (!b) return;
    const t = b.ctx.currentTime;
    bell(b, 220, t, 0.07, 1.1, 0.4);
    bell(b, 331, t + 0.01, 0.04, 0.9, 0.4);
    tone(b, { f: 70, to: 48, gain: 0.14, decay: 0.4 });
  },

  /** Schwerer Stein setzt auf: dumpfer Eisen-Schlag mit Nachklang. */
  thud(impact: number): void {
    const b = ready('thud', 120);
    if (!b) return;
    const k = Math.min(1, Math.max(0.3, impact));
    tone(b, { f: 58, to: 34, gain: 0.22 + 0.12 * k, attack: 0.005, decay: 0.45 });
    noise(b, { gain: 0.1 * k, attack: 0.005, decay: 0.3, filter: 'lowpass', f: 420, q: 0.8, wet: 0.25 });
    bell(b, 180, b.ctx.currentTime + 0.01, 0.035 * k, 0.7, 0.35);
  },

  /** Steinwahl: zwei kurze, fragende Töne. */
  pick(): void {
    const b = ready('pick', 200);
    if (!b) return;
    tone(b, { f: 660, gain: 0.035, decay: 0.12, type: 'triangle', wet: 0.3 });
    tone(b, { t: 0.1, f: 880, gain: 0.035, decay: 0.18, type: 'triangle', wet: 0.3 });
  },

  /** Stützbalken: schwerer Stahlträger rastet ein. */
  beam(): void {
    const b = ready('beam', 300);
    if (!b) return;
    knock(b, 120, 0.3, 0.35, 0.6, 0.25);
    tone(b, { f: 70, to: 45, gain: 0.15, decay: 0.3 });
  },
};
