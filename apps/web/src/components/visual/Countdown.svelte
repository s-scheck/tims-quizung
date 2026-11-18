<script lang="ts">
  /** 3-2-1-Los! bis `until` (Serverzeit), „Los!“ steht noch kurz danach. `now` kommt von einer FrameClock. */
  let { until, now, seconds = 3 }: { until: number; now: number; seconds?: number } = $props();

  const left = $derived(until - now);
  const label = $derived(left > 0 ? String(Math.min(seconds, Math.ceil(left / 1000))) : left > -700 ? 'Los!' : null);
</script>

{#if label}
  {#key label}
    <div class="countdown pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-live="polite">
      <span class="pop font-black text-white drop-shadow-[0_6px_0_rgb(0_0_0/0.35)]" style="font-size: clamp(3rem, 18cqmin, 12rem)">{label}</span>
    </div>
  {/key}
{/if}

<style>
  .countdown {
    container-type: size;
  }
  .pop {
    animation: pop 900ms cubic-bezier(0.2, 0.8, 0.3, 1.2) both;
  }
  @keyframes pop {
    0% {
      transform: scale(2.2);
      opacity: 0;
    }
    25% {
      transform: scale(1);
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    100% {
      transform: scale(0.85);
      opacity: 0;
    }
  }
</style>
