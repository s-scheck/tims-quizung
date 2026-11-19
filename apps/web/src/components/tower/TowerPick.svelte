<script lang="ts">
  import { untrack } from 'svelte';
  import { TOWER_GOAL_HEIGHT, TOWER_GOAL_LABELS, TOWER_GOALS, towerMarks, type RoomView, type TowerGoal } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';

  /** Kategoriewahl für Hochstapler: keine Liste, nur die Ziellinie. Die letzte Wahl ist vorausgewählt. */
  let { view }: { view: RoomView } = $props();

  let goal = $state<TowerGoal>(untrack(() => view.towerOptions.goal));
  const HINTS: Record<TowerGoal, string> = {
    low: 'Schnelle Runde, ein paar Minuten.',
    mid: 'Der Klassiker mit Spezials unterwegs.',
    high: 'Langes Rennen, viel Wackeln.',
  };

  function start() {
    client.send({ type: 'choose_category', gameId: 'tower', categoryId: 'tower', tower: { goal } });
  }
</script>

<div class="card space-y-3">
  <div>
    <p class="font-semibold">Ziellinie</p>
    <p class="text-xs text-slate-500">Jeder baut auf seinem Handy. Wer den Turm zuerst drei Sekunden ruhig über der Linie hält, gewinnt, der Rest wird nach Höhe gereiht. Höhenmarken und Spezialsteine bringen Spezials.</p>
  </div>
  <div class="grid gap-2 sm:grid-cols-3">
    {#each TOWER_GOALS as g (g)}
      <button
        class="rounded-xl border px-3 py-2 text-left transition {goal === g ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}"
        onclick={() => (goal = g)}
      >
        <span class="flex items-baseline justify-between text-sm font-semibold"><span>{TOWER_GOAL_LABELS[g]}</span><span class="font-mono">{TOWER_GOAL_HEIGHT[g]} m</span></span>
        <span class="block text-xs opacity-80">{HINTS[g]} {towerMarks(TOWER_GOAL_HEIGHT[g]).length} Höhenmarken.</span>
      </button>
    {/each}
  </div>
  <button class="btn-primary w-full text-lg" onclick={start}>Rennen starten</button>
</div>
