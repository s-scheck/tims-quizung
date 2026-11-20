<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import { router } from '../../lib/router.svelte.ts';
  import EndCategoryButton from '../EndCategoryButton.svelte';
  import PlayerHead from '../PlayerHead.svelte';

  /**
   * Kleines Menü hinter dem Symbol oben links, solange der Dungeon den ganzen Bildschirm hat: Raum, Ton, für den
   * Host „Ohne X weiter“ für alle, auf die gewartet wird, und „Dungeon beenden“, dazu „Raum verlassen“ mit Rückfrage.
   */
  let {
    view,
    muted,
    waiting = [],
    onMute,
    onSkip,
    onClose,
  }: { view: RoomView; muted: boolean; waiting?: string[]; onMute: () => void; onSkip: (id: string) => void; onClose: () => void } = $props();

  let confirming = $state(false);

  function leave() {
    if (!confirming) {
      confirming = true;
      setTimeout(() => (confirming = false), 3000);
      return;
    }
    client.leave();
    router.navigate('/');
  }
</script>

<div class="absolute inset-0 z-50" role="presentation">
  <button class="absolute inset-0 bg-black/40" aria-label="Menü schließen" onclick={onClose} transition:fade={{ duration: 150 }}></button>
  <div
    class="menu absolute left-2 w-64 rounded-2xl p-1.5 text-amber-50"
    style="top: calc(env(safe-area-inset-top) + 3.25rem)"
    transition:fly={{ y: -10, duration: 200, easing: cubicOut }}
    role="dialog"
    aria-label="Menü"
  >
    <div class="flex items-baseline justify-between gap-2 px-2.5 pb-2 pt-1.5">
      <span class="font-mono text-sm font-black tracking-[0.2em]">{view.code}</span>
      {#if client.myId}<span class="min-w-0 break-words text-right text-xs text-amber-50/55">{playerName(view, client.myId)}</span>{/if}
    </div>
    <button class="item" onclick={onMute}>
      <span>Ton und Vibration</span>
      <span class="toggle {muted ? '' : 'toggle-on'}" aria-hidden="true"></span>
    </button>
    {#if client.isHost && waiting.length > 0}
      <p class="px-2.5 pb-1 pt-2 text-[0.65rem] font-bold uppercase tracking-wider text-amber-50/45">Es wird gewartet auf</p>
      {#each waiting as id (id)}
        <button class="item" onclick={() => onSkip(id)}>
          <span class="flex min-w-0 items-center gap-2"><PlayerHead {view} {id} size={18} /><span class="truncate">{playerName(view, id)}</span></span>
          <span class="shrink-0 text-[0.72rem] text-amber-300">ohne weiter</span>
        </button>
      {/each}
    {/if}
    {#if client.isHost}
      <div class="flex justify-stretch px-1 pb-1 pt-1 [&>button]:w-full">
        <EndCategoryButton {view} label="Dungeon beenden" title="Alle bleiben, wo sie sind, und es geht zur Auswertung." />
      </div>
    {/if}
    <button class="item {confirming ? 'text-rose-300' : 'text-amber-50/85'}" onclick={leave}>
      <span>{confirming ? 'Wirklich verlassen?' : 'Raum verlassen'}</span>
      <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path d="M14 5h5v14h-5M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  </div>
</div>

<style>
  .menu {
    background: rgba(24, 19, 14, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 226, 170, 0.12),
      0 18px 40px -16px rgba(0, 0, 0, 0.8);
  }
  .item {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    border-radius: 0.75rem;
    padding: 0.6rem 0.65rem;
    font-size: 0.82rem;
    font-weight: 700;
    -webkit-tap-highlight-color: transparent;
  }
  .item:active {
    background: rgba(255, 236, 200, 0.08);
  }
  .toggle {
    position: relative;
    width: 2.1rem;
    height: 1.25rem;
    flex-shrink: 0;
    border-radius: 999px;
    background: rgba(255, 236, 200, 0.18);
    transition: background-color 150ms ease;
  }
  .toggle::after {
    content: '';
    position: absolute;
    top: 0.15rem;
    left: 0.15rem;
    width: 0.95rem;
    height: 0.95rem;
    border-radius: 999px;
    background: white;
    transition: transform 150ms ease;
  }
  .toggle-on {
    background: #e0a43a;
  }
  .toggle-on::after {
    transform: translateX(0.85rem);
  }
</style>
