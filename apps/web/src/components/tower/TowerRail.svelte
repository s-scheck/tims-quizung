<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import PlayerHead from '../PlayerHead.svelte';
  import { GOLD, meters } from './towerStyle.ts';

  /**
   * Höhenrennen als Leiste: Köpfe auf ihrer Höhe zwischen Sockel und Ziellinie.
   * Senkrecht am Rand des Handy-Spielfelds, waagerecht quer über den Fernseher (mit Marken und Metern).
   */
  let {
    view,
    goal,
    marks,
    entries,
    me = null,
    leader = null,
    vertical = false,
    head = 22,
  }: {
    view: RoomView;
    goal: number;
    marks: number[];
    entries: { id: string; height: number; color: string; holding?: boolean }[];
    me?: string | null;
    leader?: string | null;
    vertical?: boolean;
    head?: number;
  } = $props();

  const pos = (h: number) => Math.min(1.04, Math.max(0, h / goal));
  let width = $state(0);

  /** Waagerecht: Köpfe, die sich überdecken würden, weichen abwechselnd nach oben und unten aus. */
  const lanes = $derived.by(() => {
    const out = new Map<string, number>();
    if (vertical || width <= 0) return out;
    const sorted = [...entries].sort((a, b) => a.height - b.height);
    const lastX: number[] = [];
    for (const e of sorted) {
      const x = pos(e.height) * width;
      let lane = 0;
      while (lastX[lane] !== undefined && x - lastX[lane]! < head * 0.95) lane++;
      lastX[lane] = x;
      out.set(e.id, lane);
    }
    return out;
  });
  // Lane 0 auf der Leiste, 1 darunter, 2 darüber, 3 weiter darunter …
  const laneY = (lane: number) => (lane === 0 ? 0 : (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * head * 0.62);
</script>

{#if vertical}
  <div class="rail-v relative h-full w-full" aria-label="Höhenrennen">
    <div class="absolute bottom-0 left-1/2 top-0 w-[3px] -translate-x-1/2 rounded-full bg-white/30 shadow-[0_0_0_1px_rgba(10,16,30,0.25)]"></div>
    {#each marks as m (m)}
      <div class="absolute left-1/2 h-[2px] w-2.5 -translate-x-1/2 rounded-full bg-white/50" style="bottom:{pos(m) * 100}%"></div>
    {/each}
    <div class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 21V4m0 0h11l-2.5 3.5L17 11H6" fill={GOLD} stroke="#8a5d00" stroke-width="1.4" stroke-linejoin="round" /></svg>
    </div>
    {#each entries as e (e.id)}
      <div
        class="rail-item absolute left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full"
        style="bottom:{pos(e.height) * 100}%; z-index:{e.id === me ? 3 : 2}; box-shadow: 0 0 0 2px {e.id === me ? '#ffffff' : e.color}, 0 3px 8px -2px rgba(0,0,0,0.5)"
      >
        {#if e.id === me}
          <span class="grid place-items-center rounded-full text-[0.55rem] font-black text-white" style="width:{head}px; height:{head}px; background:{e.color}">DU</span>
        {:else}
          <PlayerHead {view} id={e.id} size={head} />
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="relative w-full" bind:clientWidth={width} style="height:{head * 2.6}px" aria-label="Höhenrennen">
    <div class="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-800"></div>
    {#each entries as e (e.id)}
      <div class="rail-bar absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full opacity-70" style="width:{Math.min(1, pos(e.height)) * 100}%; background:{e.color}; z-index:{e.id === leader ? 1 : 0}"></div>
    {/each}
    {#each marks as m (m)}
      <div class="absolute top-1/2 h-3 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-600" style="left:{pos(m) * 100}%"></div>
    {/each}
    <div class="absolute right-0 top-1/2 flex -translate-y-1/2 translate-x-1/2 flex-col items-center">
      <span class="h-7 w-[3px] rounded-full" style="background:{GOLD}; box-shadow: 0 0 12px {GOLD}"></span>
    </div>
    {#each entries as e (e.id)}
      {@const lane = lanes.get(e.id) ?? 0}
      <div
        class="rail-item absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        style="left:{pos(e.height) * 100}%; margin-top:{laneY(lane)}px; z-index:{e.id === leader ? 4 : 3 - Math.min(2, lane)}"
      >
        <div class="relative rounded-full {e.holding ? 'holding' : ''}" style="box-shadow: 0 0 0 2.5px {e.id === leader ? GOLD : e.color}, 0 4px 10px -3px rgba(0,0,0,0.5)">
          <PlayerHead {view} id={e.id} size={head} />
          {#if e.id === leader}
            <svg class="absolute left-1/2 -translate-x-1/2" style="top:{-head * 0.55}px; width:{head * 0.62}px; height:{head * 0.62}px" viewBox="0 0 24 24" aria-hidden="true"
              ><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" fill={GOLD} stroke="#a8740a" stroke-width="1.2" stroke-linejoin="round" /></svg
            >
          {/if}
        </div>
      </div>
    {/each}
  </div>
  <div class="relative mt-0.5 h-5 w-full text-xs font-bold text-slate-500">
    <span class="absolute left-0">0 m</span>
    {#each marks as m (m)}
      <span class="absolute -translate-x-1/2" style="left:{pos(m) * 100}%">{m}</span>
    {/each}
    <span class="absolute right-0 translate-x-1/2 font-black" style="color:{GOLD}">{meters(goal).replace(',0', '')} m</span>
  </div>
{/if}

<style>
  .rail-item {
    transition:
      bottom 260ms linear,
      left 260ms linear,
      margin-top 300ms ease;
  }
  .rail-bar {
    transition: width 260ms linear;
  }
  .holding {
    animation: hold-pulse 900ms ease-in-out infinite;
  }
  @keyframes hold-pulse {
    50% {
      box-shadow:
        0 0 0 4px #3ee08f,
        0 0 18px 4px rgba(62, 224, 143, 0.6);
    }
  }
</style>
