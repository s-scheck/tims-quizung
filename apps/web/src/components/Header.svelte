<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';

  let { view, onLeave }: { view: RoomView; onLeave: () => void } = $props();
  const me = $derived(view.players.find((p) => p.id === client.myId));
  let confirming = $state(false);

  function leaveClick() {
    if (!confirming) {
      confirming = true;
      setTimeout(() => (confirming = false), 3000);
      return;
    }
    onLeave();
  }
</script>

<header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
  <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
    <div class="flex items-baseline gap-3">
      <span class="font-mono text-lg font-black tracking-[0.2em]">{view.code}</span>
      <span class="text-xs text-slate-500">{view.players.length} {view.players.length === 1 ? 'Spieler' : 'Spieler'}</span>
    </div>
    <div class="flex items-center gap-2 text-sm">
      {#if me}
        <span class="max-w-[8rem] truncate text-slate-300">{me.name}</span>
        {#if client.isHost}<span class="badge bg-indigo-500/20 text-indigo-300">Host</span>{/if}
      {/if}
      <button class="btn-ghost text-xs {confirming ? 'bg-rose-600/20 text-rose-300' : ''}" onclick={leaveClick}>
        {confirming ? 'Wirklich verlassen?' : 'Verlassen'}
      </button>
    </div>
  </div>
</header>
