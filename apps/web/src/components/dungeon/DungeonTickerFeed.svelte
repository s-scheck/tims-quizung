<script lang="ts">
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import type { DungeonTickerItem } from './dungeonTicker.ts';

  /** Ereignis-Ticker am Fernseher: „Anna ist draußen – Platz 1!“, Schlüssel, berüchtigte Türen. Neueste oben. */
  let { view, items, head = 24 }: { view: RoomView; items: DungeonTickerItem[]; head?: number } = $props();

  const who = (id: string) => playerName(view, id);
  const tone: Record<DungeonTickerItem['kind'], string> = {
    exit: 'tone-gold',
    first: 'tone-amber',
    keyFound: 'tone-amber',
    keyUsed: 'tone-amber',
    eliminated: 'tone-red',
    doorFails: 'tone-red',
    allWrong: 'tone-red',
    dare: 'tone-stone',
  };
</script>

<ul class="flex flex-col gap-1.5 text-[0.95rem]">
  {#each items as it (it.id)}
    <li
      class="pill {tone[it.kind]} flex items-center gap-2 rounded-xl px-3 py-1.5 font-bold leading-tight"
      in:fly={{ x: 40, duration: 380, easing: cubicOut }}
      out:fade={{ duration: 300 }}
      animate:flip={{ duration: 260 }}
    >
      {#if it.kind === 'exit'}
        <span class="ico" aria-hidden="true">☀</span>
        <PlayerHead {view} id={it.player} size={head} />
        <span class="mw0">{who(it.player)} ist draußen – <span class="text-amber-200">Platz {it.place}!</span></span>
      {:else if it.kind === 'first'}
        <span class="ico" aria-hidden="true">➜</span>
        <PlayerHead {view} id={it.player} size={head} />
        <span class="mw0">{who(it.player)} geht in Führung – Raum {it.room + 1}</span>
      {:else if it.kind === 'keyFound'}
        <span class="ico" aria-hidden="true">🗝</span>
        <PlayerHead {view} id={it.player} size={head} />
        <span class="mw0">{who(it.player)} findet einen Schlüssel</span>
      {:else if it.kind === 'keyUsed'}
        <span class="ico" aria-hidden="true">🗝</span>
        <PlayerHead {view} id={it.player} size={head} />
        <span class="mw0">{who(it.player)} schließt „{it.door}“ mit Schlüssel auf</span>
      {:else if it.kind === 'eliminated'}
        <span class="ico" aria-hidden="true">✕</span>
        <PlayerHead {view} id={it.player} size={head} />
        <span class="mw0">{who(it.player)} sitzt fest – alle Türen zu</span>
      {:else if it.kind === 'doorFails'}
        <span class="ico" aria-hidden="true">⚠</span>
        <span class="mw0">Tür „{it.door}“: schon {it.fails} gescheitert</span>
      {:else if it.kind === 'allWrong'}
        <span class="ico" aria-hidden="true">✕</span>
        <span class="mw0">Alle {it.count} falsch – niemand kommt weiter</span>
      {:else if it.kind === 'dare'}
        <span class="ico" aria-hidden="true">⚔</span>
        <PlayerHead {view} id={it.player} size={head} />
        <span class="mw0">{who(it.player)} wagt „{it.door}“ – dort sind {it.fails} gescheitert</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  /* Statt min-w-0: Der Fernseher bricht Flex-Zeilen mit .min-w-0 sonst um (app.css). */
  .mw0 {
    min-width: 0;
  }
  .pill {
    background: linear-gradient(180deg, rgb(41 33 26 / 0.92), rgb(24 19 15 / 0.92));
    box-shadow:
      inset 0 0 0 1px rgb(255 255 255 / 0.07),
      0 6px 16px -10px rgb(0 0 0 / 0.8);
    color: #f1e7d6;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 1.5em;
    height: 1.5em;
    flex-shrink: 0;
    border-radius: 999px;
    font-size: 0.85em;
  }
  .tone-gold {
    box-shadow:
      inset 0 0 0 1px rgb(252 211 77 / 0.55),
      0 0 22px -8px rgb(252 211 77 / 0.6);
  }
  .tone-gold .ico {
    background: #fcd34d;
    color: #4a3000;
  }
  .tone-amber .ico {
    background: rgb(217 119 6 / 0.3);
    color: #fcd34d;
  }
  .tone-red .ico {
    background: rgb(225 29 72 / 0.25);
    color: #fda4af;
  }
  .tone-stone .ico {
    background: rgb(255 255 255 / 0.1);
    color: #e7dccb;
  }
</style>
