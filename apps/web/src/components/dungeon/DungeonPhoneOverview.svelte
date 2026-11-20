<script lang="ts">
  import type { DungeonRoundView, RoomView } from '@quiz/shared';
  import PlayerHead from '../PlayerHead.svelte';
  import DungeonScene from './DungeonScene.svelte';

  /**
   * Alle Räume und der Ausgang als Kacheln, die zusammen genau die verfügbare Fläche füllen (Host, Zuschauer,
   * Ausgeschiedene). Spalten und Zeilen ergeben sich aus der Fläche: die Kacheln sollen möglichst groß und
   * annähernd quadratisch sein.
   */
  let { view, round, highlight = null }: { view: RoomView; round: DungeonRoundView; highlight?: number | null } = $props();

  let w = $state(0);
  let h = $state(0);
  const count = $derived(round.rooms.length + 1);
  const GAP = 6;

  const cols = $derived.by(() => {
    if (w <= 0 || h <= 0) return 2;
    let best = 1;
    let bestSize = 0;
    for (let c = 1; c <= count; c++) {
      const r = Math.ceil(count / c);
      const tw = (w - GAP * (c - 1)) / c;
      const th = (h - GAP * (r - 1)) / r;
      // Größe einer Kachel: die kürzere Seite, breite Kacheln (bis 1,6 : 1) sind in Ordnung.
      const size = Math.min(tw, th * 1.6);
      if (size > bestSize) {
        bestSize = size;
        best = c;
      }
    }
    return best;
  });
  const rows = $derived(Math.ceil(count / cols));
  const out = $derived(round.ranking.filter((x) => x.status === 'out'));
</script>

<div class="h-full w-full" bind:clientWidth={w} bind:clientHeight={h}>
  <div class="grid h-full w-full" style="gap:{GAP}px; grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-template-rows: repeat({rows}, minmax(0, 1fr))">
    {#each round.rooms as _, i (i)}
      <div class="tile relative min-h-0 min-w-0 overflow-hidden rounded-xl {highlight === i ? 'tile-me' : ''}">
        <DungeonScene {view} {round} roomIndex={i} compact fill />
        <span class="label pointer-events-none absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[0.62rem] font-black uppercase tracking-wider">Raum {i + 1}</span>
      </div>
    {/each}
    <div class="exit relative flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl p-1.5">
      <span class="text-[0.62rem] font-black uppercase tracking-wider text-amber-950/75">Ausgang</span>
      <div class="flex flex-wrap items-center justify-center gap-1">
        {#each out as x (x.playerId)}
          <span class="flex items-center gap-0.5 rounded-full bg-amber-950/15 py-0.5 pl-1 pr-0.5 text-[0.65rem] font-black text-amber-950">
            {x.place === 1 ? '👑' : `${x.place}.`}<PlayerHead {view} id={x.playerId} size={16} />
          </span>
        {:else}
          <span class="text-center text-[0.65rem] font-semibold text-amber-950/55">noch niemand</span>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .tile {
    box-shadow: inset 0 0 0 1px rgba(255, 226, 170, 0.08);
  }
  .tile-me {
    box-shadow: 0 0 0 1.5px rgba(246, 196, 83, 0.8);
  }
  .label {
    background: rgba(12, 9, 6, 0.7);
    color: rgba(255, 236, 200, 0.8);
  }
  .exit {
    background: radial-gradient(circle at 50% 35%, rgb(255 244 200 / 0.97), rgb(255 196 90 / 0.9) 55%, rgb(170 105 30 / 0.95));
    box-shadow:
      0 0 24px rgb(255 200 90 / 0.3),
      inset 0 0 0 1px rgb(255 255 255 / 0.35);
  }
</style>
