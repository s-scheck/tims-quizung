<script lang="ts">
  import type { RoomView, StillsRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  let { view, round, readonly = false }: { view: RoomView; round: StillsRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  let picked = $state<number | null>(null);
  const shownIndex = $derived(picked ?? (round.solved?.stage ?? round.images.length - 1));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-3">
    <header>
      <p class="text-sm text-slate-400">Auflösung · {round.category.title}</p>
      <h2 class="break-words text-3xl font-black sm:text-4xl {readonly ? 'text-5xl' : ''}">{round.answer ?? '?'}</h2>
      {#if round.category.source}<p class="text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>
    <img
      src={round.images[shownIndex]}
      alt="Foto {shownIndex + 1}"
      class="mx-auto block w-auto max-w-full rounded-2xl border border-slate-800 bg-slate-900 object-contain {readonly ? 'max-h-[70vh]' : 'max-h-[60vh]'}"
      draggable="false"
    />
    <div class="flex flex-wrap justify-center gap-2">
      {#each round.images as src, i (i)}
        <button
          class="relative overflow-hidden rounded-lg border-2 transition {shownIndex === i ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'}"
          aria-label="Foto {i + 1} zeigen"
          onclick={() => (picked = i)}
        >
          <img {src} alt="" class="block h-14 w-20 object-cover sm:h-16 sm:w-24" draggable="false" />
          <span class="absolute bottom-0 right-0 rounded-tl-md bg-slate-950/80 px-1.5 text-xs font-bold">{i + 1} · {round.points[i]} P</span>
        </button>
      {/each}
    </div>
  </section>

  <aside class="space-y-4">
    <div class="card space-y-2">
      <h3 class="font-bold">Erkannt</h3>
      {#if round.solved}
        <p class="text-sm text-slate-400">Bei Foto {round.solved.stage + 1}, je {round.points[round.solved.stage]} Punkte</p>
        <ul class="space-y-1">
          {#each round.solved.winners as id (id)}
            <li class="flex items-center gap-2 {readonly ? 'text-xl' : ''} {id === client.myId ? 'text-indigo-200' : ''}">
              <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, id)}</span>
              <span class="font-mono font-black">{round.awarded[id] ?? 0}</span>
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
            {@const guesses = round.guesses?.[p.id] ?? []}
            <li>
              <span class="font-semibold">{p.name}</span>
              {#if guesses.length === 0}
                <span class="text-slate-500"> · kein Tipp</span>
              {:else}
                <span class="text-slate-400">
                  · {guesses.map((g) => `${g.stage + 1}: ${g.status === 'correct' ? '✓' : g.status === 'wrong' ? '✗' : '?'} ${g.text}`).join(', ')}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if !readonly}
      {#if client.isHost && view.phase === 'reveal'}
        <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'to_scoring' })}>Punkte eintragen</button>
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}…</p>
      {/if}
    {/if}
  </aside>
</div>
