<script lang="ts">
  import { TOWER_HOLD_MS } from '@quiz/shared';
  import TowerRing from './TowerRing.svelte';

  /** Spannungsmoment: Der Turm steht über der Linie und muss ruhig bleiben. Großer Ring mit „3 … 2 … 1“. */
  let { hold, size = 150, label = 'Ruhig halten' }: { hold: number; size?: number; label?: string } = $props();

  const left = $derived(Math.max(1, Math.ceil(((1 - hold) * TOWER_HOLD_MS) / 1000)));
</script>

<div class="hold pointer-events-none flex flex-col items-center" style="--s:{size}px">
  <div class="hold-disc relative rounded-full">
    <TowerRing value={hold} {size} stroke={Math.max(4, size * 0.055)} color="#3ee08f" track="rgba(255,255,255,0.22)">
      <span class="flex flex-col items-center leading-none text-white">
        {#key left}
          <span class="hold-num font-black" style="font-size:{size * 0.42}px">{left}</span>
        {/key}
      </span>
    </TowerRing>
  </div>
  <span class="hold-label mt-2 rounded-full px-3 py-1 font-extrabold uppercase tracking-[0.2em] text-white" style="font-size:{Math.max(10, size * 0.085)}px">{label}</span>
</div>

<style>
  .hold-disc {
    background: radial-gradient(closest-side, rgba(8, 40, 28, 0.72), rgba(8, 30, 24, 0.5) 80%, transparent);
    box-shadow: 0 0 calc(var(--s) * 0.35) rgba(62, 224, 143, 0.45);
    animation: beat 1s ease-in-out infinite;
  }
  .hold-num {
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.4);
    animation: num 1s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }
  .hold-label {
    background: rgba(10, 40, 28, 0.7);
    box-shadow: inset 0 0 0 1px rgba(62, 224, 143, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  @keyframes beat {
    50% {
      transform: scale(1.04);
      box-shadow: 0 0 calc(var(--s) * 0.5) rgba(62, 224, 143, 0.65);
    }
  }
  @keyframes num {
    from {
      transform: scale(1.5);
      opacity: 0;
    }
  }
</style>
