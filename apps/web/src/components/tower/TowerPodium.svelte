<script lang="ts">
  import { FX_FOG, STONE_FALLING, type RoomView, type TowerRanked, type TowerRoundView } from '@quiz/shared';
  import { playerColor, playerName } from '../../lib/format.ts';
  import Burst from '../Burst.svelte';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerCanvas from './TowerCanvas.svelte';
  import type { TowerScene } from './towerDraw.ts';
  import { towerFeed } from './towerFeed.svelte.ts';
  import { meters } from './towerStyle.ts';

  /**
   * Siegertreppchen 2-1-3: über jeder Stufe der Turm im Endstand, auf der Stufe Platz, Kopf, Name, Höhe und Punkte.
   * Die Stufen fahren nacheinander hoch (erst Bronze, dann Silber, dann Gold).
   */
  let {
    view,
    round,
    top,
    big = false,
    compact = false,
  }: { view: RoomView; round: TowerRoundView; top: TowerRanked[]; big?: boolean; /** Flache Stufen (Handy ohne Scrollen). */ compact?: boolean } = $props();

  /** Stufenhöhe in rem: fester Sockel für Kopf, Name und Höhe plus Anteil je Platz. */
  const stepRem = (h: number) => (big ? 9.5 * h + 4.5 : compact ? 2.4 * h + 4.4 : 6.2 * h + 3.2);

  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));
  const STEP = [
    { name: 'gold', h: 1, from: '#ffe08a', to: '#c98d12', ink: '#4a3000', delay: 900 },
    { name: 'silver', h: 0.72, from: '#f1f4f8', to: '#9aa4b5', ink: '#2b3240', delay: 450 },
    { name: 'bronze', h: 0.52, from: '#f3c39a', to: '#a8622c', ink: '#3b1e08', delay: 0 },
  ];
  /** Reihenfolge auf der Bühne: Zweiter links, Erster Mitte, Dritter rechts. */
  const slots = $derived(top.length >= 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0]);

  function sceneOf(id: string): () => TowerScene {
    const color = colorOf(id);
    return () => {
      const f = towerFeed.frame(id, round.startedAt);
      return {
        stones: f ? towerFeed.stones(id, performance.now()).filter((s) => !(s.flags & STONE_FALLING)) : [],
        height: f?.h ?? 0,
        goal: round.goalHeight,
        marks: round.marks,
        reached: round.players[id]?.marks ?? [],
        color,
        fx: (f?.fx ?? 0) & ~FX_FOG,
        hold: 0,
        fog: false,
        won: round.winners.includes(id),
      };
    };
  }
</script>

<div class="flex h-full min-h-0 items-end justify-center {big ? 'gap-5' : 'gap-2'}">
  {#each slots as i (top[i]!.playerId)}
    {@const r = top[i]!}
    {@const step = STEP[Math.min(2, i)]!}
    <div class="flex h-full min-h-0 min-w-0 flex-1 flex-col items-stretch" style="max-width: {big ? '22rem' : '9rem'}">
      <div class="tower relative min-h-0 flex-1 overflow-hidden {big ? 'rounded-t-[1.4rem]' : 'rounded-t-2xl'} {i === 0 ? 'tower-win' : ''}">
        <TowerCanvas class="h-full w-full" scene={sceneOf(r.playerId)} worldWidth={11} headroom={2.5} minVisible={round.goalHeight + 2} labels={false} />
      </div>
      <div
        class="step relative flex flex-col items-center justify-start {big ? 'gap-1 px-3 pt-3' : 'gap-0.5 px-1.5 pt-2'}"
        style="height: {stepRem(step.h)}rem; color:{step.ink}; --from:{step.from}; --to:{step.to}; animation-delay:{step.delay}ms"
      >
        <span class="relative">
          <span class="block rounded-full" style="box-shadow: 0 0 0 {big ? 3 : 2}px rgba(255,255,255,0.85), 0 6px 14px -6px rgba(0,0,0,0.5)">
            <PlayerHead {view} id={r.playerId} size={big ? 52 : 30} />
          </span>
          {#if i === 0}<Burst scale={big ? 2 : 1.2} ms={900} />{/if}
        </span>
        <span class="max-w-full truncate font-black leading-tight {big ? 'text-xl' : 'text-xs'}">{playerName(view, r.playerId)}</span>
        <span class="font-mono font-black tabular-nums leading-none {big ? 'text-2xl' : 'text-sm'}">{meters(r.height)}<span class="text-[0.6em]"> m</span></span>
        <span class="medal absolute grid place-items-center rounded-full font-black leading-none {big ? 'left-2.5 top-2.5 h-9 w-9 text-lg' : 'left-1.5 top-1.5 h-6 w-6 text-xs'}">{r.rank}</span>
        {#if round.points?.[r.playerId] !== undefined}
          <span class="pts absolute -top-3 right-2 rounded-full font-black {big ? 'px-2.5 py-0.5 text-base' : 'px-1.5 text-[0.65rem]'}">+{round.points[r.playerId]}</span>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .tower {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    background: #0e1426;
  }
  .tower-win {
    box-shadow:
      0 0 0 2px #f6c453,
      0 0 40px -8px rgba(246, 196, 83, 0.6);
  }
  .step {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.55), transparent 22%),
      linear-gradient(180deg, var(--from), var(--to));
    border-radius: 0 0 0.9rem 0.9rem;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.8),
      inset 0 -4px 0 rgba(0, 0, 0, 0.15),
      0 18px 30px -18px rgba(0, 0, 0, 0.7);
    transform-origin: bottom;
    animation: rise 700ms cubic-bezier(0.2, 0.9, 0.25, 1.1) both;
  }
  .medal {
    background: rgba(255, 255, 255, 0.45);
    box-shadow:
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.7),
      0 2px 6px -2px rgba(0, 0, 0, 0.35);
  }
  .pts {
    background: #0e1426;
    color: #f6c453;
    box-shadow: 0 0 0 1px rgba(246, 196, 83, 0.6);
  }
  @keyframes rise {
    from {
      transform: scaleY(0.2);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .step {
      animation: none !important;
    }
  }
</style>
