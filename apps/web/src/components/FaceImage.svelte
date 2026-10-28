<script lang="ts" module>
  /** Zeilen des Kachelrasters, auf jedem Gerät gleich, weil alle dasselbe Bild laden. */
  export function tileRows(cols: number, ratio: number): number {
    return Math.max(1, Math.round(cols / Math.max(0.1, ratio)));
  }
</script>

<script lang="ts">
  import type { FaceEffectState } from '@quiz/shared';

  let {
    image,
    fx,
    pending = null,
    onTile,
    large = false,
    ratio = $bindable(4 / 3),
    class: className = '',
  }: {
    image: string;
    /** Anzuzeigender Effektzustand (bei Spielern der übernommene, beim Host seine Vorschau). */
    fx: FaceEffectState;
    /** Nur Host: vorgemerkte Kacheln, halb durchsichtig in Indigo. */
    pending?: number[] | null;
    /** Nur Host: Kachel antippen. */
    onTile?: (index: number) => void;
    large?: boolean;
    /** Seitenverhältnis des geladenen Bilds, für die Kachelzeilen. */
    ratio?: number;
    class?: string;
  } = $props();

  let imgEl = $state<HTMLImageElement>();
  let canvas = $state<HTMLCanvasElement>();
  let width = $state(0);
  let height = $state(0);
  let loaded = $state(false);

  function onLoad() {
    const img = imgEl;
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) ratio = img.naturalWidth / img.naturalHeight;
    loaded = true;
  }

  // Verschwommen: Unschärfe wächst mit der Bildbreite, damit 100 auf jedem Gerät gleich unkenntlich ist.
  const blurPx = $derived(fx.effect === 'blur' && fx.level > 0 ? (fx.level / 100) * Math.max(10, width / 9) : 0);
  const pixelActive = $derived(fx.effect === 'pixel' && fx.level > 0);

  // Pixel: Bild klein zeichnen und ohne Glättung hochziehen.
  $effect(() => {
    const c = canvas;
    const img = imgEl;
    const level = fx.level;
    const w = width;
    const h = height;
    if (!pixelActive || !c || !img || !loaded || w === 0 || h === 0) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const block = Math.max(1, Math.round((level / 100) * Math.max(6, w / 7)));
    const sw = Math.max(1, Math.round(w / block));
    const sh = Math.max(1, Math.round(h / block));
    const off = document.createElement('canvas');
    off.width = sw;
    off.height = sh;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.imageSmoothingEnabled = true;
    try {
      octx.drawImage(img, 0, 0, sw, sh);
      c.width = w;
      c.height = h;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, w, h);
    } catch {
      /* Bild noch nicht bereit */
    }
  });

  const rows = $derived(tileRows(fx.cols, ratio));
  const tiles = $derived(fx.effect === 'tiles' ? Array.from({ length: fx.cols * rows }, (_, i) => i) : []);
  const revealedSet = $derived(new Set(fx.revealed));
  const pendingSet = $derived(new Set(pending ?? []));
  const maxH = $derived(large ? 78 : 60);
</script>

<div
  bind:clientWidth={width}
  bind:clientHeight={height}
  class="relative mx-auto select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 {className}"
  style="aspect-ratio: {ratio}; width: min(100%, calc({maxH}dvh * {ratio}))"
>
  <img
    bind:this={imgEl}
    src={image}
    alt=""
    draggable="false"
    class="block h-full w-full {pixelActive ? 'invisible' : ''}"
    style="filter: blur({blurPx}px); transform: scale({blurPx > 0 ? 1.08 : 1})"
    onload={onLoad}
  />
  {#if fx.effect === 'pixel'}
    <canvas bind:this={canvas} class="absolute inset-0 h-full w-full {pixelActive ? '' : 'hidden'}"></canvas>
  {/if}
  {#if fx.effect === 'tiles'}
    <div class="absolute inset-0 grid" style="grid-template-columns: repeat({fx.cols}, 1fr); grid-template-rows: repeat({rows}, 1fr)">
      {#each tiles as i (i)}
        {@const open = revealedSet.has(i)}
        {@const marked = pendingSet.has(i)}
        {#if onTile}
          <button
            type="button"
            class="border border-slate-950/40 transition {open ? 'bg-transparent' : marked ? 'bg-indigo-500/60' : 'bg-slate-800'} {open ? 'cursor-default' : 'hover:bg-indigo-500/40'}"
            aria-label="Kachel {i + 1}{open ? ', aufgedeckt' : marked ? ', vorgemerkt' : ''}"
            disabled={open}
            onclick={() => onTile(i)}
          ></button>
        {:else}
          <div class="border border-slate-950/40 {open ? 'bg-transparent' : 'bg-slate-800'}"></div>
        {/if}
      {/each}
    </div>
  {/if}
</div>
