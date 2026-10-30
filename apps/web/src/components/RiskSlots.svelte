<script lang="ts">
  import type { RiskRoundView, RiskSlotView, RoomView } from '@quiz/shared';
  import { formatValue, playerName } from '../lib/format.ts';

  /** Zeigt alle Plätze 1–N; Plätze ohne Eintrag erscheinen als leere Zeile, damit man die Lücken sieht. */
  let { view, round, slots, large = false }: { view: RoomView; round: RiskRoundView; slots: RiskSlotView[]; large?: boolean } = $props();

  const rows = $derived.by((): { rank: number; slot?: RiskSlotView }[] => {
    const byRank = new Map(slots.map((s) => [s.rank, s]));
    return Array.from({ length: round.size }, (_, i) => ({ rank: i + 1, slot: byRank.get(i + 1) }));
  });
  /** Treffer aus dem zuletzt aufgelösten Durchgang gelten als neu, bis der nächste aufgelöst ist. */
  const latestPass = $derived(round.passes[round.passes.length - 1]?.passNo);

  function valueText(slot: RiskSlotView): string {
    return formatValue({ id: String(slot.rank), name: slot.name, value: slot.value, label: slot.label }, round.category);
  }
</script>

<ol class="space-y-1">
  {#each rows as { rank, slot } (rank)}
    {#if !slot}
      <li class="flex items-center gap-3 rounded-lg px-3 py-0.5 text-slate-600 {large ? 'text-xl' : ''}" aria-label="Platz {rank} offen">
        <span class="w-7 shrink-0 text-right font-mono text-sm">{rank}</span>
        <span class="flex-1 border-b border-dotted border-slate-700"></span>
      </li>
    {:else}
      {@const hit = slot.passNo !== undefined}
      {@const fresh = hit && slot.passNo === latestPass}
      <li class="flex items-center gap-3 rounded-lg px-3 py-1.5 {hit ? 'bg-emerald-500/10' : 'bg-slate-900/40 text-slate-400'} {fresh ? 'ring-2 ring-amber-400/60' : ''} {large ? 'text-xl' : ''}">
        <span class="w-7 shrink-0 text-right font-mono text-sm text-slate-500">{slot.rank}</span>
        <span class="min-w-0 flex-1 break-words {hit ? 'font-semibold' : ''}">{slot.name}</span>
        {#if fresh}
          <span class="shrink-0 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">neu</span>
        {/if}
        {#if hit}
          <span class="hidden break-words text-xs text-slate-400 sm:inline">{(slot.by ?? []).map((id) => playerName(view, id)).join(', ')}</span>
        {/if}
        <span class="shrink-0 font-mono text-xs text-slate-400">{valueText(slot)}</span>
      </li>
    {/if}
  {/each}
</ol>
