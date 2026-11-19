<script lang="ts">
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type RoomView } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import { genitive, GOLD, meters, ms, toneOf } from './towerStyle.ts';
  import type { TickerItem } from './towerTicker.ts';

  /**
   * Ereignis-Ticker: „Ben → Anna: Windstoß“, „Anna knackt 9 m“, Führungswechsel, Einstürze. Neueste oben.
   * `glass`: über dem Spielfeld am Handy (dunkles Glas), sonst in den Farben der App (Fernseher, Host).
   */
  let {
    view,
    items,
    me = null,
    glass = false,
    size = 'md',
  }: { view: RoomView; items: TickerItem[]; me?: string | null; glass?: boolean; size?: 'sm' | 'md' | 'lg' } = $props();

  const head = $derived(size === 'lg' ? 28 : size === 'md' ? 22 : 18);
  const who = (id: string) => (id === me ? 'Du' : playerName(view, id));
</script>

<ul class="flex flex-col gap-1.5 {size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-xs'}">
  {#each items as it (it.id)}
    <li
      class="pill flex items-center gap-2 rounded-full font-bold {glass ? 'pill-glass text-white' : 'border border-slate-800 bg-slate-900 text-slate-200'}
        {size === 'lg' ? 'px-4 py-2' : size === 'md' ? 'px-3 py-1.5' : 'px-2.5 py-1'}"
      in:fly={{ x: 48, duration: ms(380), easing: cubicOut }}
      out:fade={{ duration: ms(300) }}
      animate:flip={{ duration: ms(260) }}
    >
      {#if it.kind === 'effect' && it.blocked}
        <!-- „Annas Schild blockt Bens Windstoß“ -->
        <TowerBadge special="shield" size={Math.round(head * 0.95)} />
        <PlayerHead {view} id={it.target} size={head} />
        <span>
          {it.target === me ? 'Dein' : genitive(playerName(view, it.target))} Schild blockt
          {it.player === me ? 'deinen' : genitive(playerName(view, it.player))}
          <span class="font-black" style="color:{glass ? toneOf(it.special).text : toneOf(it.special).ink}">{TOWER_SPECIALS[it.special]?.name ?? it.special}</span>
        </span>
      {:else if it.kind === 'effect'}
        <PlayerHead {view} id={it.player} size={head} />
        <span class="whitespace-nowrap">{who(it.player)}</span>
        {#if it.target !== it.player}
          <svg viewBox="0 0 24 24" class="h-[1em] w-[1em] shrink-0 opacity-60" aria-hidden="true"><path d="M4 12h15m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <PlayerHead {view} id={it.target} size={head} />
          <span class="whitespace-nowrap">{who(it.target)}</span>
        {:else}
          <span class="opacity-70">{it.player === me ? 'wirkst' : 'wirkt'}</span>
        {/if}
        <span class="ml-auto flex items-center gap-1.5 whitespace-nowrap pl-1" style="color:{glass ? toneOf(it.special).text : toneOf(it.special).ink}">
          <TowerBadge special={it.special} size={Math.round(head * 0.95)} />{TOWER_SPECIALS[it.special]?.name ?? it.special}
        </span>
      {:else if it.kind === 'mark'}
        <PlayerHead {view} id={it.player} size={head} />
        <span>{who(it.player)} {it.player === me ? 'knackst' : 'knackt'} <span class="font-black">{it.value} m</span></span>
      {:else if it.kind === 'lead'}
        <svg viewBox="0 0 24 24" class="h-[1.15em] w-[1.15em] shrink-0" aria-hidden="true"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" fill={GOLD} stroke="#a8740a" stroke-width="1.2" stroke-linejoin="round" /></svg>
        <PlayerHead {view} id={it.player} size={head} />
        <span>{it.player === me ? 'Du führst!' : `${who(it.player)} übernimmt die Führung`}</span>
      {:else if it.kind === 'close'}
        <PlayerHead {view} id={it.player} size={head} />
        <span>{it.player === me ? 'Dir fehlen' : `${who(it.player)} fehlen`} nur noch <span class="font-black">{meters(it.value)} m</span></span>
      {:else if it.kind === 'hold'}
        <span class="dot h-2 w-2 shrink-0 rounded-full bg-[#3ee08f]"></span>
        <PlayerHead {view} id={it.player} size={head} />
        <span>{it.player === me ? 'Du hältst' : `${who(it.player)} hält`} über der Linie!</span>
      {:else if it.kind === 'drop'}
        <PlayerHead {view} id={it.player} size={head} />
        <span>{it.player === me ? 'Dein Turm' : `Turm von ${who(it.player)}`} bricht ein <span class="font-black {glass ? 'text-[#ff8a9b]' : 'text-rose-500'}">−{meters(it.value)} m</span></span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .pill {
    width: fit-content;
    max-width: 100%;
  }
  .pill-glass {
    background: rgba(10, 16, 30, 0.62);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.12),
      0 6px 18px -10px rgba(0, 0, 0, 0.6);
  }
  .dot {
    box-shadow: 0 0 0 0 rgba(62, 224, 143, 0.6);
    animation: dot 1s ease-out infinite;
  }
  @keyframes dot {
    to {
      box-shadow: 0 0 0 8px rgba(62, 224, 143, 0);
    }
  }
</style>
