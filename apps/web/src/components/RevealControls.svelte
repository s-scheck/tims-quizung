<script lang="ts">
  import type { ShowRevealView } from '@quiz/shared';
  import { revealAll, revealSolution, revealedCount } from '../lib/reveal.ts';

  let {
    show,
    turnOrder,
    solutionLabel = 'Lösung aufdecken',
    confirmSolution = '',
    allLabel = 'Alle aufdecken',
    hint = 'Tippe auf einen Namen, dann sehen alle sein Ergebnis.',
  }: {
    show: ShowRevealView;
    turnOrder: string[];
    solutionLabel?: string;
    /** Wenn gesetzt, fragt der Lösungs-Knopf erst nach (Zwei-Schritt-Knopf mit diesem Text). */
    confirmSolution?: string;
    allLabel?: string;
    hint?: string;
  } = $props();

  const done = $derived(revealedCount(show, turnOrder));
  let confirming = $state(false);

  function solution() {
    if (show.solution) return;
    if (confirmSolution && !confirming) {
      confirming = true;
      setTimeout(() => (confirming = false), 4000);
      return;
    }
    confirming = false;
    revealSolution();
  }
</script>

<div class="card space-y-3 border-amber-500/40">
  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
    <p class="font-bold text-amber-300">Show-Auflösung</p>
    <span class="text-xs text-slate-500">{done} von {turnOrder.length} aufgedeckt{show.solution ? ' · Lösung offen' : ''}</span>
  </div>
  <p class="text-xs text-slate-500">{hint} Nur du siehst schon alles.</p>
  <div class="flex flex-wrap gap-2">
    <button class="{confirming ? 'btn-danger' : 'btn-secondary'} px-4 py-2 text-sm" disabled={show.solution} onclick={solution}>
      {show.solution ? 'Lösung ist offen' : confirming ? confirmSolution : solutionLabel}
    </button>
    <button class="btn-secondary px-4 py-2 text-sm" disabled={done === turnOrder.length} onclick={revealAll}>{allLabel}</button>
  </div>
</div>
