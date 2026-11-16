<script lang="ts">
  import PlayerHead from './PlayerHead.svelte';
  import type { BaseRoundView, RoomView } from '@quiz/shared';
  import { playerName } from '../lib/format.ts';

  /** Kennzeichen neben dem Namen: Dieser Spieler hat per Joker kopiert. `section` für Abschnitte vor dem Joker (No-Risk-Durchgang, Promi). */
  let { view, round, playerId, section = Infinity }: { view: RoomView; round: BaseRoundView; playerId: string; section?: number } = $props();

  const joker = $derived(round.joker?.by === playerId && section >= round.joker.from ? round.joker : null);
</script>

{#if joker}
  <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-bold text-amber-200">
    🃏 {#if joker.target}kopiert <PlayerHead {view} id={joker.target} size={16} /> {playerName(view, joker.target)}{:else}Joker{/if}
  </span>
{/if}
