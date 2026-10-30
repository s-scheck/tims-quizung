<script lang="ts">
  import type { RoomView, StillsRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import ScoringHandoff from './ScoringHandoff.svelte';
  import StillsGallery from './StillsGallery.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: StillsRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  let picked = $state<number | null>(null);
  const shownIndex = $derived(picked ?? (round.solved?.index ?? round.images.length - 1));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="break-words text-3xl font-black sm:text-4xl {readonly ? 'text-5xl' : ''}">{round.answer ?? '?'}</h2>
      {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <StillsGallery images={round.images} stagePoints={round.stagePoints} {shownIndex} large={readonly} thumbPoints onPick={(i) => (picked = i)} />
  </section>

  <aside class="space-y-4">
    <div class="card space-y-2">
      <h3 class="font-bold">Erkannt</h3>
      {#if round.solved}
        <p class="text-sm text-slate-400">Bei Foto {round.solved.index + 1}, je {round.stagePoints[round.solved.index]} Punkte</p>
        <ul class="space-y-1">
          {#each round.solved.winners as id (id)}
            <li class="flex items-center gap-2 {readonly ? 'text-xl' : ''} {id === client.myId ? 'text-indigo-200' : ''}">
              <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, id)}</span>
              <span class="font-mono font-black">{round.points[id] ?? 0}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-sm text-slate-500">Niemand hat den Film erkannt.</p>
      {/if}
      <p class="text-xs text-slate-500">Die Punkte sind beim Eintragen schon vorbelegt, der Host kann sie noch ändern.</p>
    </div>

    {#if round.mode === 'type'}
      <div class="card">
        <h3 class="mb-2 font-bold">Alle Tipps</h3>
        <ul class="space-y-2 text-sm">
          {#each participants as p (p.id)}
            {@const attempts = round.attempts?.[p.id] ?? []}
            <li>
              <span class="font-semibold">{p.name}</span>
              {#if attempts.length === 0}
                <span class="text-slate-500"> · kein Tipp</span>
              {:else}
                <span class="text-slate-400">
                  · {attempts.map((a) => `${a.index + 1}: ${a.status === 'correct' ? '✓' : a.status === 'wrong' ? '✗' : '?'} ${a.text}`).join(', ')}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if !readonly}
      <ScoringHandoff {view} />
    {/if}
  </aside>
</div>
