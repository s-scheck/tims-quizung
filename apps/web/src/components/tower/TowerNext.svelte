<script lang="ts">
  import TowerIcon from './TowerIcon.svelte';
  import { drawPreview } from './towerDraw.ts';
  import { GLASS } from './towerStyle.ts';

  /** Vorschau des nächsten Steins als kleine Glaskachel. Im Nebel nur ein Schleier. */
  let { form, color, fog = false }: { form: number; color: string; fog?: boolean } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  $effect(() => {
    const c = canvas;
    const f = form;
    if (!c || fog) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    if (ctx) drawPreview(ctx, c.clientWidth, c.clientHeight, dpr, f, color, 0);
  });
</script>

<div class="flex w-[4.25rem] flex-col items-center rounded-2xl px-1 pb-1.5 pt-1 {GLASS}">
  <span class="text-[0.55rem] font-extrabold uppercase tracking-[0.16em] text-white/60">Nächster</span>
  {#if fog}
    <span class="grid h-11 w-11 place-items-center text-white/60"><TowerIcon special="fog" size={24} /></span>
  {:else}
    {#key form}
      <canvas bind:this={canvas} class="next-pop h-11 w-11"></canvas>
    {/key}
  {/if}
</div>

<style>
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
