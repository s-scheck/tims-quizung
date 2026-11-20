<script lang="ts">
  import { untrack } from 'svelte';
  import { TOWER_GOAL_HEIGHT, TOWER_GOAL_LABELS, TOWER_GOALS, TOWER_GROUP_LABELS, towerMarks, type RoomView, type TowerGoal } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { GOLD } from './towerStyle.ts';

  /**
   * Kategoriewahl für Hochstapler: keine Liste, nur die Ziellinie. Fünf schmale Karten in einer Reihe (passt am Handy
   * ohne Scrollen), darunter eine Zeile zur gewählten Stufe. Die letzte Wahl ist vorausgewählt.
   */
  let { view }: { view: RoomView } = $props();

  let goal = $state<TowerGoal>(untrack(() => view.towerOptions.goal));
  const HINTS: Record<TowerGoal, string> = {
    low: 'Schnelle Runde, ein paar Minuten.',
    mid: 'Der Klassiker, genug Zeit für Magie.',
    high: 'Langes Rennen, viel Wackeln.',
    xhigh: 'Für Geduldige, viel Magie unterwegs.',
    sky: 'Marathon in die Wolken.',
  };
  /** Weiche Trennung, damit „Wolkenkratzer“ in die schmale Karte passt. */
  const label = (g: TowerGoal) => TOWER_GOAL_LABELS[g].replace('Wolkenkratzer', 'Wolken­kratzer');
  const max = Math.max(...TOWER_GOALS.map((g) => TOWER_GOAL_HEIGHT[g]));

  function start() {
    client.send({ type: 'choose_category', gameId: 'tower', categoryId: 'tower', tower: { goal } });
  }
</script>

<div class="card space-y-3">
  <div>
    <p class="font-black">Ziellinie</p>
    <p class="text-sm leading-snug text-slate-500">
      Jeder baut auf seinem Handy. Wer den Turm zuerst drei Sekunden ruhig über der Linie hält, gewinnt, der Rest wird nach Höhe gereiht. An jeder
      Höhenmarke gibt es {TOWER_GROUP_LABELS.light} für den eigenen Turm oder {TOWER_GROUP_LABELS.dark} gegen die anderen, dazu zwischendurch Glück.
    </p>
  </div>
  <div class="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Ziellinie">
    {#each TOWER_GOALS as g (g)}
      {@const on = goal === g}
      <button
        class="flex min-w-0 flex-col items-center gap-1 rounded-xl border-2 px-0.5 pb-1.5 pt-2 transition {on ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}"
        onclick={() => (goal = g)}
        role="radio"
        aria-checked={on}
        aria-label="{TOWER_GOAL_LABELS[g]}, {TOWER_GOAL_HEIGHT[g]} m"
      >
        <!-- Kleiner Turm bis zur Linie -->
        <span class="relative flex h-14 w-8 items-end justify-center" aria-hidden="true">
          <span class="absolute inset-x-0 h-[2px] rounded-full" style="bottom:{(TOWER_GOAL_HEIGHT[g] / max) * 100}%; background:{GOLD}; box-shadow: 0 0 6px {GOLD}"></span>
          <span class="flex w-3 flex-col-reverse gap-[1.5px]" style="height:{(TOWER_GOAL_HEIGHT[g] / max) * 100}%">
            {#each Array.from({ length: Math.round(TOWER_GOAL_HEIGHT[g] / 4) }) as _, i (i)}
              <span class="flex-1 rounded-[2px] {on ? 'bg-indigo-500' : 'bg-slate-700'}" style="transform: translateX({i % 2 ? 1.5 : -1.5}px)"></span>
            {/each}
          </span>
        </span>
        <span class="font-mono text-base font-black leading-none">{TOWER_GOAL_HEIGHT[g]}<span class="text-[0.65em]"> m</span></span>
        <span class="hyphens-manual w-full break-words text-center text-[0.66rem] font-extrabold leading-tight {on ? 'text-indigo-400' : 'text-slate-500'}">{label(g)}</span>
      </button>
    {/each}
  </div>
  <p class="text-center text-xs text-slate-500">
    <b class="font-extrabold text-slate-400">{TOWER_GOAL_LABELS[goal]}:</b>
    {HINTS[goal]}
    {towerMarks(TOWER_GOAL_HEIGHT[goal]).length} Marken.
  </p>
  <button class="btn-primary w-full text-lg" onclick={start}>Rennen starten</button>
</div>
