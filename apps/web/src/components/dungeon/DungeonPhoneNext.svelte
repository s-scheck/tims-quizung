<script lang="ts">
  /**
   * Nach dem Ergebnis: Der Host startet die nächste Türwahl (oder die Auswertung) mit einem großen Knopf,
   * alle anderen sehen, dass es beim Host weitergeht.
   */
  let { label, onNext = null }: { label: string; onNext?: (() => void) | null } = $props();
</script>

{#if onNext}
  <button class="next w-full rounded-2xl px-3 py-3 text-[0.95rem] font-extrabold" onclick={onNext}>{label}</button>
{:else}
  <p class="flex items-center justify-center gap-2 text-[0.8rem] font-semibold text-amber-50/60">
    <span class="dot" aria-hidden="true"></span>Der Host startet gleich: {label}
  </p>
{/if}

<style>
  .next {
    background: linear-gradient(#ffd877, #f0b43c);
    color: #2a1a05;
    box-shadow: 0 3px 0 #8a5a12;
    -webkit-tap-highlight-color: transparent;
  }
  .next:active {
    transform: translateY(3px);
    box-shadow: none;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: #f6c453;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.3;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
