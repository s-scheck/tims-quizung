/**
 * Karten ziehen mit Maus, Finger oder Stift, ohne HTML5-Drag-and-Drop (das geht auf Handys nicht).
 *
 * Maus: Ziehen beginnt nach ein paar Pixeln Bewegung.
 * Finger: kurz halten, dann ziehen. Wer sofort wischt, scrollt wie gewohnt die Seite.
 *
 * Die Hilfe meldet nur Start, Bewegung und Ende samt getroffenem Ablageziel (ein Element mit `data-drop`).
 * Das Geisterbild unter dem Finger zeichnet der Aufrufer, damit es wie eine echte Karte aussieht.
 * Nahe am Bildschirmrand scrollt die Seite mit, damit auch lange Ketten erreichbar bleiben.
 */
export interface DragPoint {
  x: number;
  y: number;
}

export interface DragStart {
  id: string;
  rect: DOMRect;
  x: number;
  y: number;
}

export interface DragOptions {
  id: string;
  enabled: boolean;
  onStart: (start: DragStart) => void;
  onMove: (point: DragPoint, hit: HTMLElement | null) => void;
  /** `hit` ist null, wenn das Ziehen abgebrochen wurde oder neben allen Zielen endete. */
  onEnd: (point: DragPoint, hit: HTMLElement | null) => void;
}

const MOUSE_SLOP = 6;
const TOUCH_SLOP = 10;
const HOLD_MS = 180;
const EDGE_TOP = 80;
/** Unten liegt meist die feste Bestätigen-Leiste, deshalb beginnt die Scrollzone früher. */
const EDGE_BOTTOM = 150;

export function hitAt(point: DragPoint): HTMLElement | null {
  const el = document.elementFromPoint(point.x, point.y);
  return (el?.closest('[data-drop]') as HTMLElement | null) ?? null;
}

export function draggable(node: HTMLElement, options: DragOptions) {
  let opts = options;
  let pointerId: number | null = null;
  let pointerType = 'mouse';
  let origin: DragPoint = { x: 0, y: 0 };
  let last: DragPoint = { x: 0, y: 0 };
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let dragging = false;
  let moved = false;
  let suppressClick = false;
  let raf = 0;

  function begin() {
    dragging = true;
    moved = false;
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ohne Vibration */
    }
    opts.onStart({ id: opts.id, rect: node.getBoundingClientRect(), x: last.x, y: last.y });
    opts.onMove(last, hitAt(last));
    raf = requestAnimationFrame(autoScroll);
  }

  function autoScroll() {
    const h = window.innerHeight;
    let dy = 0;
    if (last.y < EDGE_TOP) dy = -Math.ceil((EDGE_TOP - last.y) / 4);
    else if (last.y > h - EDGE_BOTTOM) dy = Math.ceil((last.y - (h - EDGE_BOTTOM)) / 4);
    if (dy !== 0) {
      window.scrollBy(0, dy);
      opts.onMove(last, hitAt(last));
    }
    raf = requestAnimationFrame(autoScroll);
  }

  function cleanup() {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
    cancelAnimationFrame(raf);
    raf = 0;
    pointerId = null;
    dragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  function onPointerDown(e: PointerEvent) {
    if (!opts.enabled || pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    pointerType = e.pointerType;
    origin = last = { x: e.clientX, y: e.clientY };
    dragging = false;
    moved = false;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    if (pointerType !== 'mouse') {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        begin();
      }, HOLD_MS);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    last = { x: e.clientX, y: e.clientY };
    const dist = Math.hypot(last.x - origin.x, last.y - origin.y);
    if (!dragging) {
      if (pointerType === 'mouse') {
        if (dist >= MOUSE_SLOP) begin();
      } else if (dist >= TOUCH_SLOP) {
        // Der Finger wischt: die Seite scrollt, hier wird nichts gezogen.
        cleanup();
      }
      return;
    }
    if (dist >= MOUSE_SLOP) moved = true;
    opts.onMove(last, hitAt(last));
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    last = { x: e.clientX, y: e.clientY };
    const wasDragging = dragging;
    cleanup();
    if (!wasDragging) return;
    if (!moved) {
      // Gehalten, aber nicht bewegt: das war ein Tippen, der Klick darf durch.
      opts.onEnd(last, null);
      return;
    }
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 300);
    opts.onEnd(last, hitAt(last));
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const wasDragging = dragging;
    cleanup();
    if (wasDragging) opts.onEnd(last, null);
  }

  function onTouchMove(e: TouchEvent) {
    // Während des Ziehens darf der Browser nicht scrollen, sonst bricht er die Geste ab.
    if (dragging) e.preventDefault();
  }

  function onContextMenu(e: Event) {
    if (pointerId !== null || dragging) e.preventDefault();
  }

  function onClick(e: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('contextmenu', onContextMenu);
  node.addEventListener('click', onClick, true);
  node.style.webkitUserSelect = 'none';
  node.style.userSelect = 'none';
  (node.style as unknown as Record<string, string>)['webkitTouchCallout'] = 'none';

  return {
    update(next: DragOptions) {
      opts = next;
      if (!opts.enabled && pointerId !== null) {
        const wasDragging = dragging;
        cleanup();
        if (wasDragging) opts.onEnd(last, null);
      }
    },
    destroy() {
      cleanup();
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('contextmenu', onContextMenu);
      node.removeEventListener('click', onClick, true);
    },
  };
}
