<script lang="ts">
  import { TIMER_OPTIONS, type RoomView, type TimerSeconds } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';

  let { view, onLeave }: { view: RoomView; onLeave: () => void } = $props();
  const me = $derived(view.players.find((p) => p.id === client.myId));
  let confirming = $state(false);

  // Zeitlimit: Der Host kann es jederzeit ändern, es gilt ab dem nächsten Zug.
  let timerOpen = $state(false);
  let timerBox = $state<HTMLDivElement>();
  const timerLabel = (s: TimerSeconds) => (s === 0 ? 'Aus' : `${s} s`);

  function setTimer(s: TimerSeconds) {
    timerOpen = false;
    if (s !== view.settings.timerSeconds) client.send({ type: 'set_settings', timerSeconds: s });
  }

  function onWindowClick(e: MouseEvent) {
    if (timerOpen && timerBox && !timerBox.contains(e.target as Node)) timerOpen = false;
  }

  function leaveClick() {
    if (!confirming) {
      confirming = true;
      setTimeout(() => (confirming = false), 3000);
      return;
    }
    onLeave();
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (timerOpen = false)} />

<header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
  <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
    <div class="flex items-baseline gap-3">
      <span class="font-mono text-lg font-black tracking-[0.2em]">{view.code}</span>
      <span class="text-xs text-slate-500">{view.players.length} {view.players.length === 1 ? 'Spieler' : 'Spieler'}</span>
    </div>
    <div class="flex items-center gap-2 text-sm">
      {#if me}
        <span class="max-w-[8rem] break-words text-slate-300">{me.name}</span>
        {#if client.isHost}<span class="badge bg-indigo-500/20 text-indigo-300">{client.isModerator ? "Moderator" : "Host"}</span>{/if}
      {/if}
      {#if client.isHost}
        <div class="relative" bind:this={timerBox}>
          <button
            class="flex items-center gap-1 rounded-xl border-2 border-slate-800 px-2 py-1 text-xs font-bold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900"
            aria-haspopup="menu"
            aria-expanded={timerOpen}
            aria-label="Zeitlimit pro Zug: {timerLabel(view.settings.timerSeconds)}"
            onclick={() => (timerOpen = !timerOpen)}
          >
            <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true"><circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8 6v3l2 1.5M6.5 1.5h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
            {timerLabel(view.settings.timerSeconds)}
          </button>
          {#if timerOpen}
            <div class="absolute right-0 top-full z-30 mt-2 w-56 space-y-2 rounded-2xl border-2 border-slate-800 bg-slate-950 p-3 shadow-xl" role="menu">
              <p class="text-xs font-bold text-slate-400">Zeitlimit pro Zug</p>
              <div class="flex gap-1.5">
                {#each TIMER_OPTIONS as s (s)}
                  <button
                    class="flex-1 rounded-xl border-2 px-2 py-1.5 text-sm font-bold transition {view.settings.timerSeconds === s ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-800 text-slate-400 hover:border-slate-700'}"
                    role="menuitemradio"
                    aria-checked={view.settings.timerSeconds === s}
                    onclick={() => setTimer(s)}>{timerLabel(s)}</button
                  >
                {/each}
              </div>
              <p class="text-[11px] leading-snug text-slate-500">Gilt ab dem nächsten Zug. Ein laufender Countdown läuft mit der alten Zeit zu Ende.</p>
            </div>
          {/if}
        </div>
      {/if}
      <button class="btn-ghost text-xs {confirming ? 'bg-rose-600/20 text-rose-300' : ''}" onclick={leaveClick}>
        {confirming ? 'Wirklich verlassen?' : 'Verlassen'}
      </button>
    </div>
  </div>
</header>
