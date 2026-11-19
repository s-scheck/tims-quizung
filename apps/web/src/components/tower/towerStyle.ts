import { TOWER_GROUP_LABELS, TOWER_SPECIALS, type TowerSpecial, type TowerSpecialGroup } from '@quiz/shared';

/**
 * Hochstapler: gemeinsame Farben und Texte der Oberfläche. Feste Farben statt Theme-Tönen, weil die Anzeigen über dem
 * hellen Himmel des Spielfelds liegen und in hellem wie dunklem Modus gleich aussehen sollen.
 * Helle Magie ist warm und golden, dunkle Magie violett bis tiefblau.
 */

export interface Tone {
  from: string;
  to: string;
  /** Leuchten für Schatten und Ränder. */
  glow: string;
  /** Helle Schrift auf dunklem Glas. */
  text: string;
  /** Kräftige Schrift auf heller Fläche (App-Rahmen im hellen Modus). */
  ink: string;
  label: string;
}

const TONES: Record<TowerSpecialGroup, Omit<Tone, 'label'>> = {
  light: { from: '#fff0b8', to: '#e2a222', glow: 'rgba(250, 196, 70, 0.6)', text: '#ffe29a', ink: '#c48a10' },
  dark: { from: '#b9a2ff', to: '#3a2894', glow: 'rgba(124, 88, 245, 0.6)', text: '#d4c6ff', ink: '#8a6cf0' },
};

export const GROUP_TONE: Record<TowerSpecialGroup, Tone> = {
  light: { ...TONES.light, label: TOWER_GROUP_LABELS.light },
  dark: { ...TONES.dark, label: TOWER_GROUP_LABELS.dark },
};

export const groupOf = (s: TowerSpecial): TowerSpecialGroup => TOWER_SPECIALS[s]?.group ?? 'dark';
export const toneOf = (s: TowerSpecial): Tone => GROUP_TONE[groupOf(s)];

export const GOLD = '#f6c453';
export const HOLD_GREEN = '#3ee08f';

/** Dunkles Glas über dem Spielfeld. */
export const GLASS = 'bg-[rgba(10,16,30,0.6)] text-white ring-1 ring-white/15 backdrop-blur-md shadow-[0_8px_24px_-10px_rgba(5,10,25,0.6)]';

/** Kurze Wirkung für Karten. Fehlt ein Eintrag (neuer Zauber), gilt der Hinweis aus den Regeln. */
const SHORT: Partial<Record<TowerSpecial, string>> = {
  glue: 'Ranken halten deine Spitze zusammen',
  shrink: 'Aktueller Stein schrumpft',
  beam: 'Fester Balken für eine Weile',
  petrify: 'Dein Turm wird zu Fels',
  shield: 'Blockt den nächsten dunklen Zauber',
  vanish: 'Letzter Stein verschwindet',
  boulder: 'Ziel bekommt einen Riesenstein',
  ice: 'Steine des Ziels werden glatt',
  gust: 'Stoß gegen den Turm des Ziels',
  fog: 'Ziel sieht kurz fast nichts',
  turbo: 'Ziel fällt doppelt schnell',
  round: 'Ziel bekommt einen rollenden Stein',
};
export const shortHint = (s: TowerSpecial): string => SHORT[s] ?? TOWER_SPECIALS[s]?.hint ?? '';

/** Zusatz unter dem Banner, wenn mich ein dunkler Zauber trifft. */
const HIT_HINT: Partial<Record<TowerSpecial, string>> = {
  boulder: 'Dein nächster Stein ist übergroß.',
  ice: 'Deine Steine sind gerade spiegelglatt.',
  gust: 'Festhalten!',
  fog: 'Du siehst kurz fast nichts.',
  turbo: 'Deine Steine fallen doppelt so schnell.',
  round: 'Dein nächster Stein rollt.',
};
export const hitHint = (s: TowerSpecial): string => HIT_HINT[s] ?? '';

/** Wünscht das Gerät weniger Bewegung? Svelte-Übergänge laufen per Skript, die globale CSS-Regel greift dort nicht. */
export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Dauer für Svelte-Übergänge: bei weniger Bewegung sofort. */
export const ms = (duration: number): number => (reducedMotion ? 0 : duration);

/** Meter mit einer Nachkommastelle und Komma, ohne Einheit. */
export function meters(h: number): string {
  return (Math.round(Math.max(0, h) * 10) / 10).toFixed(1).replace('.', ',');
}

/** Genitiv für „Annas Schild“, „Max’ Schild“. */
export function genitive(name: string): string {
  return /[sßxz]$/i.test(name) ? `${name}’` : `${name}s`;
}
