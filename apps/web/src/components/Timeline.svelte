<script lang="ts" module>
  export interface TimelineMarker {
    id: string;
    year: number;
    label: string;
    color: string;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { axisToYear, TIMELINE_MAX_YEAR, TIMELINE_MIN_YEAR, yearToAxis, type YearSpan } from '@quiz/shared';
  import { formatYear, formatYearSpan } from '../lib/format.ts';

  let {
    guess = null,
    target = null,
    markers = [],
    interactive = false,
    fitAll = false,
    large = false,
    onPick,
    class: className = '',
  }: {
    /** Eigener Tipp, als Marker mit Jahreszahl. */
    guess?: number | null;
    /** Lösung als grünes Band. */
    target?: YearSpan | null;
    /** Weitere Marker, etwa alle Tipps in der Auflösung. */
    markers?: TimelineMarker[];
    /** Antippen setzt ein Jahr. Zoomen und Verschieben geht immer. */
    interactive?: boolean;
    /** Startausschnitt passend zu Lösung und Markern statt des ganzen Zeitstrahls. */
    fitAll?: boolean;
    large?: boolean;
    onPick?: (year: number) => void;
    class?: string;
  } = $props();

  // Gerechnet wird auf der lückenlosen Achse (siehe yearToAxis), angezeigt in Jahren.
  const AXIS_MIN = yearToAxis(TIMELINE_MIN_YEAR);
  const AXIS_MAX = yearToAxis(TIMELINE_MAX_YEAR);
  const FULL_SPAN = (AXIS_MAX - AXIS_MIN) * 1.04;
  const MIN_SPAN = 12;
  const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

  const height = $derived(large ? 260 : 190);
  const axisY = $derived(height - 70);
  const rowHeight = $derived(large ? 34 : 28);

  let width = $state(0);
  let el = $state<HTMLDivElement>();
  let center = $state((AXIS_MIN + AXIS_MAX) / 2);
  let span = $state(FULL_SPAN);

  function setView(nextCenter: number, nextSpan: number) {
    const s = Math.min(FULL_SPAN, Math.max(MIN_SPAN, nextSpan));
    const half = s / 2;
    const margin = s * 0.04;
    const lo = AXIS_MIN - margin + half;
    const hi = AXIS_MAX + margin - half;
    span = s;
    center = lo > hi ? (AXIS_MIN + AXIS_MAX) / 2 : Math.min(hi, Math.max(lo, nextCenter));
  }

  function resetView() {
    setView((AXIS_MIN + AXIS_MAX) / 2, FULL_SPAN);
  }

  /** Ausschnitt, der Lösung und alle Marker mit etwas Rand zeigt. */
  function fitView() {
    const axes = [
      ...(target ? [yearToAxis(target.from), yearToAxis(target.to)] : []),
      ...markers.map((m) => yearToAxis(m.year)),
      ...(guess !== null ? [yearToAxis(guess)] : []),
    ];
    if (axes.length === 0) return resetView();
    const lo = Math.min(...axes);
    const hi = Math.max(...axes);
    const pad = Math.max(8, (hi - lo) * 0.2);
    setView((lo + hi) / 2, hi - lo + 2 * pad);
  }

  untrack(() => (fitAll ? fitView() : resetView()));

  const viewLo = $derived(center - span / 2);
  const toX = (axis: number) => ((axis - viewLo) / span) * width;
  const axisAt = (px: number) => viewLo + (px / Math.max(1, width)) * span;

  function yearsWithStep(step: number): number[] {
    const lo = viewLo;
    const hi = viewLo + span;
    const out: number[] = [];
    for (let k = Math.max(1, Math.ceil(lo / step)); k * step <= hi; k++) out.push(k * step);
    for (let k = Math.max(1, Math.ceil((1 - hi) / step)); 1 - k * step >= lo; k++) out.push(-k * step);
    return out;
  }

  const tickStep = $derived.by(() => {
    // Beschriftungen vor Christus sind deutlich breiter, danach richtet sich der Abstand.
    const chars = viewLo < 0.5 ? 12 : 4;
    const minPx = chars * (large ? 9.5 : 7.5) + (large ? 28 : 20);
    return TICK_STEPS.find((s) => (s / span) * width >= minPx) ?? 2000;
  });
  const minorStep = $derived(tickStep % 5 === 0 ? tickStep / 5 : tickStep / 2);
  const ticks = $derived(width > 0 ? yearsWithStep(tickStep) : []);
  const minorTicks = $derived(width > 0 && Number.isInteger(minorStep) ? yearsWithStep(minorStep) : []);

  const tickLabel = (year: number) => (year < 0 ? `${-year} v. Chr.` : String(year));
  const charPx = $derived(large ? 9.5 : 7.5);
  /** Beschriftete Striche: ohne angeschnittene Beschriftung am Rand und ohne Überlappung. */
  const labeled = $derived.by(() => {
    const out = new Set<number>();
    let prevRight = -Infinity;
    for (const y of [...ticks].sort((a, b) => a - b)) {
      const x = toX(yearToAxis(y));
      const half = (tickLabel(y).length * charPx) / 2;
      if (x - half < 2 || x + half > width - 2 || x - half < prevRight + 8) continue;
      out.add(y);
      prevRight = x + half;
    }
    return out;
  });

  const band = $derived.by(() => {
    if (!target) return null;
    const left = toX(yearToAxis(target.from) - 0.5);
    const right = toX(yearToAxis(target.to) + 0.5);
    const w = Math.max(4, right - left);
    return { left: (left + right) / 2 - w / 2, width: w };
  });

  /** Marker mit Zeile, damit sich die Schilder nicht überdecken. */
  const placed = $derived.by(() => {
    const all = [
      ...markers.map((m) => ({ ...m, mine: false })),
      ...(guess !== null ? [{ id: '__guess', year: guess, label: formatYear(guess), color: '#818cf8', mine: true }] : []),
    ]
      .map((m) => ({ ...m, x: toX(yearToAxis(m.year)), w: m.label.length * (large ? 9 : 7.5) + 18 }))
      .sort((a, b) => a.x - b.x);
    const rowEnds: number[] = [];
    const maxRows = Math.max(1, Math.floor((axisY - 20) / rowHeight));
    return all.map((m) => {
      const left = m.x - m.w / 2;
      let row = rowEnds.findIndex((end) => end + 4 <= left);
      if (row === -1) row = rowEnds.length < maxRows ? rowEnds.length : rowEnds.indexOf(Math.min(...rowEnds));
      rowEnds[row] = m.x + m.w / 2;
      return { ...m, row };
    });
  });

  // Ein Tipp außerhalb des Ausschnitts (über die Tasten oder das Eingabefeld) holt den Ausschnitt nach.
  $effect(() => {
    if (guess === null) return;
    const a = yearToAxis(guess);
    untrack(() => {
      if (a < viewLo || a > viewLo + span) setView(a, span);
    });
  });

  // ------------------------------------------------------------ Gesten

  const pointers = new Map<number, number>();
  let gesture:
    | { kind: 'pan'; startX: number; startCenter: number; moved: boolean }
    | { kind: 'pinch'; startDist: number; startSpan: number; anchor: number }
    | null = null;

  function localX(e: PointerEvent): number {
    return e.clientX - (el?.getBoundingClientRect().left ?? 0);
  }

  function startPan(x: number, moved: boolean) {
    gesture = { kind: 'pan', startX: x, startCenter: center, moved };
  }

  function onPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    el?.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, localX(e));
    if (pointers.size === 1) startPan(localX(e), false);
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [number, number];
      gesture = { kind: 'pinch', startDist: Math.max(20, Math.abs(a - b)), startSpan: span, anchor: axisAt((a + b) / 2) };
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, localX(e));
    if (gesture.kind === 'pan') {
      const dx = localX(e) - gesture.startX;
      if (Math.abs(dx) > 6) gesture.moved = true;
      if (gesture.moved) setView(gesture.startCenter - (dx / Math.max(1, width)) * span, span);
    } else if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()] as [number, number];
      const nextSpan = (gesture.startSpan * gesture.startDist) / Math.max(20, Math.abs(a - b));
      const mid = (a + b) / 2;
      setView(gesture.anchor - (mid / Math.max(1, width) - 0.5) * nextSpan, nextSpan);
    }
  }

  function onPointerUp(e: PointerEvent, cancelled = false) {
    if (!pointers.has(e.pointerId)) return;
    const wasTap = gesture?.kind === 'pan' && !gesture.moved && pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasTap && !cancelled && interactive && onPick) {
      const year = axisToYear(Math.min(AXIS_MAX, Math.max(AXIS_MIN, axisAt(localX(e)))));
      onPick(year);
    }
    // Nach dem Pinch weiter mit dem verbliebenen Finger verschieben, ohne dass das als Tippen zählt.
    const rest = [...pointers.values()][0];
    if (rest !== undefined) startPan(rest, true);
    else gesture = null;
  }

  function zoomBy(factor: number) {
    const anchor = guess !== null && yearToAxis(guess) >= viewLo && yearToAxis(guess) <= viewLo + span ? yearToAxis(guess) : center;
    const nextSpan = span * factor;
    setView(anchor + (center - anchor) * factor, nextSpan);
  }

  $effect(() => {
    const node = el;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.clientX - node.getBoundingClientRect().left;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setView(center + (e.deltaX / Math.max(1, width)) * span, span);
        return;
      }
      const anchor = axisAt(px);
      const nextSpan = span * Math.exp(e.deltaY * 0.0015);
      setView(anchor - (px / Math.max(1, width) - 0.5) * nextSpan, nextSpan);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });
</script>

<div
  bind:this={el}
  bind:clientWidth={width}
  class="relative select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 {interactive ? 'cursor-crosshair' : 'cursor-grab'} {className}"
  style="height:{height}px; touch-action: pan-y"
  role="group"
  aria-label={interactive ? 'Zeitstrahl, antippen setzt ein Jahr' : 'Zeitstrahl'}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={(e) => onPointerUp(e)}
  onpointercancel={(e) => onPointerUp(e, true)}
>
  {#if band}
    <div class="absolute rounded-md bg-emerald-400/25 ring-1 ring-emerald-300/70" style="left:{band.left}px; width:{band.width}px; top:10px; height:{axisY - 2}px"></div>
  {/if}

  {#each minorTicks as y (y)}
    <div class="absolute w-px bg-slate-700" style="left:{toX(yearToAxis(y))}px; top:{axisY - 4}px; height:8px"></div>
  {/each}

  <div class="absolute inset-x-0 h-0.5 bg-slate-500" style="top:{axisY}px"></div>

  {#if 0.5 >= viewLo && 0.5 <= viewLo + span}
    <div class="absolute w-px bg-slate-500/60" style="left:{toX(0.5)}px; top:8px; height:{axisY - 8}px"></div>
    <span class="absolute -translate-x-full whitespace-nowrap pr-1 text-slate-500 {large ? 'text-sm' : 'text-[10px]'}" style="left:{toX(0.5)}px; top:{axisY - (large ? 22 : 16)}px">Chr. Geb.</span>
  {/if}

  {#each ticks as y (y)}
    {@const x = toX(yearToAxis(y))}
    <div class="absolute w-px bg-slate-400" style="left:{x}px; top:{axisY - 7}px; height:14px"></div>
    {#if labeled.has(y)}
      <span
        class="absolute -translate-x-1/2 whitespace-nowrap font-mono text-slate-400 {large ? 'text-base' : 'text-xs'}"
        style="left:{x}px; top:{axisY + 12}px">{tickLabel(y)}</span
      >
    {/if}
  {/each}

  {#if band && target}
    <span
      class="absolute -translate-x-1/2 whitespace-nowrap rounded bg-emerald-500/20 px-1.5 font-semibold text-emerald-200 {large ? 'text-lg' : 'text-sm'}"
      style="left:{Math.min(width - 50, Math.max(50, band.left + band.width / 2))}px; top:{axisY + (large ? 38 : 34)}px">{formatYearSpan(target)}</span
    >
  {/if}

  {#each placed as m (m.id)}
    {@const top = axisY - (large ? 40 : 34) - m.row * rowHeight}
    <div class="pointer-events-none absolute w-0.5" style="left:{m.x - 1}px; top:{top + 12}px; height:{axisY - top - 12}px; background:{m.color}"></div>
    <div class="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-slate-950" style="left:{m.x}px; top:{axisY + 1}px; background:{m.color}"></div>
    <span
      class="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 font-bold text-slate-950 shadow {large ? 'text-base' : 'text-xs'} {m.mine ? 'ring-2 ring-white/70' : ''}"
      style="left:{m.x}px; top:{top}px; background:{m.color}">{m.label}</span
    >
  {/each}

  <div class="absolute right-2 top-2 flex gap-1">
    <button type="button" class="h-8 w-8 rounded-lg bg-slate-800/90 text-lg font-bold text-slate-200 hover:bg-slate-700" aria-label="Hineinzoomen" onclick={() => zoomBy(0.5)}>+</button>
    <button type="button" class="h-8 w-8 rounded-lg bg-slate-800/90 text-lg font-bold text-slate-200 hover:bg-slate-700" aria-label="Herauszoomen" onclick={() => zoomBy(2)}>−</button>
    <button type="button" class="h-8 rounded-lg bg-slate-800/90 px-2 text-xs font-semibold text-slate-300 hover:bg-slate-700" aria-label="Ganzer Zeitstrahl" onclick={() => (fitAll ? fitView() : resetView())}>{fitAll ? 'Passend' : 'Alles'}</button>
  </div>
</div>
