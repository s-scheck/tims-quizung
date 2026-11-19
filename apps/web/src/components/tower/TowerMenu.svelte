<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import { router } from '../../lib/router.svelte.ts';
  import EndCategoryButton from '../EndCategoryButton.svelte';
  import { isTowerMuted, setTowerMuted } from './towerFeedback.ts';
  import { ms } from './towerStyle.ts';

  /**
   * Kleines Menü hinter dem Symbol oben links, solange das Spielfeld den ganzen Bildschirm hat: Raum, Ton,
   * nur Gesten (Knöpfe einklappen), für den Host „Rennen beenden“ und „Verlassen“ mit Rückfrage.
   */
  let {
    view,
    gestures,
    onGestures,
    onClose,
  }: { view: RoomView; gestures: boolean; onGestures: (on: boolean) => void; onClose: () => void } = $props();

  let muted = $state(isTowerMuted());
  let confirming = $state(false);

  function toggleSound() {
    muted = !muted;
    setTowerMuted(muted);
  }
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

<div class="absolute inset-0 z-50" onpointerdown={(e) => e.stopPropagation()} role="presentation">
  <button class="absolute inset-0 bg-[rgba(6,10,22,0.3)]" aria-label="Menü schließen" onclick={onClose} transition:fade={{ duration: ms(150) }}></button>
  <div
    class="menu absolute left-2 w-60 rounded-2xl p-1.5 text-white"
    style="top: calc(env(safe-area-inset-top) + 3.25rem)"
    transition:fly={{ y: -10, duration: ms(200), easing: cubicOut }}
    role="dialog"
    aria-label="Menü"
  >
    <div class="flex items-baseline justify-between gap-2 px-2.5 pb-2 pt-1.5">
      <span class="font-mono text-sm font-black tracking-[0.2em]">{view.code}</span>
      {#if client.myId}<span class="min-w-0 break-words text-right text-xs text-white/60">{playerName(view, client.myId)}</span>{/if}
    </div>
    <button class="item" onclick={toggleSound}>
      <span>Ton und Vibration</span>
      <span class="toggle {muted ? '' : 'toggle-on'}" aria-hidden="true"></span>
    </button>
    <button class="item" onclick={() => onGestures(!gestures)}>
      <span class="text-left">Nur Gesten<span class="block text-[0.65rem] font-medium text-white/50">Knöpfe ausblenden</span></span>
      <span class="toggle {gestures ? 'toggle-on' : ''}" aria-hidden="true"></span>
    </button>
    <p class="px-2.5 pb-1.5 pt-1 text-[0.65rem] leading-snug text-white/50">Gesten: wischen schiebt, tippen dreht, nach unten ziehen lässt fallen.</p>
    {#if client.isHost}
      <div class="flex justify-stretch px-1 pb-1 [&>button]:w-full">
        <EndCategoryButton {view} label="Rennen beenden" title="Das Rennen endet sofort, gewertet wird nach Höhe." />
      </div>
    {/if}
    <button class="item {confirming ? 'text-rose-300' : 'text-white/85'}" onclick={leave}>
      <span>{confirming ? 'Wirklich verlassen?' : 'Raum verlassen'}</span>
      <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true"><path d="M14 5h5v14h-5M10 8l-4 4 4 4M6 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  </div>
</div>

<style>
  .menu {
    background: rgba(14, 20, 38, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.1),
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
    background: rgba(255, 255, 255, 0.08);
  }
  .toggle {
    position: relative;
    width: 2.1rem;
    height: 1.25rem;
    flex-shrink: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
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
    background: #3ecf8e;
  }
  .toggle-on::after {
    transform: translateX(0.85rem);
  }
</style>
