/**
 * Einpassen der Fernsehansicht (/screen): Alles muss ohne Scrollen auf einen Bildschirm passen.
 *
 * Drei Stellschrauben, in dieser Reihenfolge:
 * 1. Bilder und Karte schrumpfen (`--fit-media`), Text hat Vorrang.
 * 2. Lange Listen bekommen mehr Spalten (`--fit-cols`, Klassen `.fit-cols` und `.fit-grid` in app.css).
 * 3. Die Grundschrift von <html> sinkt. Tailwind rechnet Schrift und Abstände in rem, beides schrumpft zusammen.
 * Unter der Mindestschrift geht es notfalls weiter, damit nie Text abgeschnitten wird.
 */

export interface FitState {
  /** Grundschrift in px (font-size von <html>) */
  font: number;
  /** Spalten langer Listen */
  cols: number;
  /** Faktor für Bild- und Kartenhöhen */
  media: number;
}

export interface FitOptions {
  maxFont: number;
  minFont: number;
  /** Notfallgrenze unter der Mindestschrift */
  floorFont: number;
  maxCols: number;
  minMedia: number;
}

export const FIT_DEFAULTS: FitOptions = { maxFont: 16, minFont: 12, floorFont: 7, maxCols: 4, minMedia: 0.45 };

const FONT_STEP = 0.5;
const MEDIA_STEP = 0.05;

/**
 * Sucht den größten Zustand, der passt. Schrift hat Vorrang vor Spalten, Spalten vor Bildgröße:
 * erst wird bei voller Schrift und einer Spalte das Bild verkleinert, dann kommen Spalten dazu, dann sinkt die Schrift.
 * `fits` wendet den Zustand an und misst. Die Suche geht davon aus, dass kleiner nie schlechter passt.
 */
export function fitSearch(fits: (s: FitState) => boolean, opts: FitOptions = FIT_DEFAULTS): FitState {
  const bestAt = (font: number): FitState | null => {
    for (let cols = 1; cols <= opts.maxCols; cols++) {
      if (fits({ font, cols, media: 1 })) return { font, cols, media: 1 };
      if (opts.minMedia >= 1 || !fits({ font, cols, media: opts.minMedia })) continue;
      let lo = opts.minMedia;
      let hi = 1;
      while (hi - lo > MEDIA_STEP + 1e-9) {
        const mid = round((lo + hi) / 2, 100);
        if (fits({ font, cols, media: mid })) lo = mid;
        else hi = mid;
      }
      return { font, cols, media: lo };
    }
    return null;
  };

  const top = bestAt(opts.maxFont);
  if (top) return top;

  const atMin = bestAt(opts.minFont);
  if (atMin) {
    // Größte Schrift zwischen Mindest- und Höchstwert, in halben Pixeln.
    let lo = atMin;
    let hiFont = opts.maxFont;
    while (hiFont - lo.font > FONT_STEP + 1e-9) {
      const mid = round((lo.font + hiFont) / 2 / FONT_STEP, 1) * FONT_STEP;
      if (mid <= lo.font || mid >= hiFont) break;
      const found = bestAt(mid);
      if (found) lo = found;
      else hiFont = mid;
    }
    return lo;
  }

  // Notfall: weiter verkleinern, bis es passt.
  for (let font = opts.minFont - 1; font >= opts.floorFont; font--) {
    const found = bestAt(font);
    if (found) return found;
  }
  return { font: opts.floorFont, cols: opts.maxCols, media: opts.minMedia };
}

function round(value: number, factor: number): number {
  return Math.round(value * factor) / factor;
}

/** Toleranz gegen Rundung beim Messen */
const SLACK = 1;

/**
 * Svelte-Action für den Hauptbereich der Fernsehansicht. Das erste Kind ist der Inhalt mit natürlicher Höhe,
 * `node` selbst hat eine feste Höhe. Gemessen wird bei jeder Größenänderung von Hülle oder Inhalt.
 */
export function fitScreen(node: HTMLElement) {
  const root = document.documentElement;
  const prev = { font: root.style.fontSize, htmlOverflow: root.style.overflow, bodyOverflow: document.body.style.overflow };
  // Höchstwert ist die heutige Grundschrift des Browsers (meist 16px), die Grenzen wachsen mit.
  const base = parseFloat(getComputedStyle(root).fontSize) || FIT_DEFAULTS.maxFont;
  const ratio = base / FIT_DEFAULTS.maxFont;
  const limits = {
    maxFont: base,
    minFont: Math.round(FIT_DEFAULTS.minFont * ratio * 2) / 2,
    floorFont: Math.round(FIT_DEFAULTS.floorFont * ratio * 2) / 2,
  };
  root.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const apply = (s: FitState) => {
    root.style.fontSize = `${s.font}px`;
    node.style.setProperty('--fit-cols', String(s.cols));
    node.style.setProperty('--fit-media', String(s.media));
  };

  const measure = (): boolean => {
    const content = node.firstElementChild as HTMLElement | null;
    if (!content) return true;
    const height = Math.max(content.offsetHeight, content.scrollHeight);
    return height <= node.clientHeight + SLACK && content.scrollWidth <= node.clientWidth + SLACK;
  };

  const run = () => {
    frame = 0;
    // Ohne Spaltenlisten oder Bilder sind die Stellschrauben wirkungslos, das spart Messungen.
    const opts: FitOptions = {
      ...FIT_DEFAULTS,
      ...limits,
      maxCols: node.querySelector('.fit-cols, .fit-grid') ? FIT_DEFAULTS.maxCols : 1,
      minMedia: node.querySelector('.fit-media') ? FIT_DEFAULTS.minMedia : 1,
    };
    const best = fitSearch((s) => {
      apply(s);
      return measure();
    }, opts);
    apply(best);
  };

  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(run);
  };

  // Inhalt wird beobachtet, solange er existiert. Svelte tauscht ihn nicht aus, Kinder wechseln innerhalb.
  const observer = new ResizeObserver(schedule);
  observer.observe(node);
  if (node.firstElementChild) observer.observe(node.firstElementChild);
  void document.fonts?.ready.then(schedule);
  schedule();

  return {
    destroy() {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      root.style.fontSize = prev.font;
      root.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
    },
  };
}
