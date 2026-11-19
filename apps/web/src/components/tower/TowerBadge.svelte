<script lang="ts">
  import type { TowerSpecial } from '@quiz/shared';
  import TowerIcon from './TowerIcon.svelte';
  import { groupOf, toneOf } from './towerStyle.ts';

  /** Zauber als runde Plakette: helle Magie golden mit dunklem Zeichen, dunkle Magie violett mit hellem Zeichen. */
  let { special, size = 36, glow = false }: { special: TowerSpecial; size?: number; glow?: boolean } = $props();
  const tone = $derived(toneOf(special));
  const light = $derived(groupOf(special) === 'light');
</script>

<span
  class="relative inline-grid shrink-0 place-items-center rounded-full"
  style="width:{size}px; height:{size}px; color:{light ? '#5c3b00' : '#ffffff'};
    background: radial-gradient(120% 120% at 30% 18%, {tone.from}, {tone.to} 72%);
    box-shadow: inset 0 1px 0 rgba(255,255,255,{light ? 0.8 : 0.4}), inset 0 -2px 4px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.12){glow ? `, 0 0 ${Math.round(size * 0.55)}px ${tone.glow}` : ''}"
>
  <TowerIcon {special} size={Math.round(size * 0.58)} />
</span>
