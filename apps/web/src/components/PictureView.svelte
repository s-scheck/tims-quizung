<script lang="ts" module>
  /** Ein Feld im Bild, Lage in Prozent. Mit `answer` wird es als gelöst beschriftet. */
  export interface PictureFieldState {
    id: string;
    number: number;
    x: number;
    y: number;
    w: number;
    h: number;
    solved: boolean;
    answer?: string;
  }
</script>

<script lang="ts">
  let {
    image,
    original = null,
    fields,
    selectedId = null,
    pendingId = null,
    flashId = null,
    interactive = false,
    large = false,
    peek = false,
    onPick,
    class: className = '',
  }: {
    image: string;
    /** Original zum bearbeiteten Bild: gelöste Felder zeigen dann den Originalausschnitt statt eines Kästchens. */
    original?: string | null;
    fields: PictureFieldState[];
    /** Vom aktiven Spieler gewähltes Feld. */
    selectedId?: string | null;
    /** Feld, zu dem gerade ein Tipp geprüft wird. */
    pendingId?: string | null;
    /** Eben gelöstes Feld, kurz hervorgehoben. */
    flashId?: string | null;
    /** Offene Felder lassen sich antippen. Zoomen und Verschieben geht immer. */
    interactive?: boolean;
    large?: boolean;
    /**
     * Nur für den Moderator: Das geprüfte Feld darf beim Pulsieren durchscheinen.
     * Für alle anderen pulsiert nur der Rahmen, sonst wäre die Lösung vor der Entscheidung zu sehen.
     */
    peek?: boolean;
    onPick?: (fieldId: string) => void;
    class?: string;
  } = $props();

  const MIN_SCALE = 1;
  const MAX_SCALE = 6;

  let frame = $state<HTMLDivElement>();
  let width = $state(0);
  let height = $state(0);
  let ratio = $state(4 / 3);
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);

  function clampView() {
    const maxX = Math.max(0, width * (scale - 1));
    const maxY = Math.max(0, height * (scale - 1));
    tx = Math.min(0, Math.max(-maxX, tx));
    ty = Math.min(0, Math.max(-maxY, ty));
  }

  /** Zoomt so, dass der Punkt (px, py) im Rahmen an Ort und Stelle bleibt. */
  function zoomAt(px: number, py: number, factor: number) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const k = next / scale;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    scale = next;
    clampView();
  }

  function resetView() {
    scale = 1;
    tx = 0;
    ty = 0;
  }

  function onImageLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) ratio = img.naturalWidth / img.naturalHeight;
  }

  // ------------------------------------------------------------ Gesten

  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { kind: 'pan'; startX: number; startY: number; startTx: number; startTy: number; moved: boolean; target: string | null } | { kind: 'pinch'; startDist: number; startScale: number } | null = null;

  function local(e: PointerEvent): { x: number; y: number } {
    const r = frame?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }

  function onPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    frame?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-field]')?.dataset.field ?? null;
      gesture = { kind: 'pan', startX: p.x, startY: p.y, startTx: tx, startTy: ty, moved: false, target };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      gesture = { kind: 'pinch', startDist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), startScale: scale };
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (gesture.kind === 'pan') {
      const dx = p.x - gesture.startX;
      const dy = p.y - gesture.startY;
      if (Math.hypot(dx, dy) > 6) gesture.moved = true;
      if (gesture.moved) {
        tx = gesture.startTx + dx;
        ty = gesture.startTy + dy;
        clampView();
      }
    } else if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(mid.x, mid.y, (gesture.startScale * (dist / gesture.startDist)) / scale);
    }
  }

  function onPointerUp(e: PointerEvent, cancelled = false) {
    if (!pointers.has(e.pointerId)) return;
    const wasTap = gesture?.kind === 'pan' && !gesture.moved && pointers.size === 1;
    const target = gesture?.kind === 'pan' ? gesture.target : null;
    pointers.delete(e.pointerId);
    if (wasTap && !cancelled && interactive && target && onPick) {
      const field = fields.find((f) => f.id === target);
      if (field && !field.solved) onPick(target);
    }
    const rest = [...pointers.values()][0];
    if (rest) gesture = { kind: 'pan', startX: rest.x, startY: rest.y, startTx: tx, startTy: ty, moved: true, target: null };
    else gesture = null;
  }

  $effect(() => {
    const node = frame;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = node.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });

  // Rahmen geändert (Drehen, Fenster): Ausschnitt bleibt gültig.
  $effect(() => {
    void width;
    void height;
    clampView();
  });

  /** Gelöstes Feld im Marker-Modus: Originalausschnitt per Hintergrundbild. */
  function cropStyle(f: PictureFieldState): string {
    if (!original) return '';
    const px = f.w >= 100 ? 0 : (f.x / (100 - f.w)) * 100;
    const py = f.h >= 100 ? 0 : (f.y / (100 - f.h)) * 100;
    return `background-image:url("${original}");background-size:${10000 / f.w}% ${10000 / f.h}%;background-position:${px}% ${py}%;`;
  }

  const maxH = $derived(large ? 80 : 62);
</script>

<div
  bind:this={frame}
  bind:clientWidth={width}
  bind:clientHeight={height}
  class="relative mx-auto select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 {className}"
  style="aspect-ratio: {ratio}; width: min(100%, calc({maxH}dvh * {ratio})); touch-action: none"
  role="group"
  aria-label={interactive ? 'Bild, Feld antippen zum Wählen' : 'Bild'}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={(e) => onPointerUp(e)}
  onpointercancel={(e) => onPointerUp(e, true)}
>
  <div class="absolute inset-0 origin-top-left" style="transform: translate({tx}px, {ty}px) scale({scale})">
    <img src={image} alt="" draggable="false" class="block h-full w-full" onload={onImageLoad} />
    {#each fields as f (f.id)}
      {@const selected = f.id === selectedId}
      {@const pending = f.id === pendingId}
      {@const flash = f.id === flashId}
      <div
        data-field={f.id}
        class="absolute flex items-start justify-start overflow-visible transition-colors
          {f.solved
          ? original
            ? 'rounded-sm ring-2 ring-emerald-400/90'
            : 'rounded-sm border-2 border-emerald-400/90 bg-transparent'
          : original
            ? 'rounded-sm border-2 border-dashed border-amber-300/90 bg-amber-300/10'
            : 'rounded-sm border-2 border-slate-600 bg-slate-800'}
          {selected ? 'ring-4 ring-indigo-400' : ''}
          {pending ? (peek ? 'animate-pulse ring-4 ring-amber-400' : 'animate-ring') : ''}
          {flash ? 'animate-flash' : ''}
          {interactive && !f.solved ? 'cursor-pointer' : ''}"
        style="left:{f.x}%; top:{f.y}%; width:{f.w}%; height:{f.h}%; {f.solved ? cropStyle(f) : ''}"
      >
        <span
          class="pointer-events-none absolute -left-1 -top-1 rounded-md px-1.5 font-black leading-tight text-ink shadow
            {f.solved ? 'bg-emerald-400' : selected ? 'bg-indigo-400' : pending ? 'bg-amber-400' : 'bg-white'}
            {large ? 'text-base' : 'text-xs'}"
        >
          {f.number}
        </span>
        {#if f.solved && f.answer}
          <span class="pointer-events-none absolute left-0 top-full mt-0.5 max-w-[14rem] whitespace-nowrap rounded-md bg-emerald-400 px-1.5 font-bold leading-tight text-ink shadow {large ? 'text-sm' : 'text-[10px]'}">
            {f.answer}
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="absolute right-2 top-2 flex gap-1">
    <button type="button" class="h-8 w-8 rounded-lg bg-slate-950/80 text-lg font-bold text-slate-200 hover:bg-slate-800" aria-label="Hineinzoomen" onclick={() => zoomAt(width / 2, height / 2, 1.5)}>+</button>
    <button type="button" class="h-8 w-8 rounded-lg bg-slate-950/80 text-lg font-bold text-slate-200 hover:bg-slate-800" aria-label="Herauszoomen" onclick={() => zoomAt(width / 2, height / 2, 1 / 1.5)}>−</button>
    <button type="button" class="h-8 rounded-lg bg-slate-950/80 px-2 text-xs font-semibold text-slate-300 hover:bg-slate-800" aria-label="Ganzes Bild" onclick={resetView}>Alles</button>
  </div>
</div>
