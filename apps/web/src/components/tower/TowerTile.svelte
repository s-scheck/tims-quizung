<script lang="ts">
  import { TOWER_SPECIALS, type RoomView, type TowerEffectView } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import TowerCanvas from './TowerCanvas.svelte';
  import TowerHold from './TowerHold.svelte';
  import TowerRing from './TowerRing.svelte';
  import type { TowerScene } from './towerDraw.ts';
  import { GOLD, meters } from './towerStyle.ts';

  /**
   * Kachel eines Turms in der Übersicht (Fernseher, Host): Live-Turm, Platz, Effekte mit Restzeit, Namensschild mit Höhe.
   * Der Führende bekommt Gold und Krone, wer über der Linie hält, pulsiert grün mit Countdown.
   */
  let {
    view,
    id,
    scene,
    color,
    height,
    hold,
    goal,
    rank,
    leader = false,
    effects,
    now,
    hasStock = false,
    shielded = false,
    labels = true,
    big = false,
    minVisible,
  }: {
    view: RoomView;
    id: string;
    scene: () => TowerScene;
    color: string;
    height: number;
    hold: number;
    goal: number;
    rank: number | null;
    leader?: boolean;
    effects: TowerEffectView[];
    /** Serverzeit für die Restzeit-Ringe. */
    now: number;
    hasStock?: boolean;
    /** Schutzschild aktiv: goldener Saum. */
    shielded?: boolean;
    labels?: boolean;
    big?: boolean;
    minVisible: number;
  } = $props();

  let canvasH = $state(0);
  const holding = $derived(hold > 0);
  const badge = $derived(big ? 30 : 24);
</script>

<div class="tile relative flex min-h-0 flex-col overflow-hidden rounded-[1.25rem] {leader ? 'tile-lead' : ''} {holding ? 'tile-hold' : ''}" style="--c:{color}; min-width: 0">
  {#if shielded}<div class="shield pointer-events-none absolute inset-0 z-10 rounded-[1.25rem]" aria-hidden="true"></div>{/if}
  <div class="relative min-h-0 flex-1" bind:clientHeight={canvasH}>
    <TowerCanvas class="h-full w-full" {scene} worldWidth={13} headroom={5} {minVisible} {labels} />

    <!-- Platz -->
    <div class="absolute left-2 top-2 flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2.5 text-white glass {big ? 'text-base' : 'text-sm'}">
      {#if leader}
        <svg viewBox="0 0 24 24" class={big ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" fill={GOLD} stroke="#a8740a" stroke-width="1.2" stroke-linejoin="round" /></svg>
      {:else}
        <span class="w-1"></span>
      {/if}
      <span class="font-black">{rank === null ? "–" : `${rank}.`}</span>
    </div>

    <!-- Effekte und Vorrat -->
    <div class="absolute right-2 top-2 flex flex-col items-end gap-1.5">
      {#each effects as e (e.id)}
        {@const timed = TOWER_SPECIALS[e.special].durationMs > 0 && !e.blocked}
        <span class="fx glass flex items-center gap-1.5 rounded-full p-0.5 {big ? 'pr-2.5 text-sm' : 'pr-2 text-xs'} font-bold text-white">
          {#if e.blocked}
            <TowerBadge special="shield" size={badge} />
            <span class="line-through decoration-2 opacity-70">{TOWER_SPECIALS[e.special].name}</span><span class="text-[#ffe29a]">abgewehrt</span>
          {:else if timed}
            <TowerRing value={(e.until - now) / (e.until - e.at)} size={badge + 6} stroke={3} color="#ffffff">
              <TowerBadge special={e.special} size={badge - 2} />
            </TowerRing>
          {:else}
            <TowerBadge special={e.special} size={badge} />
          {/if}
          {#if !e.blocked}{TOWER_SPECIALS[e.special].name}{/if}
        </span>
      {/each}
      {#if hasStock}
        <span class="glass grid place-items-center rounded-full {big ? 'h-8 w-8' : 'h-7 w-7'}" title="Zauber im Vorrat">
          <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill={GOLD} /></svg>
        </span>
      {/if}
    </div>

    {#if holding}
      <div class="absolute inset-0 grid place-items-center">
        <TowerHold {hold} size={Math.max(70, Math.min(170, canvasH * 0.34))} label="hält" />
      </div>
    {/if}
  </div>

  <!-- Namensschild -->
  <div class="plate relative">
    <div class="absolute inset-x-0 top-0 h-[3px] bg-white/10">
      <div class="h-full transition-[width] duration-300" style="width:{Math.min(100, (height / goal) * 100)}%; background:{color}; box-shadow: 0 0 10px {color}"></div>
    </div>
    <div class="flex items-center gap-2 {big ? 'px-3.5 py-2.5' : 'px-2.5 py-2'}">
      <span class="rounded-full" style="box-shadow: 0 0 0 2px {color}"><PlayerHead {view} {id} size={big ? 32 : 24} /></span>
      <span class="flex-1 truncate font-extrabold text-white {big ? 'text-xl' : 'text-sm'}" style="min-width: 0">{playerName(view, id)}</span>
      <span class="whitespace-nowrap font-mono font-black tabular-nums {big ? 'text-2xl' : 'text-base'} {holding ? 'text-[#3ee08f]' : 'text-white'}"
        >{meters(height)}<span class="ml-0.5 text-[0.6em] font-bold text-white/60">m</span></span
      >
    </div>
  </div>
</div>

<style>
  .tile {
    background: #0e1426;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 18px 40px -22px rgba(0, 0, 0, 0.8);
    transition: box-shadow 300ms ease;
  }
  .tile-lead {
    box-shadow:
      0 0 0 2px #f6c453,
      0 0 32px -6px rgba(246, 196, 83, 0.55),
      0 18px 40px -22px rgba(0, 0, 0, 0.8);
  }
  .tile-hold {
    animation: hold 1s ease-in-out infinite;
  }
  /* Schutzschild: weiches, helles Leuchten von innen (kein harter Rand, der wäre mit der Führung zu verwechseln). */
  .shield {
    background: radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(255, 240, 190, 0.32));
    box-shadow: inset 0 0 44px -6px rgba(255, 226, 150, 0.85);
    animation: shield 2.4s ease-in-out infinite;
  }
  @keyframes shield {
    50% {
      box-shadow: inset 0 0 64px -2px rgba(255, 236, 170, 0.95);
    }
  }
  .plate {
    background: linear-gradient(180deg, #151d33, #0e1426);
  }
  .glass {
    background: rgba(10, 16, 30, 0.62);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .fx {
    animation: fx-in 360ms cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  @keyframes fx-in {
    from {
      transform: translateX(16px) scale(0.8);
      opacity: 0;
    }
  }
  @keyframes hold {
    0%,
    100% {
      box-shadow:
        0 0 0 2px #3ee08f,
        0 0 20px -6px rgba(62, 224, 143, 0.5);
    }
    50% {
      box-shadow:
        0 0 0 3px #3ee08f,
        0 0 40px 0 rgba(62, 224, 143, 0.7);
    }
  }
</style>
