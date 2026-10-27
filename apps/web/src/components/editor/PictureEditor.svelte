<script lang="ts">
  import type { Row } from '../../lib/editorModel.ts';

  /**
   * Felder auf dem Bild zeichnen: auf freier Fläche aufziehen, Feld antippen zum Wählen, ziehen zum Verschieben,
   * Eckgriffe zum Ändern der Größe. Alle Werte in Prozent der Bildmaße, gespeichert als Text in den Zeilen.
   */
  let {
    image,
    original = '',
    rows = $bindable(),
    selected = $bindable(null),
  }: {
    image: string;
    /** Original zum bearbeiteten Bild, lässt sich zum Zeichnen einblenden. */
    original?: string;
    rows: Row[];
    selected: number | null;
  } = $props();

  const MIN_SIZE = 2;

  let frame = $state<HTMLDivElement>();
  let ratio = $state(4 / 3);
  let showOriginal = $state(false);

  interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  type Corner = 'nw' | 'ne' | 'sw' | 'se';
  type Drag =
    | { kind: 'draw'; index: number; startX: number; startY: number }
    | { kind: 'move'; index: number; startX: number; startY: number; orig: Rect }
    | { kind: 'resize'; index: number; corner: Corner; orig: Rect }
    | null;
  let drag: Drag = null;

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  function rectOf(i: number): Rect | null {
    const r = rows[i];
    if (!r) return null;
    const x = Number(r.x);
    const y = Number(r.y);
    const w = Number(r.w);
    const h = Number(r.h);
    return [x, y, w, h].every(Number.isFinite) ? { x, y, w, h } : null;
  }

  function setRect(i: number, r: Rect) {
    const row = rows[i];
    if (!row) return;
    const w = clamp(r.w, MIN_SIZE, 100);
    const h = clamp(r.h, MIN_SIZE, 100);
    const x = clamp(r.x, 0, 100 - w);
    const y = clamp(r.y, 0, 100 - h);
    row.x = x.toFixed(1);
    row.y = y.toFixed(1);
    row.w = w.toFixed(1);
    row.h = h.toFixed(1);
  }

  function pct(e: PointerEvent): { x: number; y: number } {
    const rect = frame?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return { x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100), y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100) };
  }

  function onPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    frame?.setPointerCapture(e.pointerId);
    const p = pct(e);
    const handle = target.closest<HTMLElement>('[data-handle]');
    const rectEl = target.closest<HTMLElement>('[data-rect]');
    if (handle && rectEl) {
      const index = Number(rectEl.dataset.rect);
      const orig = rectOf(index);
      if (orig) {
        selected = index;
        drag = { kind: 'resize', index, corner: handle.dataset.handle as Corner, orig };
      }
      return;
    }
    if (rectEl) {
      const index = Number(rectEl.dataset.rect);
      const orig = rectOf(index);
      if (orig) {
        selected = index;
        drag = { kind: 'move', index, startX: p.x, startY: p.y, orig };
      }
      return;
    }
    rows.push({ answer: '', x: p.x.toFixed(1), y: p.y.toFixed(1), w: '0', h: '0' });
    const index = rows.length - 1;
    selected = index;
    drag = { kind: 'draw', index, startX: p.x, startY: p.y };
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const p = pct(e);
    if (drag.kind === 'draw') {
      const x = Math.min(drag.startX, p.x);
      const y = Math.min(drag.startY, p.y);
      const row = rows[drag.index];
      if (!row) return;
      row.x = x.toFixed(1);
      row.y = y.toFixed(1);
      row.w = Math.abs(p.x - drag.startX).toFixed(1);
      row.h = Math.abs(p.y - drag.startY).toFixed(1);
    } else if (drag.kind === 'move') {
      setRect(drag.index, { ...drag.orig, x: drag.orig.x + (p.x - drag.startX), y: drag.orig.y + (p.y - drag.startY) });
    } else {
      const o = drag.orig;
      const right = o.x + o.w;
      const bottom = o.y + o.h;
      let r: Rect;
      switch (drag.corner) {
        case 'nw':
          r = { x: Math.min(p.x, right - MIN_SIZE), y: Math.min(p.y, bottom - MIN_SIZE), w: 0, h: 0 };
          r.w = right - r.x;
          r.h = bottom - r.y;
          break;
        case 'ne':
          r = { x: o.x, y: Math.min(p.y, bottom - MIN_SIZE), w: Math.max(MIN_SIZE, p.x - o.x), h: 0 };
          r.h = bottom - r.y;
          break;
        case 'sw':
          r = { x: Math.min(p.x, right - MIN_SIZE), y: o.y, w: 0, h: Math.max(MIN_SIZE, p.y - o.y) };
          r.w = right - r.x;
          break;
        default:
          r = { x: o.x, y: o.y, w: Math.max(MIN_SIZE, p.x - o.x), h: Math.max(MIN_SIZE, p.y - o.y) };
      }
      setRect(drag.index, r);
    }
  }

  function onPointerUp() {
    if (!drag) return;
    if (drag.kind === 'draw') {
      const r = rectOf(drag.index);
      if (!r || r.w < MIN_SIZE || r.h < MIN_SIZE) {
        // Nur angetippt: kein Feld anlegen, Auswahl aufheben.
        rows.splice(drag.index, 1);
        selected = null;
      } else {
        setRect(drag.index, r);
      }
    }
    drag = null;
  }

  function remove(i: number) {
    rows.splice(i, 1);
    selected = selected === null ? null : selected === i ? null : selected > i ? selected - 1 : selected;
  }

  function onImageLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) ratio = img.naturalWidth / img.naturalHeight;
  }

  const CORNERS: { corner: Corner; cls: string }[] = [
    { corner: 'nw', cls: '-left-1.5 -top-1.5 cursor-nwse-resize' },
    { corner: 'ne', cls: '-right-1.5 -top-1.5 cursor-nesw-resize' },
    { corner: 'sw', cls: '-left-1.5 -bottom-1.5 cursor-nesw-resize' },
    { corner: 'se', cls: '-right-1.5 -bottom-1.5 cursor-nwse-resize' },
  ];
</script>

<div class="space-y-2">
  <div
    bind:this={frame}
    class="relative w-full select-none overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-900"
    style="aspect-ratio: {ratio}; touch-action: none; cursor: crosshair"
    role="application"
    aria-label="Felder auf dem Bild zeichnen"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <img src={showOriginal && original ? original : image} alt="" draggable="false" class="block h-full w-full" onload={onImageLoad} />
    {#each rows as row, i (i)}
      {@const r = rectOf(i)}
      {#if r}
        {@const active = i === selected}
        <div
          data-rect={i}
          class="absolute rounded-sm border-2 {active ? 'border-indigo-400 bg-indigo-400/25 ring-2 ring-indigo-400/50' : 'border-white/90 bg-white/20'} cursor-move"
          style="left:{r.x}%; top:{r.y}%; width:{r.w}%; height:{r.h}%"
        >
          <span class="pointer-events-none absolute -left-1 -top-1 rounded-md px-1.5 text-xs font-black leading-tight text-ink shadow {active ? 'bg-indigo-400' : 'bg-white'}">{i + 1}</span>
          {#if active}
            {#each CORNERS as c (c.corner)}
              <span data-handle={c.corner} class="absolute h-3 w-3 rounded-full border-2 border-indigo-400 bg-white {c.cls}"></span>
            {/each}
            <button
              type="button"
              class="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-xs font-black text-white shadow"
              aria-label="Feld {i + 1} löschen"
              onclick={() => remove(i)}>×</button
            >
          {/if}
        </div>
      {/if}
    {/each}
    {#if original}
      <button
        type="button"
        class="absolute right-2 top-2 rounded-lg bg-slate-950/80 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
        onclick={() => (showOriginal = !showOriginal)}
      >
        {showOriginal ? 'Bearbeitetes Bild zeigen' : 'Original zeigen'}
      </button>
    {/if}
  </div>
  <p class="text-xs text-slate-500">
    Auf freier Fläche aufziehen legt ein Feld an. Feld antippen wählt es, ziehen verschiebt, die Ecken ändern die Größe, × löscht. Die Nummer folgt der Reihenfolge in der Liste.
  </p>
</div>
