<script lang="ts">
  import type { RiskRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  let { view, round, large = false }: { view: RoomView; round: RiskRoundView; large?: boolean } = $props();

  const rows = $derived(round.turnOrder.map((id) => ({ id, total: round.totals[id] ?? 0 })).sort((a, b) => b.total - a.total));
</script>

<div class="card space-y-2">
  <div class="flex flex-wrap items-baseline justify-between gap-x-2">
    <h3 class="font-bold">Kategorie-Punkte</h3>
    <span class="text-xs text-slate-500">zählen nicht für die Gesamtwertung</span>
  </div>
  <ul class="space-y-1">
    {#each rows as row (row.id)}
      <li class="flex items-center gap-3 {large ? 'text-xl' : ''} {row.id === client.myId ? 'text-indigo-200' : ''}">
        <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, row.id)}</span>
        <span class="font-mono font-bold {row.total < 0 ? 'text-rose-300' : ''}">{row.total}</span>
      </li>
    {/each}
  </ul>
</div>
