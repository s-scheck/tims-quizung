<script lang="ts">
  import TowerIcon from './TowerIcon.svelte';
  import { drawPreview } from './towerDraw.ts';

  /**
   * Vorschau des nächsten Steins als kleines Glasquadrat in der HUD-Zeile. Im Nebel nur ein Schleier.
   * Steinwahl (`options`): zwei Formen nebeneinander, ein Tipp wählt, die gewählte leuchtet golden.
   */
  let {
    form,
    color,
    fog = false,
    options = null,
    chosen = 0,
    onChoose,
  }: {
    form: number;
    color: string;
    fog?: boolean;
    options?: readonly [number, number] | null;
    chosen?: 0 | 1;
    onChoose?: (i: 0 | 1) => void;
  } = $props();

  /** Zeichnet eine Form in ein Canvas, sobald es da ist und sich Form oder Farbe ändern. */
  function preview(node: HTMLCanvasElement, args: { form: number; color: string }) {
    const draw = ({ form: f, color: c }: typeof args) => {
      const ctx = node.getContext('2d');
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      node.width = node.clientWidth * dpr;
      node.height = node.clientHeight * dpr;
      if (ctx) drawPreview(ctx, node.clientWidth, node.clientHeight, dpr, f, c, 0);
    };
    draw(args);
    return { update: draw };
  }
</script>

{#if options && !fog}
  <div class="pick glass flex h-9 shrink-0 items-center gap-0.5 rounded-xl p-0.5" role="radiogroup" aria-label="Nächsten Stein wählen">
    {#each options as f, i (i)}
      {@const on = chosen === i}
      <button
        class="opt pointer-events-auto grid h-8 w-8 place-items-center rounded-[0.6rem] {on ? 'opt-on' : ''}"
        role="radio"
        aria-checked={on}
        aria-label="Form {i + 1} wählen"
        title="Diese Form als nächsten Stein"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={() => onChoose?.(i as 0 | 1)}
      >
        {#key f}
          <canvas use:preview={{ form: f, color }} class="next-pop h-6 w-6"></canvas>
        {/key}
      </button>
    {/each}
  </div>
{:else}
  <div class="glass grid h-9 w-9 shrink-0 place-items-center rounded-xl" title="Nächster Stein" aria-label="Nächster Stein">
    {#if fog}
      <span class="text-white/60"><TowerIcon special="fog" size={18} /></span>
    {:else}
      {#key form}
        <canvas use:preview={{ form, color }} class="next-pop h-7 w-7"></canvas>
      {/key}
    {/if}
  </div>
{/if}

<style>
  .glass {
    background: rgba(10, 16, 30, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .pick {
    box-shadow:
      inset 0 0 0 1px rgba(255, 214, 110, 0.55),
      0 0 14px -4px rgba(250, 196, 70, 0.6);
  }
  .opt {
    opacity: 0.5;
    transition:
      opacity 120ms ease,
      transform 90ms ease,
      background-color 120ms ease;
    -webkit-tap-highlight-color: transparent;
  }
  .opt:active {
    transform: scale(0.9);
  }
  .opt-on {
    opacity: 1;
    background: rgba(255, 214, 110, 0.22);
    box-shadow: inset 0 0 0 1.5px #ffd36b;
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
