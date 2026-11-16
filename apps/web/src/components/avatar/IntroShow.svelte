<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { figureOf, type Pose } from '../../lib/avatar.ts';
  import { isModerator } from '../../lib/format.ts';
  import Figure from './Figure.svelte';

  /** Figuren-Show zum Spielstart: alle laufen nacheinander ein und winken, der Host schaltet weiter. */
  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();

  const STAGGER_MS = 700;
  const WALK_MS = 1400;
  const WAVE_MS = 2200;

  let width = $state(0);
  let elapsed = $state(0);
  let started = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    started = performance.now();
    timer = setInterval(() => (elapsed = performance.now() - started), 150);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const players = $derived(view.players);
  const size = $derived.by(() => {
    const n = Math.max(1, players.length);
    const max = readonly ? 300 : 170;
    const perSlot = width > 0 ? (width / Math.min(n, readonly ? 12 : 4)) * 0.85 : max / 2.25;
    return Math.max(70, Math.min(max, perSlot * 2.25));
  });

  function poseOf(i: number): Pose {
    const t = elapsed - i * STAGGER_MS;
    if (t < WALK_MS) return 'walk';
    if (t < WALK_MS + WAVE_MS) return 'wave';
    return 'idle';
  }
</script>

<section class="space-y-6 text-center">
  <header>
    <p class="text-sm font-semibold uppercase tracking-widest text-indigo-400">Spielstart</p>
    <h2 class="{readonly ? 'text-5xl' : 'text-3xl'} font-black">Das sind eure Figuren!</h2>
  </header>

  <div class="flex flex-wrap items-end justify-center gap-x-4 gap-y-6 overflow-hidden py-4" bind:clientWidth={width}>
    {#each players as p, i (p.id)}
      <div class="walk-in flex flex-col items-center gap-2" style="animation-delay:{i * STAGGER_MS}ms; animation-duration:{WALK_MS}ms">
        <Figure parts={figureOf(view, p)} {size} pose={poseOf(i)} seed={i} />
        <span class="max-w-[12rem] break-words font-bold {readonly ? 'text-2xl' : ''}">{p.name}</span>
        {#if isModerator(view, p.id)}<span class="badge bg-indigo-500/20 text-indigo-300">Moderator</span>{/if}
      </div>
    {/each}
  </div>

  {#if !readonly}
    {#if client.isHost}
      <button class="btn-primary w-full max-w-md text-lg" onclick={() => client.send({ type: 'intro_done' })}>Weiter zur Kategoriewahl</button>
    {:else}
      <p class="text-sm text-slate-400">Gleich geht's los …</p>
    {/if}
  {/if}
</section>

<style>
  .walk-in {
    animation-name: walk-in;
    animation-timing-function: cubic-bezier(0.3, 0.6, 0.4, 1);
    animation-fill-mode: both;
  }
  @keyframes walk-in {
    from {
      transform: translateX(-70vw);
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .walk-in {
      animation: none;
    }
  }
</style>
