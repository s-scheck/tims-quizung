<script lang="ts" module>
  import type { TowerSpecial } from '@quiz/shared';

  /** Eine Zeile im Info-Popover: Zauber mit kleiner Marke davor („jetzt“, „2.“, „Glück“). */
  export interface TowerInfoRow {
    special: TowerSpecial;
    tag?: string;
    /** Glücks-Zauber: türkise Marke. */
    luck?: boolean;
  }
</script>

<script lang="ts">
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import { LUCK, ms, toneOf } from './towerStyle.ts';

  /**
   * Kleines Info-Popover nach langem Druck auf Zauber-Taste, Glücks-Taste oder Angebots-Chip (auf iOS gibt es kein
   * `title`): Name und Langtext je Zauber, darunter optional eine Fußzeile. Schließt beim nächsten Tipp irgendwo.
   * Fängt selbst keine Tipps ab, das Spiel läuft weiter.
   */
  let { rows, foot = null, bottom = 80 }: { rows: TowerInfoRow[]; foot?: string | null; bottom?: number } = $props();
</script>

<div
  class="info pointer-events-none absolute left-1/2 z-40 w-[min(21rem,calc(100%-1rem))] -translate-x-1/2 rounded-2xl px-2.5 py-2 text-white"
  style="bottom:{bottom}px"
  in:fly={{ y: 14, duration: ms(200), easing: cubicOut }}
  out:fade={{ duration: ms(140), easing: cubicIn }}
  role="tooltip"
>
  <ul class="flex flex-col gap-1.5">
    {#each rows as r, i (i)}
      <li class="flex items-start gap-2">
        <TowerBadge special={r.special} size={26} />
        <span class="min-w-0 flex-1 leading-tight">
          <span class="flex items-baseline gap-1.5">
            <b class="text-[0.8rem] font-black" style="color:{toneOf(r.special).text}">{TOWER_SPECIALS[r.special]?.name ?? r.special}</b>
            {#if r.tag}
              <span class="tag rounded-full px-1.5 text-[0.58rem] font-extrabold uppercase tracking-wider" style={r.luck ? `color:${LUCK.text}; background:${LUCK.soft}` : ''}>{r.tag}</span>
            {/if}
          </span>
          <span class="block text-[0.68rem] font-semibold text-white/75">{TOWER_SPECIALS[r.special]?.hint ?? ''}</span>
        </span>
      </li>
    {/each}
  </ul>
  {#if foot}
    <p class="mt-1.5 border-t border-white/10 pt-1.5 text-[0.64rem] font-semibold text-white/55">{foot}</p>
  {/if}
</div>

<style>
  .info {
    background: linear-gradient(180deg, rgba(20, 24, 50, 0.95), rgba(10, 12, 30, 0.96));
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.14),
      0 14px 30px -14px rgba(0, 0, 0, 0.85);
  }
  .tag {
    color: rgba(255, 255, 255, 0.75);
    background: rgba(255, 255, 255, 0.1);
  }
</style>
