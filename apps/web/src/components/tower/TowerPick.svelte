<script lang="ts">
  import { untrack } from 'svelte';
  import { TOWER_GOAL_HEIGHT, TOWER_GOAL_LABELS, TOWER_GOALS, TOWER_GROUP_LABELS, towerMarks, type RoomView, type TowerGoal } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { GOLD } from './towerStyle.ts';

  /** Kategoriewahl für Hochstapler: keine Liste, nur die Ziellinie. Die letzte Wahl ist vorausgewählt. */
  let { view }: { view: RoomView } = $props();

  let goal = $state<TowerGoal>(untrack(() => view.towerOptions.goal));
  const HINTS: Record<TowerGoal, string> = {
    low: 'Schnelle Runde, ein paar Minuten.',
    mid: 'Der Klassiker, genug Zeit für Magie.',
    high: 'Langes Rennen, viel Wackeln.',
  };
  const max = Math.max(...TOWER_GOALS.map((g) => TOWER_GOAL_HEIGHT[g]));

  function start() {
    client.send({ type: 'choose_category', gameId: 'tower', categoryId: 'tower', tower: { goal } });
  }
</script>

<div class="card space-y-4">
  <div>
    <p class="font-black">Ziellinie</p>
    <p class="text-sm text-slate-500">
      Jeder baut auf seinem Handy. Wer den Turm zuerst drei Sekunden ruhig über der Linie hält, gewinnt, der Rest wird nach Höhe gereiht. An jeder
      Höhenmarke gibt es die Wahl: {TOWER_GROUP_LABELS.light} für den eigenen Turm oder {TOWER_GROUP_LABELS.dark} gegen die anderen.
    </p>
  </div>
  <div class="grid grid-cols-3 gap-2">
    {#each TOWER_GOALS as g (g)}
      {@const on = goal === g}
      <button
        class="flex flex-col items-center gap-2 rounded-2xl border-2 px-2 pb-3 pt-3 transition {on ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}"
        onclick={() => (goal = g)}
        aria-pressed={on}
      >
        <!-- Kleiner Turm bis zur Linie -->
        <span class="relative flex h-16 w-10 items-end justify-center" aria-hidden="true">
          <span class="absolute inset-x-0 h-[2px] rounded-full" style="bottom:{(TOWER_GOAL_HEIGHT[g] / max) * 100}%; background:{GOLD}; box-shadow: 0 0 6px {GOLD}"></span>
          <span class="flex w-4 flex-col-reverse gap-[2px]" style="height:{(TOWER_GOAL_HEIGHT[g] / max) * 100}%">
            {#each Array.from({ length: Math.round(TOWER_GOAL_HEIGHT[g] / 3) }) as _, i (i)}
              <span class="flex-1 rounded-[3px] {on ? 'bg-indigo-500' : 'bg-slate-700'}" style="transform: translateX({i % 2 ? 2 : -2}px)"></span>
            {/each}
          </span>
        </span>
        <span class="text-sm font-black {on ? 'text-indigo-400' : ''}">{TOWER_GOAL_LABELS[g]}</span>
        <span class="font-mono text-lg font-black leading-none">{TOWER_GOAL_HEIGHT[g]} m</span>
        <span class="text-center text-[0.7rem] leading-snug text-slate-500">{HINTS[g]} {towerMarks(TOWER_GOAL_HEIGHT[g]).length} Marken.</span>
      </button>
    {/each}
  </div>
  <button class="btn-primary w-full text-lg" onclick={start}>Rennen starten</button>
</div>
