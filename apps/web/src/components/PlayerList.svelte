<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';

  let {
    view,
    large = false,
    showScores = false,
    canKick = false,
  }: { view: RoomView; large?: boolean; showScores?: boolean; canKick?: boolean } = $props();

  const round = $derived(view.round);
</script>

<ul class="space-y-2">
  {#each view.players as p (p.id)}
    {@const eliminated = round?.eliminated.includes(p.id) ?? false}
    {@const active = round?.activePlayerId === p.id && (view.phase === 'playing' || view.phase === 'host_decision')}
    {@const spectating = !!round && !round.turnOrder.includes(p.id) && view.phase !== 'lobby'}
    <li
      class="flex items-center gap-3 rounded-xl border px-3 py-2
        {active ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-800 bg-slate-900/50'}
        {eliminated ? 'opacity-50' : ''}
        {large ? 'text-2xl' : ''}"
    >
      <span class="h-2.5 w-2.5 shrink-0 rounded-full {p.connected ? 'bg-emerald-400' : 'bg-slate-600'}" title={p.connected ? 'verbunden' : 'getrennt'}></span>
      <span class="flex-1 truncate font-semibold {eliminated ? 'line-through' : ''}">
        {p.name}
        {#if p.id === client.myId}<span class="text-xs font-normal text-slate-500"> (du)</span>{/if}
      </span>
      {#if p.id === view.hostId}<span class="badge bg-indigo-500/20 text-indigo-300">Host</span>{/if}
      {#if eliminated}<span class="badge bg-rose-500/20 text-rose-300">raus</span>{/if}
      {#if spectating}<span class="badge">schaut zu</span>{/if}
      {#if !p.connected}<span class="badge">getrennt</span>{/if}
      {#if showScores}<span class="w-10 text-right font-mono font-bold">{view.scores[p.id] ?? 0}</span>{/if}
      {#if canKick && p.id !== client.myId}
        <button class="btn-ghost px-2 py-1 text-xs text-rose-300" onclick={() => client.send({ type: 'kick', playerId: p.id })}>Entfernen</button>
      {/if}
    </li>
  {/each}
</ul>
