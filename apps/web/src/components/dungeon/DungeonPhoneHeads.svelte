<script lang="ts" module>
  import type { DungeonRoundView } from '@quiz/shared';

  export type HeadBadge = 'ready' | 'busy' | 'right' | 'wrong' | 'out' | 'dead' | 'skip' | 'none';

  /** Kurzstatus eines Spielers für die Köpfe-Reihe: Abzeichen und Text fürs Antippen. */
  export function headStatus(round: DungeonRoundView, id: string, revealed = true): { badge: HeadBadge; text: string; waiting: boolean } {
    const p = round.players[id];
    if (!p) return { badge: 'none', text: 'nicht mehr da', waiting: false };
    const res = round.stage === 'result' ? round.results?.[id] : undefined;
    if (res) {
      if (!revealed) return { badge: 'busy', text: 'Tür öffnet sich …', waiting: false };
      if (res.key) return { badge: 'right', text: p.status === 'out' ? 'aufgeschlossen, draußen!' : `aufgeschlossen, weiter in Raum ${p.room + 1}`, waiting: false };
      if (res.correct) return { badge: 'right', text: p.status === 'out' ? 'richtig, draußen!' : `richtig, weiter in Raum ${p.room + 1}`, waiting: false };
      return { badge: 'wrong', text: p.status === 'eliminated' ? 'falsch, ausgeschieden' : res.foundKey ? 'falsch, hat einen Schlüssel gefunden' : 'falsch, Tür zu', waiting: false };
    }
    if (p.status === 'out') return { badge: 'out', text: `draußen nach ${p.exitRound} Fragerunden`, waiting: false };
    if (p.status === 'eliminated') return { badge: 'dead', text: `ausgeschieden in Raum ${p.room + 1}`, waiting: false };
    if (round.skipped.includes(id)) return { badge: 'skip', text: 'setzt diese Runde aus', waiting: false };
    if (round.stage === 'choosing') {
      const w = round.walk[id];
      if (w?.confirmed) return { badge: 'ready', text: `steht in der Tür · Raum ${p.room + 1}`, waiting: false };
      return { badge: 'busy', text: w?.doorId ? `geht zu einer Tür · Raum ${p.room + 1}` : `wählt eine Tür · Raum ${p.room + 1}`, waiting: true };
    }
    if (round.stage === 'answering') {
      if (round.answered.includes(id)) return { badge: 'ready', text: round.walk[id]?.key ? 'hat aufgeschlossen' : 'hat geantwortet', waiting: false };
      return { badge: 'busy', text: 'antwortet …', waiting: true };
    }
    return { badge: 'none', text: `Raum ${p.room + 1}`, waiting: false };
  }
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { RoomView } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import DungeonKeyIcon from './DungeonKeyIcon.svelte';

  /**
   * Kompakte Reihe Köpfe mit Status-Abzeichen (✓ bereit, … wählt, ✓/✗ Ergebnis). Antippen zeigt Name und Status,
   * dem Host zusätzlich „Ohne X weiter“, wenn auf ihn gewartet wird.
   */
  let {
    view,
    round,
    me = null,
    ids,
    revealed = true,
    canSkip = false,
    onSkip,
    size = 26,
  }: {
    view: RoomView;
    round: DungeonRoundView;
    me?: string | null;
    ids: string[];
    /** Im Ergebnis: Spannung vorbei, richtig/falsch darf sichtbar sein. */
    revealed?: boolean;
    canSkip?: boolean;
    onSkip?: (id: string) => void;
    size?: number;
  } = $props();

  let open = $state<string | null>(null);
  const openStatus = $derived(open ? headStatus(round, open, revealed) : null);
  $effect(() => {
    if (!open) return;
    const t = setTimeout(() => (open = null), 3500);
    return () => clearTimeout(t);
  });
</script>

<div class="relative">
  <div class="row flex items-center gap-1.5 overflow-x-auto px-1 py-1">
    {#each ids as id (id)}
      {@const st = headStatus(round, id, revealed)}
      {@const p = round.players[id]}
      <button
        class="head relative grid shrink-0 place-items-center rounded-full {id === me ? 'head-me' : ''} {st.badge === 'dead' || st.badge === 'skip' ? 'opacity-45' : ''}"
        style="width:{size + 6}px; height:{size + 6}px"
        aria-label="{playerName(view, id)}: {st.text}"
        onclick={() => (open = open === id ? null : id)}
      >
        <PlayerHead {view} {id} size={size} />
        {#if p?.key}
          <span class="absolute -left-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#2a1d08] text-[#ffd36b] ring-1 ring-[#ffd36b]/60"><DungeonKeyIcon size={10} /></span>
        {/if}
        {#if st.badge !== 'none'}
          <span class="badge-{st.badge} absolute -bottom-0.5 -right-1 grid h-[15px] min-w-[15px] place-items-center rounded-full px-[2px] text-[9px] font-black leading-none">
            {#if st.badge === 'ready' || st.badge === 'right'}
              <svg viewBox="0 0 12 12" class="h-2 w-2" aria-hidden="true"><path d="M2 6.5l2.6 2.5L10 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            {:else if st.badge === 'wrong' || st.badge === 'dead'}
              <svg viewBox="0 0 12 12" class="h-2 w-2" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
            {:else if st.badge === 'busy'}
              <span class="dots"><i></i><i></i><i></i></span>
            {:else if st.badge === 'out'}
              <svg viewBox="0 0 12 12" class="h-2 w-2" aria-hidden="true"><path d="M2 11V5.5a4 4 0 0 1 8 0V11z" fill="currentColor" /></svg>
            {:else}
              –
            {/if}
          </span>
        {/if}
      </button>
    {/each}
  </div>

  {#if open && openStatus}
    <div class="tip absolute left-1/2 top-full z-30 mt-1.5 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl px-3 py-2 text-center" transition:fade={{ duration: 120 }}>
      <p class="text-[0.8rem] font-black text-amber-50">{playerName(view, open)}{open === me ? ' (du)' : ''}</p>
      <p class="text-[0.72rem] font-semibold text-amber-50/65">{openStatus.text}</p>
      {#if canSkip && openStatus.waiting}
        <button class="skip mt-1.5 rounded-lg px-2.5 py-1 text-[0.72rem] font-extrabold" onclick={() => { onSkip?.(open!); open = null; }}>Ohne {playerName(view, open)} weiter</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .row {
    justify-content: safe center;
    scrollbar-width: none;
  }
  .row::-webkit-scrollbar {
    display: none;
  }
  .head {
    background: rgba(18, 14, 10, 0.55);
    box-shadow: inset 0 0 0 1px rgba(255, 226, 170, 0.12);
    -webkit-tap-highlight-color: transparent;
  }
  .head-me {
    box-shadow: inset 0 0 0 1.5px rgba(246, 196, 83, 0.85);
  }
  .badge-ready,
  .badge-right {
    background: #34d399;
    color: #052e1c;
  }
  .badge-wrong {
    background: #fb7185;
    color: #3b0612;
  }
  .badge-dead,
  .badge-skip {
    background: #3a332b;
    color: #c8bba5;
  }
  .badge-busy {
    background: #3a332b;
    color: #f6e7c8;
  }
  .badge-out {
    background: #f6c453;
    color: #3a2604;
  }
  .dots {
    display: flex;
    gap: 1px;
  }
  .dots i {
    width: 2.5px;
    height: 2.5px;
    border-radius: 99px;
    background: currentColor;
    animation: dot 1.2s ease-in-out infinite;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes dot {
    0%,
    100% {
      opacity: 0.35;
    }
    40% {
      opacity: 1;
    }
  }
  .tip {
    background: rgba(24, 19, 14, 0.96);
    box-shadow:
      inset 0 0 0 1px rgba(255, 226, 170, 0.16),
      0 12px 28px -12px rgba(0, 0, 0, 0.9);
  }
  .skip {
    background: rgba(246, 196, 83, 0.16);
    color: #ffd36b;
    box-shadow: inset 0 0 0 1px rgba(246, 196, 83, 0.4);
  }
</style>
