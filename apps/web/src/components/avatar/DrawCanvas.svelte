<script lang="ts" module>
  export type Tool = 'pen' | 'eraser' | 'fill';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { AVATAR_RES, HEAD_INSET, RIG, type AvatarPart, type HeadShape, type Point } from '@quiz/shared';
  import { floodFill, hexToRgba } from '../../lib/floodFill.ts';
  import { headPath, isBlank, loadImage } from '../../lib/avatarCanvas.ts';

  /**
   * Zeichenfläche für ein Teil der Figur. Gelenkpunkt, Knochenlinie und Ansatzpunkte sind nur Hinweise und landen nicht im Bild.
   * Beim Kopf wird alles auf die Form beschnitten, bei der Kopfbedeckung liegt der Kopf blass darunter.
   */
  let {
    part,
    color,
    brush,
    tool,
    initial = null,
    shape = 'circle',
    headColor = '#f2c9a0',
    underlay = null,
    undoCount = $bindable(0),
  }: {
    part: AvatarPart;
    color: string;
    brush: number;
    tool: Tool;
    initial?: string | null;
    shape?: HeadShape;
    headColor?: string;
    underlay?: string | null;
    undoCount?: number;
  } = $props();

  const rig = $derived(RIG[part]);
  const isHead = $derived(part === 'head');
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  const undo: ImageData[] = [];
  const UNDO_MAX = 30;
  let last: { x: number; y: number } | null = null;
  let pointerId: number | null = null;

  onMount(() => {
    ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    if (initial) loadImage(initial).then((img) => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)).catch(() => {});
  });

  function remember(): void {
    undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undo.length > UNDO_MAX) undo.shift();
    undoCount = undo.length;
  }

  export function undoLast(): void {
    const prev = undo.pop();
    if (prev) ctx.putImageData(prev, 0, 0);
    undoCount = undo.length;
  }

  export function clear(): void {
    if (isBlank(canvas)) return;
    remember();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /** Gemaltes als PNG, null wenn das Teil leer ist. */
  export function snapshot(): string | null {
    return isBlank(canvas) ? null : canvas.toDataURL('image/png');
  }

  function toCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  }

  function withClip(draw: () => void): void {
    ctx.save();
    if (isHead) {
      headPath(ctx, shape);
      ctx.clip();
    }
    draw();
    ctx.restore();
  }

  function stroke(from: { x: number; y: number }, to: { x: number; y: number }): void {
    withClip(() => {
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = brush * AVATAR_RES;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
  }

  function fill(at: { x: number; y: number }): void {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (!floodFill(img, at.x, at.y, hexToRgba(color))) return;
    remember();
    ctx.putImageData(img, 0, 0);
    if (isHead) {
      // Farbe außerhalb der Kopfform wieder entfernen.
      ctx.save();
      ctx.globalCompositeOperation = 'destination-in';
      headPath(ctx, shape);
      ctx.fill();
      ctx.restore();
    }
  }

  function down(e: PointerEvent): void {
    if (pointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = toCanvas(e);
    if (tool === 'fill') {
      fill(p);
      return;
    }
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    remember();
    last = p;
    stroke(p, p);
  }

  function move(e: PointerEvent): void {
    if (e.pointerId !== pointerId || !last) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length > 0 ? events : [e]) {
      const p = toCanvas(ev);
      stroke(last, p);
      last = p;
    }
  }

  function up(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    last = null;
  }

  /** Wo andere Teile am Torso ansetzen: Hals, Schultern, Hüften. */
  function torsoJoints(): Point[] {
    const t = RIG.torso.at;
    const at = (p: AvatarPart): Point => ({ x: RIG[p].at.x + RIG[p].pivot.x - t.x, y: RIG[p].at.y + RIG[p].pivot.y - t.y });
    return [at('head'), at('armL'), at('armR'), at('legL'), at('legR')];
  }

  const joints = $derived<Point[]>(part === 'torso' ? torsoJoints() : part === 'hat' ? [] : [rig.pivot]);
  const headInset = $derived(`${(HEAD_INSET / RIG.head.w) * 100}%`);
  const ratio = $derived(rig.w / rig.h);
</script>

<div
  class="relative mx-auto overflow-hidden rounded-2xl border-2 border-slate-700 bg-white"
  style="aspect-ratio:{rig.w}/{rig.h}; width:min(100%, calc(var(--draw-h, 52vh) * {ratio}))"
>
  <!-- Schachbrett zeigt, was durchsichtig bleibt. -->
  <div class="checker absolute inset-0"></div>
  {#if isHead}
    <div
      class="absolute border-[3px] border-slate-100"
      style="inset:{headInset}; background:{headColor}; border-radius:{shape === 'circle' ? '50%' : '9%'}"
    ></div>
  {/if}
  {#if underlay}
    {@const h = RIG.head}
    <img
      src={underlay}
      alt=""
      class="pointer-events-none absolute opacity-35"
      style="left:{((h.at.x - rig.at.x) / rig.w) * 100}%; top:{((h.at.y - rig.at.y) / rig.h) * 100}%; width:{(h.w / rig.w) * 100}%; height:{(h.h / rig.h) * 100}%"
    />
  {/if}
  <canvas
    bind:this={canvas}
    width={rig.w * AVATAR_RES}
    height={rig.h * AVATAR_RES}
    class="absolute inset-0 h-full w-full {tool === 'fill' ? 'cursor-cell' : 'cursor-crosshair'}"
    style="touch-action:none"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    oncontextmenu={(e) => e.preventDefault()}
  ></canvas>
  <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 {rig.w} {rig.h}" aria-hidden="true">
    {#if rig.bone}
      <line x1={rig.pivot.x} y1={rig.pivot.y} x2={rig.bone.x} y2={rig.bone.y} stroke="#1cb0f6" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="5 5" />
    {/if}
    {#if part === 'torso'}
      {@const j = torsoJoints()}
      <line x1={j[0]!.x} y1={j[0]!.y} x2={(j[3]!.x + j[4]!.x) / 2} y2={j[3]!.y} stroke="#1cb0f6" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="5 5" />
    {/if}
    {#each joints as p, i (i)}
      <circle cx={p.x} cy={p.y} r="7" fill="none" stroke="#1cb0f6" stroke-width="2.5" />
      <circle cx={p.x} cy={p.y} r="2" fill="#1cb0f6" />
    {/each}
  </svg>
</div>

<style>
  .checker {
    background-image:
      linear-gradient(45deg, #f1f1f1 25%, transparent 25%),
      linear-gradient(-45deg, #f1f1f1 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, #f1f1f1 75%),
      linear-gradient(-45deg, transparent 75%, #f1f1f1 75%);
    background-size: 20px 20px;
    background-position:
      0 0,
      0 10px,
      10px -10px,
      -10px 0;
  }
</style>
