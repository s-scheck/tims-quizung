/**
 * Einpassen der Fernsehansicht (/screen): Alles muss ohne Scrollen auf einen Bildschirm passen und ihn möglichst füllen.
 *
 * Stellschrauben:
 * - Grundschrift von <html>: Tailwind rechnet Schrift und Abstände in rem, beides wächst und schrumpft zusammen.
 * - Spalten langer Listen (`data-fit` an der Liste, siehe `applyColumns`): je Liste nur so viele, wie mit Mindestbreite passen.
 * - Faktor für Bild- und Kartenhöhen (`--fit-media`, Elemente mit Klasse `fit-media`).
 *
 * Reihenfolge: Die Schrift wird so groß wie möglich (bis zum Höchstwert), Spalten helfen dabei. Damit Text auf dem
 * Fernseher lesbar bleibt, darf das Bild dafür bis auf `growMinMedia` schrumpfen, das Bild bleibt aber das Hauptelement.
 * Passt es schon bei Grundschrift nicht, schrumpft zuerst das Bild weiter, dann die Schrift bis zur Mindestgröße,
 * notfalls noch weiter, damit nie Text abgeschnitten wird.
 */

export interface FitState {
  /** Grundschrift in px (font-size von <html>) */
  font: number;
  /** Höchste Spaltenzahl für Listen; jede Liste nimmt davon so viele, wie mit ihrer Mindestbreite passen. */
  cols: number;
  /** Faktor für Bild- und Kartenhöhen */
  media: number;
}

export interface FitOptions {
  /** Grundschrift des Browsers, ab hier wird gewachsen oder geschrumpft */
  baseFont: number;
  maxFont: number;
  minFont: number;
  /** Notfallgrenze unter der Mindestschrift */
  floorFont: number;
  maxCols: number;
  minMedia: number;
  /** Kleinster Bildfaktor, für den die Schrift über die Grundschrift wachsen darf */
  growMinMedia: number;
}

export const FIT_DEFAULTS: FitOptions = { baseFont: 16, maxFont: 18, minFont: 12, floorFont: 7, maxCols: 4, minMedia: 0.45, growMinMedia: 0.7 };

const FONT_STEP = 0.5;
const MEDIA_STEP = 0.05;

/**
 * Sucht den besten Zustand. `fits` wendet ihn an und misst. Annahme: kleinere Schrift und kleineres Bild passen nie schlechter.
 * Bei gleicher Schrift gewinnt die kleinste Spaltenzahl, das Bild bleibt so groß wie möglich.
 */
export function fitSearch(fits: (s: FitState) => boolean, opts: FitOptions = FIT_DEFAULTS): FitState {
  /** Kleinste Spaltenzahl, mit der es bei vollem Bild passt. */
  const fullAt = (font: number): FitState | null => {
    for (let cols = 1; cols <= opts.maxCols; cols++) if (fits({ font, cols, media: 1 })) return { font, cols, media: 1 };
    return null;
  };
  /** Wie fullAt, aber das Bild darf bis `minMedia` schrumpfen: je Spaltenzahl das größte passende Bild. */
  const shrunkAt = (font: number, minMedia = opts.minMedia): FitState | null => {
    const full = fullAt(font);
    if (full || minMedia >= 1) return full;
    for (let cols = 1; cols <= opts.maxCols; cols++) {
      if (!fits({ font, cols, media: minMedia })) continue;
      let lo = minMedia;
      let hi = 1;
      while (hi - lo > MEDIA_STEP + 1e-9) {
        const mid = Math.round(((lo + hi) / 2) * 100) / 100;
        if (fits({ font, cols, media: mid })) lo = mid;
        else hi = mid;
      }
      return { font, cols, media: lo };
    }
    return null;
  };
  /**
   * Größte Schrift zwischen `found` (passt) und `hi` (passt nicht): von oben in ganzen Pixeln, dann ein halber dazu.
   * Kein Halbieren, weil Spalten mit Mindestbreite bei größerer Schrift wegfallen können: Passen ist nicht monoton.
   */
  const largest = (found: FitState, hi: number, at: (font: number) => FitState | null): FitState => {
    const refine = (s: FitState) => (s.font + FONT_STEP < hi ? (at(s.font + FONT_STEP) ?? s) : s);
    for (let font = Math.ceil(hi) - 1; font > found.font; font--) {
      const next = at(font);
      if (next) return refine(next);
    }
    return refine(found);
  };

  // Wachsen: Schrift so groß wie möglich, das Bild darf dafür nur wenig schrumpfen.
  const growAt = (font: number) => shrunkAt(font, Math.max(opts.minMedia, opts.growMinMedia));
  const base = growAt(opts.baseFont);
  if (base) {
    const top = opts.maxFont > opts.baseFont ? growAt(opts.maxFont) : null;
    return top ?? largest(base, opts.maxFont, growAt);
  }

  // Schrumpfen: erst das Bild bei Grundschrift, dann die Schrift.
  const shrunk = shrunkAt(opts.baseFont);
  if (shrunk) return shrunk;
  const atMin = shrunkAt(opts.minFont);
  if (atMin) return largest(atMin, opts.baseFont, shrunkAt);

  // Notfall: weiter verkleinern, bis es passt.
  for (let font = opts.minFont - 1; font >= opts.floorFont; font--) {
    const found = shrunkAt(font);
    if (found) return found;
  }
  return { font: opts.floorFont, cols: opts.maxCols, media: opts.minMedia };
}

/**
 * Spalten für eine Liste, die mit `data-fit` markiert ist:
 * - `data-fit="cols"`: Zeitungsspalten (CSS-Spalten), oben nach unten, dann die nächste Spalte. Jede Spalte läuft für
 *   sich, leere Plätze bleiben flach, auch wenn daneben ein Eintrag zweizeilig ist. app.css verhindert das Zerreißen.
 * - `data-fit="grid"`: Raster zeilenweise (offene Karten, Galerien), `data-fit-base` Grundspalten (Standard 1).
 * - `data-fit-min`: Mindestbreite einer Spalte in em (Standard 14), damit Wörter nie zerhackt werden.
 * - `data-fit-rows`: höchstens so viele Zeilen je Spalte, lange Listen verteilen sich dann auf mehr Spalten
 *   (soweit die Mindestbreite es erlaubt), statt mit großer Schrift eine Spalte zu füllen.
 */
export function columnsFor(width: number, minWidth: number, gap: number, wanted: number): number {
  const byWidth = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  return Math.max(1, Math.min(wanted, byWidth));
}

function applyColumns(list: HTMLElement, maxCols: number): void {
  const flow = list.dataset.fit === 'grid' ? 'grid' : 'cols';
  const base = Number(list.dataset.fitBase ?? 1) || 1;
  const minEm = Number(list.dataset.fitMin ?? 14) || 14;
  const maxRows = Number(list.dataset.fitRows ?? 0) || 0;
  const items = list.children.length;
  const style = getComputedStyle(list);
  const fontPx = parseFloat(style.fontSize) || 16;
  const width = list.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  const wanted = Math.max(base + maxCols - 1, maxRows > 0 ? Math.ceil(items / maxRows) : 1);
  if (flow === 'grid') {
    const gap = parseFloat(style.columnGap) || fontPx;
    const cols = columnsFor(width, minEm * fontPx, gap, wanted);
    list.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    return;
  }
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const cols = columnsFor(width, minEm * fontPx, rootPx, wanted);
  list.style.columnGap = '1rem';
  list.style.columnCount = cols > 1 ? String(cols) : '';
}

/** Toleranz gegen Rundung beim Messen */
const SLACK = 1;

/**
 * Svelte-Action für den Hauptbereich der Fernsehansicht. Das erste Kind ist der Inhalt mit natürlicher Höhe,
 * `node` selbst hat eine feste Höhe. Gemessen wird bei Größenänderungen und wenn Einträge dazukommen.
 */
export function fitScreen(node: HTMLElement) {
  const root = document.documentElement;
  const prev = { font: root.style.fontSize, htmlOverflow: root.style.overflow, bodyOverflow: document.body.style.overflow };
  // Grundschrift des Browsers (meist 16px), alle Grenzen wachsen mit.
  const base = parseFloat(getComputedStyle(root).fontSize) || FIT_DEFAULTS.baseFont;
  const ratio = base / FIT_DEFAULTS.baseFont;
  const half = (v: number) => Math.round(v * ratio * 2) / 2;
  const limits = {
    baseFont: base,
    maxFont: half(FIT_DEFAULTS.maxFont),
    minFont: half(FIT_DEFAULTS.minFont),
    floorFont: half(FIT_DEFAULTS.floorFont),
  };
  root.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  let lists: HTMLElement[] = [];
  const apply = (s: FitState) => {
    root.style.fontSize = `${s.font}px`;
    node.style.setProperty('--fit-media', String(s.media));
    for (const list of lists) applyColumns(list, s.cols);
  };

  const measure = (): boolean => {
    const content = node.firstElementChild as HTMLElement | null;
    if (!content) return true;
    const height = Math.max(content.offsetHeight, content.scrollHeight);
    return height <= node.clientHeight + SLACK && content.scrollWidth <= node.clientWidth + SLACK;
  };

  const run = () => {
    frame = 0;
    lists = [...node.querySelectorAll<HTMLElement>('[data-fit]')];
    // Ohne Listen oder Bilder sind die Stellschrauben wirkungslos, das spart Messungen.
    const opts: FitOptions = {
      ...FIT_DEFAULTS,
      ...limits,
      maxCols: lists.length > 0 ? FIT_DEFAULTS.maxCols : 1,
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

  const resize = new ResizeObserver(schedule);
  resize.observe(node);
  if (node.firstElementChild) resize.observe(node.firstElementChild);
  // Neue Einträge ändern die Spaltenaufteilung, auch wenn die Höhe gleich bleibt. Textänderungen (Timer) zählen nicht.
  const mutations = new MutationObserver(schedule);
  mutations.observe(node, { childList: true, subtree: true });
  void document.fonts?.ready.then(schedule);
  schedule();

  return {
    destroy() {
      resize.disconnect();
      mutations.disconnect();
      if (frame) cancelAnimationFrame(frame);
      root.style.fontSize = prev.font;
      root.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
    },
  };
}
