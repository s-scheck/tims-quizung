<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';

  /** Host beendet eine rundenbasierte Kategorie vorzeitig: Zwei-Schritt-Knopf, sendet `end_round`. */
  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();

  const canEnd = $derived(!readonly && client.isHost && (view.phase === 'playing' || view.phase === 'host_decision'));
  let confirming = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function click() {
    if (!canEnd) return;
    if (!confirming) {
      confirming = true;
      timer = setTimeout(() => (confirming = false), 3500);
      return;
    }
    if (timer) clearTimeout(timer);
    confirming = false;
    client.send({ type: 'end_round' });
  }
</script>

{#if canEnd}
  <button
    class="{confirming ? 'btn-danger' : 'btn-ghost'} shrink-0 px-3 py-2 text-xs"
    title="Alle Werte werden aufgedeckt, Punkte wie gewohnt."
    onclick={click}
  >
    {confirming ? 'Wirklich beenden?' : 'Kategorie beenden'}
  </button>
{/if}
