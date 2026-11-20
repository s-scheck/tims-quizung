<script lang="ts">
  import { backOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';
  import { specialTargetsOthers, TOWER_SPECIALS, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import TowerIcon from './TowerIcon.svelte';
  import TowerRing from './TowerRing.svelte';
  import { longPress } from './towerLongPress.ts';
  import { LUCK, ms } from './towerStyle.ts';

  /**
   * Glücks-Slot: kleinere runde Taste neben der Zauber-Taste, in Türkis mit funkelndem, kreisendem Rand und einem
   * Kleeblatt am Rand. Der Server schenkt alle 10–20 s einen Zauber; ein neuer ersetzt einen ungenutzten.
   * Leer: dezentes Kleeblatt mit Ring bis zum nächsten Glück. Langer Druck zeigt, was drin ist.
   */
  let {
    luck,
    progress = 0,
    disabled = false,
    onTap,
    onInfo,
  }: { luck: TowerSpecial | null; progress?: number; disabled?: boolean; onTap: () => void; onInfo?: () => void } = $props();

  const info = $derived(onInfo ? { onLong: onInfo } : null);
</script>

{#if luck}
  {#key luck}
    <button
      class="luck relative grid h-10 w-10 place-items-center rounded-full"
      style="--ring:{LUCK.ring}; --glow:{LUCK.glow}; --soft:{LUCK.soft}"
      {disabled}
      use:longPress={info}
      onpointerdown={(e) => e.stopPropagation()}
      onclick={onTap}
      aria-label="Glücks-Zauber {TOWER_SPECIALS[luck]?.name ?? luck} einsetzen"
      title="Glück: {TOWER_SPECIALS[luck]?.name ?? luck}{specialTargetsOthers(luck) ? ': Ziel wählen' : ''} · {TOWER_SPECIALS[luck]?.hint ?? ''}"
      in:scale={{ start: 0.3, duration: ms(460), easing: backOut }}
    >
      <span class="sparkle pointer-events-none absolute inset-[-2px] rounded-full" aria-hidden="true"></span>
      <TowerBadge special={luck} size={30} />
      <span class="tag pointer-events-none absolute -right-1 -top-1 grid h-[15px] w-[15px] place-items-center rounded-full" aria-hidden="true">
        <TowerIcon special="luck" size={11} />
      </span>
    </button>
  {/key}
{:else}
  <div
    class="empty grid h-10 w-10 place-items-center rounded-full"
    style="color:{LUCK.ring}"
    use:longPress={info}
    role="img"
    aria-label="Glücks-Slot leer"
    title="Glück: alle 10 bis 20 Sekunden ein Zauber"
  >
    <TowerRing value={progress} size={40} stroke={2} color={LUCK.ring} track="rgba(255,255,255,0.1)">
      <span class="opacity-60"><TowerIcon special="luck" size={17} /></span>
    </TowerRing>
  </div>
{/if}

<style>
  .luck {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    background: radial-gradient(closest-side, var(--soft), rgba(79, 227, 210, 0.04));
    box-shadow: 0 0 14px -3px var(--glow);
    transition: transform 90ms ease;
  }
  /* Funkelnder Rand: ein heller Bogen kreist langsam um die Taste. */
  .sparkle {
    background: conic-gradient(from 0deg, var(--ring), rgba(79, 227, 210, 0.15) 22%, var(--ring) 50%, rgba(79, 227, 210, 0.15) 72%, var(--ring));
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
    mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
    animation: spin 3.2s linear infinite;
  }
  .tag {
    color: #06302b;
    background: var(--ring);
    box-shadow: 0 0 0 1.5px rgba(8, 12, 26, 0.9);
  }
  .luck:active:not(:disabled) {
    transform: scale(0.9);
  }
  .luck:disabled {
    opacity: 0.55;
  }
  .luck:disabled .sparkle {
    animation: none;
  }
  .empty {
    background: rgba(255, 255, 255, 0.05);
    -webkit-touch-callout: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sparkle {
      animation: none;
    }
  }
</style>
