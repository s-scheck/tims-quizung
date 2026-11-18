<script lang="ts">
  import { aimBarValue, type SplashSpeed } from '@quiz/shared';

  /**
   * Zielbalken wie beim Golf: läuft von selbst hin und her, „Stopp“ liefert den Wert von 0 bis 1.
   * Stoppt nie von selbst. `kind` bestimmt die Darstellung: Kraft füllt von links, Richtung zeigt einen Zeiger um die Mitte.
   * `onChange` meldet den laufenden Wert, etwa damit sich die Kanone mitdreht.
   */
  let {
    kind,
    speed,
    onStop,
    onChange,
    large = false,
  }: { kind: 'power' | 'aim'; speed: SplashSpeed; onStop: (value: number) => void; onChange?: (value: number) => void; large?: boolean } = $props();

  let value = $state(0);
  let stopped = $state(false);

  // Nur `stopped` und `speed` starten den Balken neu. Der erste Schritt läuft erst im nächsten Bild,
  // sonst würde jeder neue `onChange` des Elternteils den Balken zurück auf 0 setzen.
  $effect(() => {
    if (stopped) return;
    const sp = speed;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      value = aimBarValue(performance.now() - start, sp);
      onChange?.(value);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    onStop(value);
  }

  function onKey(e: KeyboardEvent) {
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      stop();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="space-y-3">
  <div class="flex items-baseline justify-between text-sm font-semibold text-slate-300">
    <span>{kind === 'power' ? 'Kraft' : 'Richtung'}</span>
    <span class="text-xs text-slate-500">{kind === 'power' ? 'leicht ← → stark' : 'links ← → rechts'}</span>
  </div>
  <div class="relative {large ? 'h-12' : 'h-9'} overflow-hidden rounded-full border-2 border-slate-700 bg-slate-900">
    {#if kind === 'power'}
      <div class="absolute inset-y-0 left-0 rounded-full" style="width:{value * 100}%; background: linear-gradient(90deg, #58cc02, #ffc800 60%, #ff4b4b)"></div>
    {:else}
      <div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-slate-600"></div>
      <div class="absolute inset-y-1 w-3 -translate-x-1/2 rounded-full bg-sky-400 shadow" style="left:{value * 100}%"></div>
    {/if}
  </div>
  <button class="btn-primary w-full {large ? 'py-5 text-2xl' : 'py-4 text-xl'}" disabled={stopped} onclick={stop}>Stopp!</button>
</div>
