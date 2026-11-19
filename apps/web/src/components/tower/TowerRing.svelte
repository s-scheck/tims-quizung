<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Kreisring als Fortschritt (0 bis 1), etwa für Restzeiten und das Halten über der Linie. Inhalt in der Mitte. */
  let {
    value,
    size = 44,
    stroke = 4,
    color = '#ffffff',
    track = 'rgba(255,255,255,0.18)',
    children,
  }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: Snippet } = $props();

  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
  const v = $derived(Math.min(1, Math.max(0, value)));
</script>

<span class="relative inline-grid shrink-0 place-items-center" style="width:{size}px; height:{size}px">
  <svg class="absolute inset-0 -rotate-90" width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={track} stroke-width={stroke} />
    <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke={color} stroke-width={stroke} stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - v)} />
  </svg>
  {@render children?.()}
</span>
