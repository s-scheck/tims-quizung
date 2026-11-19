<script lang="ts">
  import type { DungeonRoundView, RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import ScoringHandoff from '../ScoringHandoff.svelte';
  import { doorFormat } from './doorLabel.ts';

  /** Auswertung: Rangliste und das Protokoll jeder Tür mit Frage, Lösung und allen Versuchen. */
  let { view, round, readonly = false }: { view: RoomView; round: DungeonRoundView; readonly?: boolean } = $props();

  const attemptsAt = (doorId: string) => (round.attempts ?? []).filter((a) => a.doorId === doorId);
  const tried = $derived(new Set((round.attempts ?? []).map((a) => a.doorId)));
  const triesText = (w: number) => (w === 0 ? 'ohne Fehlversuch' : w === 1 ? '1 Fehlversuch' : `${w} Fehlversuche`);
</script>

<div class="{readonly ? 'grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-6' : 'space-y-4'}">
  <section class="space-y-2">
    <p class="text-sm text-slate-400">Auswertung · Dungeon</p>
    <h2 class="font-black {readonly ? 'text-4xl' : 'text-2xl'}">Wer kam am schnellsten raus?</h2>
    <ol class="space-y-1.5">
      {#each round.ranking as x (x.playerId)}
        <li class="flex items-center gap-3 rounded-xl border px-3 py-2 {x.place === 1 ? 'border-amber-400/60 bg-amber-400/10' : 'border-slate-800 bg-slate-900/60'} {x.playerId === client.myId ? 'ring-1 ring-indigo-400/60' : ''} {readonly ? 'text-xl' : ''}">
          <span class="w-8 text-center font-black {x.place === 1 ? 'text-2xl' : 'text-slate-400'}">{x.place === 1 ? '👑' : `${x.place}.`}</span>
          <PlayerHead {view} id={x.playerId} size={readonly ? 30 : 22} />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold">{playerName(view, x.playerId)}</span>
            <span class="block text-xs text-slate-400">
              {x.status === 'out' ? `draußen nach ${x.exitRound} Runden` : `Raum ${x.room + 1}${x.status === 'eliminated' ? ', ausgeschieden' : ''}`} · {triesText(x.wrong)}
            </span>
          </span>
          <span class="font-mono font-black text-indigo-200">+{x.points}</span>
        </li>
      {/each}
    </ol>
    {#if !readonly}
      <ScoringHandoff {view} />
    {/if}
  </section>

  <section class="space-y-3">
    <h3 class="font-bold text-slate-300 {readonly ? 'text-xl' : ''}">Hinter den Türen</h3>
    {#if tried.size === 0}
      <p class="text-slate-500">Niemand hat eine Tür versucht.</p>
    {/if}
    {#each round.rooms as doors, r (r)}
      {@const used = doors.filter((d) => tried.has(d.id))}
      {#if used.length > 0}
        <div class="space-y-1.5">
          <p class="text-xs font-semibold uppercase tracking-wider text-amber-300/80">Raum {r + 1}</p>
          <div class="grid gap-1.5 {readonly ? 'grid-cols-2' : ''}">
            {#each used as d (d.id)}
              {@const sol = round.solutions?.[d.id]}
              <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 text-sm">
                <p class="text-xs text-slate-500">{d.title} · {doorFormat(d)}</p>
                <p class="font-semibold {readonly ? 'line-clamp-2' : ''}">{sol?.prompt}</p>
                <p class="text-emerald-300 {readonly ? 'line-clamp-1' : ''}">Lösung: <span class="font-bold">{sol?.solution}</span></p>
                {#if readonly}
                  <div class="mt-1 flex flex-wrap gap-1">
                    {#each attemptsAt(d.id) as a, i (i)}
                      <span class="inline-flex items-center gap-1 rounded-full border px-1.5 text-xs {a.correct ? 'border-emerald-500/50 text-emerald-200' : 'border-slate-700 text-slate-400'}">
                        {a.correct ? '✓' : '✗'}<PlayerHead {view} id={a.playerId} size={14} />{playerName(view, a.playerId)}
                      </span>
                    {/each}
                  </div>
                {:else}
                  <ul class="mt-1 space-y-0.5">
                    {#each attemptsAt(d.id) as a, i (i)}
                      <li class="flex items-center gap-1.5 {a.correct ? 'text-emerald-200' : 'text-slate-400'}">
                        <span class="w-4 font-bold">{a.correct ? '✓' : '✗'}</span>
                        <PlayerHead {view} id={a.playerId} size={16} />
                        <span class="min-w-0 break-words"><span class="font-semibold">{playerName(view, a.playerId)}:</span> {a.answer}{a.detail ? ` (${a.detail})` : ''}</span>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  </section>
</div>
