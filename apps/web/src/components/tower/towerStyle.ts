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

/** Kurze Wirkung (Zeile im Info-Popover und am Fernseher). Fehlt ein Eintrag (neuer Zauber), gilt der Hinweis aus den Regeln. */
const SHORT: Partial<Record<TowerSpecial, string>> = {
  glue: 'Nächste 5 Steine verketten sich',
  grow: 'Nächste 3 Steine anderthalbmal so groß',
  heavy: 'Nächster Stein bleischwer',
  pick: 'Nächste 3 Steine aus zwei Formen wählen',
  beam: 'Fester Balken, dauerhaft',
  petrify: 'Dein Turm wird zu Fels',
  vanish: 'Letzter Stein verschwindet',
  mini: 'Ziel bekommt 3 winzige Steine',
  ice: 'Steine des Ziels werden glatt',
  gust: 'Stoß gegen den Turm des Ziels',
  fog: 'Ziel sieht kurz fast nichts',
  turbo: 'Ziel fällt doppelt schnell',
  round: 'Ziel bekommt einen rollenden Stein',
};
export const shortHint = (s: TowerSpecial): string => SHORT[s] ?? TOWER_SPECIALS[s]?.hint ?? '';

/** Ganz kurze Wirkung für die schlanken Angebots-Chips am Handy (eine Zeile auf schmalen Geräten). */
export const tinyHint = (s: TowerSpecial): string => TOWER_SPECIALS[s]?.short ?? shortHint(s);

/** Wirkung ohne „Gegner:“, für Ticker und Treffer-Meldung („Mini-Steine von Ben · 3 winzige Steine“). */
const EFFECT: Partial<Record<TowerSpecial, string>> = {
  glue: '5 Steine verketten sich',
  grow: '3 große Steine',
  heavy: 'bleischwerer Stein',
  pick: '3 Steine zur Wahl',
  beam: 'fester Balken',
  petrify: 'Turm wird Fels',
  vanish: 'letzter Stein weg',
  mini: '3 winzige Steine',
  ice: 'glatte Steine',
  gust: 'Stoß von der Seite',
  fog: 'Nebel',
  turbo: 'fällt doppelt schnell',
  round: 'rollender Stein',
};
export const effectHint = (s: TowerSpecial): string => EFFECT[s] ?? tinyHint(s).replace(/^Gegner:\s*/, '');

/**
 * Glücks-Slot: eigene Farbe (Türkis wie ein Glücksklee im Mondlicht), klar getrennt von Gold (hell), Violett (dunkel)
 * und dem Grün des Halte-Alarms.
 */
export const LUCK = { ring: '#4fe3d2', glow: 'rgba(79, 227, 210, 0.55)', soft: 'rgba(79, 227, 210, 0.16)', text: '#9ff5ea' } as const;

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
