<script lang="ts">
  import type { RiskRoundView, RiskSlotView, RoomView } from '@quiz/shared';
  import { formatValue, playerName } from '../lib/format.ts';

  let { view, round, slots, large = false }: { view: RoomView; round: RiskRoundView; slots: RiskSlotView[]; large?: boolean } = $props();

  function valueText(slot: RiskSlotView): string {
    return formatValue({ id: String(slot.rank), name: slot.name, value: slot.value, label: slot.label }, round.category);
  }
</script>

<ol class="space-y-1">
  {#each slots as slot (slot.rank)}
    {@const hit = slot.passNo !== undefined}
    <li class="flex items-center gap-3 rounded-lg px-3 py-1.5 {hit ? 'bg-emerald-500/10' : 'bg-slate-900/40 text-slate-400'} {large ? 'text-xl' : ''}">
      <span class="w-7 shrink-0 text-right font-mono text-sm text-slate-500">{slot.rank}</span>
      <span class="min-w-0 flex-1 truncate {hit ? 'font-semibold' : ''}">{slot.name}</span>
      {#if hit}
        <span class="hidden truncate text-xs text-slate-400 sm:inline">{(slot.by ?? []).map((id) => playerName(view, id)).join(', ')}</span>
      {/if}
      <span class="shrink-0 font-mono text-xs text-slate-400">{valueText(slot)}</span>
    </li>
  {/each}
</ol>
