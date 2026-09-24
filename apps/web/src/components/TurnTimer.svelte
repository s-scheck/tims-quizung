<script lang="ts">
  import { client } from '../lib/client.svelte.ts';

  let { deadline, totalSeconds, size = 48 }: { deadline: number | null; totalSeconds: number; size?: number } = $props();

  let remainingMs = $state(0);

  $effect(() => {
    if (deadline === null) {
      remainingMs = 0;
      return;
    }
    let raf = 0;
    const tick = () => {
      remainingMs = Math.max(0, deadline - client.serverNow());
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });

  const fraction = $derived(totalSeconds > 0 ? Math.min(1, remainingMs / (totalSeconds * 1000)) : 0);
  const seconds = $derived(Math.ceil(remainingMs / 1000));
  const r = $derived(size / 2 - 4);
  const circumference = $derived(2 * Math.PI * r);
  const urgent = $derived(seconds <= 5);
</script>

{#if deadline !== null}
  <div class="relative shrink-0" style="width:{size}px;height:{size}px" aria-label="{seconds} Sekunden">
    <svg width={size} height={size} class="-rotate-90">
      <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="currentColor" stroke-width="4" class="text-slate-800" />
      <circle
        cx={size / 2}
        cy={size / 2}
        {r}
        fill="none"
        stroke="currentColor"
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={circumference * (1 - fraction)}
        class={urgent ? 'text-rose-400' : 'text-amber-400'}
      />
    </svg>
    <span class="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold {urgent ? 'text-rose-300' : 'text-slate-200'}">{seconds}</span>
  </div>
{/if}
