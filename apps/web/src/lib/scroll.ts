/** Höhe des klebenden Kopfbereichs (components/Header.svelte), darunter gilt ein Element als verdeckt. */
const HEADER_INSET = 64;

/**
 * Scrollt ein Element sanft in die Mitte, aber nur, wenn es nicht schon vollständig im sichtbaren Bereich liegt.
 * Zuschauer sollen die gelegte Karte sehen, ohne dass die Seite bei jedem Zug springt.
 */
export function scrollIntoViewIfHidden(el: HTMLElement, opts: { topInset?: number; bottomInset?: number } = {}): void {
  const top = opts.topInset ?? HEADER_INSET;
  const bottom = window.innerHeight - (opts.bottomInset ?? 0);
  const rect = el.getBoundingClientRect();
  if (rect.top >= top && rect.bottom <= bottom) return;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
}
