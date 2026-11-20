<script lang="ts" module>
  import type { TowerSpecial } from '@quiz/shared';
  import type { TickerItem } from './towerTicker.ts';

  /** Eine Meldung am Handy: ein Zauber trifft mich (`hit`) oder ein Eintrag aus dem Ticker. */
  export type TowerNoticeItem = { id: number; kind: 'hit'; at: number; by: string; special: TowerSpecial } | TickerItem;

  /** Wichtig für mich (kräftig, etwas länger): Treffer und meine Zauber. Alles andere läuft dezent. */
  export function noticeStrong(n: TowerNoticeItem, me: string | null): boolean {
    return n.kind === 'hit' || (n.kind === 'effect' && n.player === me);
  }
</script>

<script lang="ts">
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { TOWER_SPECIALS, type RoomView } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import { effectHint, GOLD, meters, ms, toneOf } from './towerStyle.ts';

  /**
   * Höchstens eine kurze, einzeilige Meldung über dem Spielfeld. Was mich betrifft, kommt kräftig mit farbiger
   * Kante, der Rest klein und blass. Die Zeile weicht dem fallenden Stein aus (`align`).
   */
  let { view, item, me, align = 'left' }: { view: RoomView; item: TowerNoticeItem; me: string | null; align?: 'left' | 'right' } = $props();

  const strong = $derived(noticeStrong(item, me));
  const edge = $derived(item.kind === 'hit' || item.kind === 'effect' ? toneOf(item.special).to : 'transparent');
  const name = (id: string) => playerName(view, id);
  const spell = (s: TowerSpecial) => TOWER_SPECIALS[s]?.name ?? s;
</script>

<div
  class="notice pointer-events-none flex max-w-full items-center gap-1.5 rounded-full py-[3px] pl-[3px] pr-2.5 text-white {strong ? 'notice-strong text-[0.74rem]' : 'text-[0.68rem]'}"
  style="--edge:{edge}; {align === 'right' ? 'margin-left:auto' : ''}"
  in:fly={{ y: -10, duration: ms(260), easing: cubicOut }}
  out:fade={{ duration: ms(200), easing: cubicIn }}
  role="status"
>
  {#if item.kind === 'hit'}
    <TowerBadge special={item.special} size={22} />
    <span class="min-w-0 break-words font-semibold">
      <b class="font-black" style="color:{toneOf(item.special).text}">{spell(item.special)}</b> von {name(item.by)}
      <span class="font-semibold text-white/60">· {effectHint(item.special)}</span>
    </span>
  {:else if item.kind === 'effect'}
    <TowerBadge special={item.special} size={strong ? 22 : 18} />
    <span class="min-w-0 break-words font-semibold">
      {#if item.player === me && item.target === me}<b class="font-black" style="color:{toneOf(item.special).text}">{spell(item.special)}</b> wirkt
      {:else if item.player === me}<b class="font-black" style="color:{toneOf(item.special).text}">{spell(item.special)}</b> trifft {name(item.target)}
      {:else if item.target === item.player}{name(item.player)} wirkt {spell(item.special)}
      {:else}{name(item.player)} → {name(item.target)}: {spell(item.special)}{/if}
    </span>
  {:else if item.kind === 'lead'}
    <svg viewBox="0 0 24 24" class="ml-1 h-3.5 w-3.5 shrink-0" aria-hidden="true"><path d="M3 18 5 7l4.5 4L12 4l2.5 7L19 7l2 11z" fill={GOLD} stroke="#a8740a" stroke-width="1.2" stroke-linejoin="round" /></svg>
    <span class="min-w-0 break-words font-semibold">{item.player === me ? 'Du führst' : `${name(item.player)} führt`}</span>
  {:else if item.kind === 'close'}
    <PlayerHead {view} id={item.player} size={18} />
    <span class="min-w-0 break-words font-semibold">{name(item.player)}: noch {meters(item.value)} m</span>
  {:else if item.kind === 'drop'}
    <PlayerHead {view} id={item.player} size={18} />
    <span class="min-w-0 break-words font-semibold">{name(item.player)} bricht ein <span class="font-black text-[#ff9aa9]">−{meters(item.value)} m</span></span>
  {:else if item.kind === 'mark'}
    <PlayerHead {view} id={item.player} size={18} />
    <span class="min-w-0 break-words font-semibold">{name(item.player)} knackt {item.value} m</span>
  {:else if item.kind === 'hold'}
    <PlayerHead {view} id={item.player} size={18} />
    <span class="min-w-0 break-words font-semibold">{name(item.player)} hält</span>
  {/if}
</div>

<style>
  .notice {
    width: fit-content;
    background: rgba(10, 16, 30, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .notice-strong {
    background: rgba(12, 14, 34, 0.78);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.14),
      0 0 0 1.5px var(--edge),
      0 6px 18px -8px var(--edge);
  }
</style>
