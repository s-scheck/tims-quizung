<script lang="ts">
  import { TIMER_OPTIONS, type RoomView, type TimerSeconds } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { joinUrl, playerName, screenUrl } from '../lib/format.ts';
  import { toasts } from '../lib/toast.svelte.ts';
  import PlayerList from './PlayerList.svelte';

  let { view }: { view: RoomView } = $props();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toasts.show(`${what} kopiert`, 'success');
    } catch {
      toasts.error('Kopieren nicht möglich');
    }
  }

  function setTimer(seconds: TimerSeconds) {
    client.send({ type: 'set_settings', timerSeconds: seconds });
  }

  function timerLabel(s: TimerSeconds): string {
    return s === 0 ? 'Aus' : `${s} s`;
  }
</script>

<div class="grid gap-6 md:grid-cols-2">
  <section class="card space-y-4">
    <div>
      <p class="text-sm text-slate-400">Raumcode</p>
      <p class="font-mono text-6xl font-black tracking-[0.2em]">{view.code}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn-secondary text-sm" onclick={() => copy(joinUrl(view.code), 'Link')}>Einladungslink kopieren</button>
      <button class="btn-ghost text-sm" onclick={() => copy(view.code, 'Code')}>Code kopieren</button>
    </div>
    <p class="text-xs text-slate-500">
      Für den Fernseher: <a class="underline hover:text-slate-300" href={screenUrl(view.code)} target="_blank" rel="noopener">{screenUrl(view.code).replace(/^https?:\/\//, '')}</a>
    </p>

    <div class="space-y-2 border-t border-slate-800 pt-4">
      <p class="text-sm font-semibold">Zeitlimit pro Zug</p>
      <div class="flex gap-2">
        {#each TIMER_OPTIONS as s (s)}
          <button
            class="flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition
              {view.settings.timerSeconds === s ? 'border-indigo-500 bg-indigo-500/20 text-white' : 'border-slate-700 text-slate-400'}
              {client.isHost ? 'hover:border-slate-500' : 'cursor-default'}"
            disabled={!client.isHost}
            onclick={() => setTimer(s)}
          >
            {timerLabel(s)}
          </button>
        {/each}
      </div>
      <p class="text-xs text-slate-500">Bei Ablauf scheidet der Spieler aus, als hätte er falsch gelegt.</p>
    </div>
  </section>

  <section class="card space-y-4">
    <h2 class="text-lg font-bold">Spieler ({view.players.length})</h2>
    <PlayerList {view} canKick={client.isHost} />
    {#if client.isHost}
      <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'start_game', gameId: 'sort' })}>
        Sortieren starten
      </button>
      {#if view.players.length < 2}
        <p class="text-center text-xs text-slate-500">Allein geht's auch, macht aber zu zweit mehr Spaß.</p>
      {/if}
    {:else}
      <p class="text-center text-sm text-slate-400">Warte auf {playerName(view, view.hostId)}, das Spiel zu starten…</p>
    {/if}
  </section>
</div>

<section class="card mt-6 space-y-2 text-sm text-slate-400">
  <h3 class="font-semibold text-slate-200">So geht Sortieren</h3>
  <p>Alle Karten einer Kategorie liegen offen. Eine zufällige Karte startet die Kette. Wer dran ist, wählt eine Karte und eine Lücke in der Kette und bestätigt.</p>
  <p>Liegt die Karte richtig zwischen ihren Nachbarn, bleibt sie. Liegt sie falsch, fliegt sie zurück und du bist für diese Runde raus. Die Werte siehst du erst am Ende.</p>
  <p>Punkte vergibt der Host nach jeder Runde von Hand.</p>
</section>
