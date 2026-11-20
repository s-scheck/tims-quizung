/**
 * Langer Druck auf eine Taste oder einen Chip: nach `ms` ruft die Aktion `onLong` auf (etwa ein kleines Info-Popover,
 * weil es auf iOS kein `title` gibt). Der Klick, der beim Loslassen folgt, wird dann geschluckt, damit der lange
 * Druck nichts auslöst. Bewegt sich der Finger, gilt es nicht als langer Druck.
 */
export function longPress(node: HTMLElement, opts: { onLong: () => void; ms?: number } | null) {
  const SLOP = 10;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number } | null = null;
  let fired = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    start = null;
  };
  const down = (e: PointerEvent) => {
    fired = false;
    clear();
    if (!opts) return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      opts?.onLong();
    }, opts.ms ?? 450);
  };
  const move = (e: PointerEvent) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) clear();
  };
  // Svelte verteilt `onclick` erst an der Wurzel; ein Halt hier kommt also rechtzeitig.
  const click = (e: MouseEvent) => {
    if (!fired) return;
    fired = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const menu = (e: Event) => e.preventDefault();

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', clear);
  node.addEventListener('pointercancel', clear);
  node.addEventListener('pointerleave', clear);
  node.addEventListener('click', click, true);
  node.addEventListener('contextmenu', menu);
  return {
    update(next: typeof opts) {
      opts = next;
    },
    destroy() {
      clear();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', clear);
      node.removeEventListener('pointercancel', clear);
      node.removeEventListener('pointerleave', clear);
      node.removeEventListener('click', click, true);
      node.removeEventListener('contextmenu', menu);
    },
  };
}
