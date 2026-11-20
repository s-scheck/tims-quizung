<script lang="ts">
  import type { DungeonRankEntry, RoomView } from '@quiz/shared';
  import { figureById } from '../../lib/avatar.ts';
  import { playerName } from '../../lib/format.ts';
  import Figure from '../avatar/Figure.svelte';
  import Burst from '../Burst.svelte';

  /**
   * Siegertreppchen 2-1-3 aus Stein mit Metallkante: auf jeder Stufe die Figur, darauf Platz, Name, wie weit er kam
   * und die Punkte. Die Stufen fahren nacheinander hoch (erst Bronze, dann Silber, dann Gold).
   */
  let { view, top, big = false }: { view: RoomView; top: DungeonRankEntry[]; big?: boolean } = $props();

  let h = $state(0);
  const STEP = [
    { h: 1, edge: '#f6c453', ink: '#fde68a', delay: 900 },
    { h: 0.7, edge: '#cfd6e0', ink: '#e5e7eb', delay: 450 },
    { h: 0.5, edge: '#d08a4f', ink: '#f3c39a', delay: 0 },
  ];
  /** Reihenfolge auf der Bühne: Zweiter links, Erster Mitte, Dritter rechts. */
  const slots = $derived(top.length >= 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0]);
  /** Stufenhöhe: fester Sockel für die Schrift plus Anteil je Platz. */
  const base = $derived(big ? 74 : 46);
  const stepPx = (f: number) => base + f * h * (big ? 0.2 : 0.14);
  const figure = $derived(Math.max(40, h - stepPx(1) - (big ? 16 : 6)) * (big ? 0.8 : 0.82));
  const reached = (r: DungeonRankEntry) => (r.status === 'out' ? `draußen nach ${r.exitRound} ${r.exitRound === 1 ? 'Runde' : 'Runden'}` : `bis Raum ${r.room + 1}`);
</script>

<div class="flex h-full min-h-0 items-end justify-center {big ? 'gap-4' : 'gap-1.5'}" bind:clientHeight={h}>
  {#if h > 0}
    {#each slots as i (top[i]!.playerId)}
      {@const r = top[i]!}
      {@const s = STEP[Math.min(2, r.place - 1)] ?? STEP[2]!}
      {@const size = figure * (i === 0 ? 1 : 0.88)}
      <div class="flex mw0 flex-1 flex-col items-center" style="max-width:{big ? '15rem' : '8.5rem'}">
        <div class="relative" style="animation-delay:{s.delay + 300}ms">
          <Figure parts={figureById(view, r.playerId) ?? {}} size={size} pose={r.place === 1 ? 'cheer' : 'wave'} seed={i * 5 + 2} />
          {#if r.place === 1}<span class="absolute left-1/2 top-1/3"><Burst scale={big ? 2 : 1.2} ms={1000} /></span>{/if}
        </div>
        <div class="step relative flex w-full flex-col items-center justify-start text-center {big ? 'gap-0.5 px-2 pt-2.5' : 'px-1 pt-1.5'}" style="height:{stepPx(s.h)}px; --edge:{s.edge}; color:{s.ink}; animation-delay:{s.delay}ms">
          <span class="medal grid shrink-0 place-items-center rounded-full font-black leading-none {big ? 'h-8 w-8 text-lg' : 'h-5 w-5 text-[0.7rem]'}">{r.place}</span>
          <span class="max-w-full truncate font-black leading-tight text-stone-50 {big ? 'text-xl' : 'text-xs'}">{playerName(view, r.playerId)}</span>
          <span class="max-w-full truncate font-semibold leading-tight opacity-80 {big ? 'text-sm' : 'text-[0.6rem]'}">{reached(r)}</span>
          <span class="pts absolute -top-3 right-1.5 rounded-full font-black {big ? 'px-2.5 py-0.5 text-base' : 'px-1.5 text-[0.65rem]'}">+{r.points}</span>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  /* Statt min-w-0: Der Fernseher bricht Flex-Zeilen mit .min-w-0 sonst um (app.css). */
  .mw0 {
    min-width: 0;
  }
  .step {
    background:
      repeating-linear-gradient(0deg, rgb(0 0 0 / 0.28) 0 2px, transparent 2px 26px),
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.2) 0 2px, transparent 2px 46px),
      linear-gradient(180deg, #5a5149, #2c2621);
    border-top: 4px solid var(--edge);
    border-radius: 0.35rem 0.35rem 0 0;
    box-shadow:
      0 -6px 24px -10px var(--edge),
      inset 0 1px 0 rgb(255 255 255 / 0.15),
      0 18px 30px -18px rgb(0 0 0 / 0.8);
    transform-origin: bottom;
    animation: rise 700ms cubic-bezier(0.2, 0.9, 0.25, 1.1) both;
  }
  .medal {
    background: var(--edge);
    color: #1c140c;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.5);
  }
  .pts {
    background: #15110d;
    color: #fbbf24;
    box-shadow: 0 0 0 1px rgb(251 191 36 / 0.6);
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
