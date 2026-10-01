<script lang="ts">
  import type { MatchRoundView, RoomView, TopXRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';

  let { view, round, readonly = false }: { view: RoomView; round: TopXRoundView | MatchRoundView; readonly?: boolean } = $props();
  const players = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
</script>

<ul class="space-y-2">
  {#each players as p (p.id)}
    {@const lives = round.lives[p.id] ?? 0}
    {@const out = lives === 0}
    <li
      class="flex items-center gap-3 rounded-xl border px-3 py-2
        {round.activePlayerId === p.id ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-800 bg-slate-900/50'}
        {out ? 'opacity-50' : ''} {readonly ? 'text-xl' : ''}"
    >
      <span class="h-2.5 w-2.5 shrink-0 rounded-full {p.connected ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
      <span class="min-w-0 flex-1 truncate font-semibold {out ? 'line-through' : ''}">
        {p.name}{#if p.id === client.myId}<span class="text-xs font-normal text-slate-500"> (du)</span>{/if}
      </span>
      <span class="shrink-0 text-xs text-slate-400">{round.hits[p.id] ?? 0} ✓</span>
      <span class="shrink-0 font-mono tracking-wider">
        <span class="text-rose-400">{'♥'.repeat(lives)}</span><span class="text-slate-700">{'♥'.repeat(Math.max(0, round.maxLives - lives))}</span>
      </span>
    </li>
  {/each}
</ul>
