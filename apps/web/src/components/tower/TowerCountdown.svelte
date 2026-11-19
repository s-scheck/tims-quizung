<script lang="ts">
  import { GOLD } from './towerStyle.ts';

  /**
   * Start des Rennens, auf allen Geräten gleich: kurz „Bereit?“ mit der Ziellinie, dann 3-2-1 und „Los!“.
   * `goAt` und `now` sind Serverzeit (FrameClock), `now` treibt die Anzeige, es gibt keine eigenen Timer.
   */
  let { goAt, now, goal }: { goAt: number; now: number; goal: number } = $props();

  const left = $derived(goAt - now);
  const stage = $derived(left > 3000 ? 'ready' : left > 0 ? 'count' : left > -900 ? 'go' : null);
  const n = $derived(Math.max(1, Math.ceil(left / 1000)));
  /** Ablauf innerhalb der aktuellen Sekunde, 0 bis 1. */
  const sweep = $derived(stage === 'count' ? 1 - (left - (n - 1) * 1000) / 1000 : 0);
</script>

{#if stage}
  <div class="cd pointer-events-none absolute inset-0 z-30 grid place-items-center {stage === 'go' ? 'cd-out' : ''}" aria-live="polite">
    <div class="cd-scrim absolute inset-0"></div>
    {#if stage === 'ready'}
      <div class="cd-ready relative flex flex-col items-center text-center text-white">
        <span class="cd-kicker font-extrabold uppercase tracking-[0.3em] text-white/70">Bereit?</span>
        <span class="cd-goal mt-1 font-black leading-none">Ziellinie <span style="color:{GOLD}">{goal} m</span></span>
        <span class="mt-3 h-px w-24 bg-gradient-to-r from-transparent via-white/60 to-transparent"></span>
      </div>
    {:else if stage === 'count'}
      <div class="relative grid place-items-center">
        <svg class="cd-ring absolute" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2.5" />
          <circle cx="50" cy="50" r="46" fill="none" stroke={GOLD} stroke-width="2.5" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset={100 - sweep * 100} transform="rotate(-90 50 50)" />
        </svg>
        {#key n}
          <span class="cd-num relative font-black leading-none text-white">{n}</span>
        {/key}
      </div>
    {:else}
      <span class="cd-go relative font-black uppercase leading-none" style="color:{GOLD}">Los!</span>
    {/if}
  </div>
{/if}

<style>
  .cd {
    container-type: size;
  }
  .cd-scrim {
    background: radial-gradient(closest-side, rgba(6, 12, 28, 0.62), rgba(6, 12, 28, 0.38) 70%, rgba(6, 12, 28, 0.25));
  }
  .cd-out .cd-scrim {
    animation: cd-fade 900ms ease-out forwards;
  }
  .cd-kicker {
    font-size: clamp(0.8rem, 4cqmin, 1.6rem);
  }
  .cd-goal {
    font-size: clamp(1.8rem, 11cqmin, 6rem);
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  }
  .cd-ready {
    animation: cd-rise 500ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .cd-ring {
    width: clamp(7rem, 48cqmin, 26rem);
    height: clamp(7rem, 48cqmin, 26rem);
    filter: drop-shadow(0 0 18px rgba(246, 196, 83, 0.45));
  }
  .cd-num {
    font-size: clamp(4rem, 30cqmin, 16rem);
    text-shadow: 0 6px 30px rgba(0, 0, 0, 0.4);
    animation: cd-num 1000ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
  }
  .cd-go {
    font-size: clamp(4rem, 26cqmin, 14rem);
    text-shadow:
      0 0 40px rgba(246, 196, 83, 0.6),
      0 6px 24px rgba(0, 0, 0, 0.35);
    animation: cd-go 900ms cubic-bezier(0.2, 0.9, 0.25, 1) both;
  }
  /* Ohne Bewegung: Zahlen stehen still (die Animationen enden sonst unsichtbar). */
  @media (prefers-reduced-motion: reduce) {
    .cd-num,
    .cd-go,
    .cd-ready {
      animation: none !important;
    }
  }
  @keyframes cd-num {
    0% {
      transform: scale(1.7);
      opacity: 0;
      filter: blur(6px);
    }
    22% {
      transform: scale(1);
      opacity: 1;
      filter: blur(0);
    }
    80% {
      opacity: 1;
    }
    100% {
      transform: scale(0.88);
      opacity: 0;
    }
  }
  @keyframes cd-go {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    25% {
      transform: scale(1.08);
      opacity: 1;
    }
    60% {
      transform: scale(1);
      opacity: 1;
    }
    100% {
      transform: scale(1.35);
      opacity: 0;
    }
  }
  @keyframes cd-rise {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
  }
  @keyframes cd-fade {
    to {
      opacity: 0;
    }
  }
</style>
