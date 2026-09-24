<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();
  const last = $derived(playerName(view, view.round?.activePlayerId));
  const isLast = $derived(view.round?.activePlayerId === client.myId);
</script>

<div class="card border-amber-400/40 bg-amber-400/10 space-y-3">
  <p class="text-lg font-bold">Nur noch {isLast && !readonly ? 'du' : last} {isLast && !readonly ? 'bist' : 'ist'} im Spiel.</p>
  {#if client.isHost && !readonly}
    <p class="text-sm text-slate-300">Runde jetzt beenden oder {isLast ? 'dich' : last} allein weiterlegen lassen, bis alles liegt oder ein Fehler passiert?</p>
    <div class="flex flex-wrap gap-2">
      <button class="btn-primary flex-1" onclick={() => client.send({ type: 'host_decision', continue: false })}>Runde beenden</button>
      <button class="btn-secondary flex-1" onclick={() => client.send({ type: 'host_decision', continue: true })}>Weiterspielen lassen</button>
    </div>
  {:else}
    <p class="text-sm text-slate-300">{playerName(view, view.hostId)} entscheidet, ob die Runde endet oder {last} allein weiterspielt…</p>
  {/if}
</div>
