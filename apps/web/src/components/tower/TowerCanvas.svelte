<script lang="ts">
  import { onMount } from 'svelte';
  import { drawTower, type TowerCamera, type TowerScene } from './towerDraw.ts';

  /**
   * Canvas eines Turms. Die Szene kommt jedes Bild frisch aus `scene()`, damit neue Server-Stände die Animation
   * nie neu starten. `onTick` läuft vor dem Zeichnen (am Handy die Physik). Die Kamera folgt der Turmspitze.
   */
  let {
    scene,
    onTick = undefined,
    worldWidth = 14,
    headroom = 9,
    labels = true,
    minVisible = undefined,
    class: className = '',
    style = undefined,
  }: {
    scene: () => TowerScene | null;
    onTick?: (dt: number, time: number) => void;
    worldWidth?: number;
    headroom?: number;
    labels?: boolean;
    minVisible?: number;
    class?: string;
    style?: string;
  } = $props();

  let wrap: HTMLDivElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cam: TowerCamera = { y: 0, ready: false };
    let raf = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const dt = Math.min(100, Math.max(0, time - last));
      last = time;
      onTick?.(dt, time);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w > 0 && h > 0) {
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const s = scene();
        if (s) drawTower(ctx, w, h, dpr, s, cam, time, dt, { worldWidth, headroom, labels, ...(minVisible ? { minVisible } : {}) });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div bind:this={wrap} class="relative overflow-hidden {className}" {style}>
  <canvas bind:this={canvas} class="absolute inset-0 block h-full w-full"></canvas>
</div>
