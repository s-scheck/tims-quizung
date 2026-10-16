<script lang="ts">
  import { fly } from 'svelte/transition';
  import { MORSE_POINTS, type MorseRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  let { view, round, readonly = false }: { view: RoomView; round: MorseRoundView; readonly?: boolean } = $props();

  const pretty = (code: string) => code.replace(/\./g, '·').replace(/-/g, '−');
  const seconds = (at: number) => ((at - round.startedAt) / 1000).toFixed(1);
  const unsolved = $derived(round.turnOrder.filter((id) => !round.solved.some((s) => s.playerId === id)));
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Auflösung · Morse</p>
      <h2 class="text-3xl font-black tracking-wide {readonly ? 'text-5xl' : ''}">{round.word}</h2>
      <p class="mt-1 font-mono text-xl tracking-[0.3em] text-amber-200 {readonly ? 'text-3xl' : ''}">{pretty(round.code ?? '')}</p>
      <p class="mt-1 text-xs text-slate-500">{round.plays} {round.plays === 1 ? 'Wiedergabe' : 'Wiedergaben'}</p>
    </header>

    <ol class="card divide-y divide-slate-800 p-0">
      {#each round.solved as s, i (s.playerId)}
        <li class="flex items-center gap-3 px-4 py-3 {readonly ? 'text-xl' : ''}" in:fly={{ y: 8, delay: i * 80, duration: 250 }}>
          <span class="w-8 text-center text-xl">{s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `${s.rank}.`}</span>
          <span class="min-w-0 flex-1 truncate font-semibold">{playerName(view, s.playerId)}</span>
          <span class="font-mono text-sm text-slate-400">{seconds(s.at)} s</span>
          <span class="w-10 text-right font-mono text-lg font-black {(MORSE_POINTS[s.rank - 1] ?? 0) > 0 ? 'text-amber-300' : 'text-slate-600'}">+{MORSE_POINTS[s.rank - 1] ?? 0}</span>
        </li>
      {/each}
      {#each unsolved as id (id)}
        <li class="flex items-center gap-3 px-4 py-3 text-slate-500 {readonly ? 'text-xl' : ''}">
          <span class="w-8 text-center">–</span>
          <span class="min-w-0 flex-1 truncate">{playerName(view, id)}</span>
          <span class="text-sm">nicht gelöst</span>
          <span class="w-10 text-right font-mono text-lg font-black text-slate-600">+0</span>
        </li>
      {/each}
    </ol>
  </section>

  <aside class="space-y-4">
    <div class="card space-y-3">
      <h3 class="font-bold">Versuche</h3>
      {#each round.turnOrder as id (id)}
        {@const attempts = round.attempts?.[id] ?? []}
        <div>
          <p class="text-sm font-semibold">{playerName(view, id)} <span class="text-xs font-normal text-slate-500">{attempts.length} {attempts.length === 1 ? 'Versuch' : 'Versuche'}</span></p>
          {#if attempts.length > 0}
            <ul class="mt-1 flex flex-wrap gap-1">
              {#each attempts as a, i (i)}
                <li class="rounded-full border px-2 py-0.5 text-xs {a.correct ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-400'}">{a.correct ? '✓' : '✗'} {a.text}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
    </div>

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
