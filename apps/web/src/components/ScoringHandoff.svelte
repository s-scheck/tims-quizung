<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  /** Übergang von der Auflösung zur Punkteeingabe: Knopf für den Host, Wartetext für alle anderen. */
  let { view, disabled = false, hint = '' }: { view: RoomView; disabled?: boolean; hint?: string } = $props();
</script>

{#if client.isHost && view.phase === 'reveal'}
  <button class="btn-primary w-full text-lg" {disabled} onclick={() => client.send({ type: 'to_scoring' })}>Punkte eintragen</button>
  {#if disabled && hint}<p class="text-center text-xs text-slate-500">{hint}</p>{/if}
{:else if view.phase === 'scoring'}
  <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
{:else}
  <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
{/if}
