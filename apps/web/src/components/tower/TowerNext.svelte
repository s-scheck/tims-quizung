<script lang="ts">
  import TowerIcon from './TowerIcon.svelte';
  import { drawPreview } from './towerDraw.ts';

  /** Vorschau des nächsten Steins als kleines Glasquadrat in der HUD-Zeile. Im Nebel nur ein Schleier. */
  let { form, color, fog = false }: { form: number; color: string; fog?: boolean } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  $effect(() => {
    const c = canvas;
    const f = form;
    if (!c || fog) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    if (ctx) drawPreview(ctx, c.clientWidth, c.clientHeight, dpr, f, color, 0);
  });
</script>

<div class="glass grid h-9 w-9 shrink-0 place-items-center rounded-xl" title="Nächster Stein" aria-label="Nächster Stein">
  {#if fog}
    <span class="text-white/60"><TowerIcon special="fog" size={18} /></span>
  {:else}
    {#key form}
      <canvas bind:this={canvas} class="next-pop h-7 w-7"></canvas>
    {/key}
  {/if}
</div>

<style>
  .glass {
    background: rgba(10, 16, 30, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .next-pop {
    animation: pop 260ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
</style>
