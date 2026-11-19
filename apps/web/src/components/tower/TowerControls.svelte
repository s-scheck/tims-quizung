<script lang="ts" module>
  /** Gesten auf der Spielfläche: wischen links/rechts schiebt, tippen dreht, nach unten wischen und halten beschleunigt. */
  export function towerGestures(node: HTMLElement, handlers: { move: (dir: -1 | 1) => void; rotate: () => void; fast: (on: boolean) => void }) {
    const STEP = 24;
    let g: { id: number; x: number; y: number; t: number; lastX: number; moved: boolean; fast: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (g) return;
      node.setPointerCapture(e.pointerId);
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), lastX: e.clientX, moved: false, fast: false };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.lastX;
      if (!g.fast && Math.abs(dx) >= STEP) {
        const steps = Math.trunc(dx / STEP);
        for (let i = 0; i < Math.abs(steps); i++) handlers.move(steps > 0 ? 1 : -1);
        g.lastX += steps * STEP;
        g.moved = true;
      }
      const dy = e.clientY - g.y;
      if (!g.fast && dy > 36 && dy > Math.abs(e.clientX - g.x) * 1.2) {
        g.fast = true;
        g.moved = true;
        handlers.fast(true);
      }
    };
    const up = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.fast) handlers.fast(false);
      else if (!g.moved && performance.now() - g.t < 350 && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 14) handlers.rotate();
      g = null;
    };
    const cancel = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.fast) handlers.fast(false);
      g = null;
    };
    node.style.touchAction = 'none';
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', cancel);
    return {
      update(next: typeof handlers) {
        handlers = next;
      },
      destroy() {
        node.removeEventListener('pointerdown', down);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', cancel);
      },
    };
  }
</script>

<script lang="ts">
  import { specialTargetsOthers, TOWER_SPECIALS, type RoomView, type TowerSpecial } from '@quiz/shared';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerIcon from './TowerIcon.svelte';
  import { formatMeters } from './towerDraw.ts';

  /**
   * Steuerung am Handy: große Knöpfe ◀ ▶ ⟳ ▼ (Schieben wiederholt beim Halten, ▼ beschleunigt solange gedrückt)
   * und die Spezial-Taste. Störer brauchen ein Ziel: Köpfe der Mitspieler, der Führende ist vorausgewählt.
   */
  let {
    view,
    stock,
    targets,
    disabled = false,
    onMove,
    onRotate,
    onFast,
    onUse,
  }: {
    view: RoomView;
    stock: TowerSpecial | null;
    /** Mögliche Ziele mit Höhe, der Führende zuerst. */
    targets: { id: string; height: number }[];
    disabled?: boolean;
    onMove: (dir: -1 | 1) => void;
    onRotate: () => void;
    onFast: (on: boolean) => void;
    onUse: (special: TowerSpecial, targetId?: string) => void;
  } = $props();

  // ---------------------------------------------------- Halten = wiederholen

  let repeat: ReturnType<typeof setTimeout> | null = null;
  function hold(dir: -1 | 1, e: PointerEvent) {
    if (disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    stopHold();
    onMove(dir);
    const again = (delay: number) => {
      repeat = setTimeout(() => {
        onMove(dir);
        again(75);
      }, delay);
    };
    again(230);
  }
  function stopHold() {
    if (repeat) clearTimeout(repeat);
    repeat = null;
  }

  let fastOn = $state(false);
  function fast(on: boolean) {
    if (fastOn === on) return;
    fastOn = on;
    onFast(on);
  }

  // ---------------------------------------------------------- Spezial

  let picking = $state(false);
  let chosen = $state<string | null>(null);
  const info = $derived(stock ? TOWER_SPECIALS[stock] : null);

  function useClick() {
    if (!stock || disabled) return;
    if (!specialTargetsOthers(stock)) {
      onUse(stock);
      return;
    }
    if (targets.length === 0) return;
    chosen = targets[0]!.id;
    picking = true;
  }

  function confirm() {
    if (!stock || !chosen) return;
    onUse(stock, chosen);
    picking = false;
  }

  $effect(() => {
    if (!stock) picking = false;
  });
</script>

<div class="relative">
  {#if picking && stock && info}
    <div class="absolute inset-x-0 bottom-full z-20 mb-2 rounded-3xl border border-slate-700 bg-slate-950/95 p-3 shadow-xl backdrop-blur">
      <p class="flex items-center gap-2 text-sm font-bold">
        <TowerIcon special={stock} size={18} class="text-sky-400" />
        {info.name} gegen wen?
      </p>
      <p class="mb-2 text-xs text-slate-500">{info.hint}</p>
      <div class="flex flex-wrap gap-2">
        {#each targets as t, i (t.id)}
          <button
            class="flex min-w-[5.5rem] flex-1 flex-col items-center gap-1 rounded-2xl border-2 px-2 py-2 transition
              {chosen === t.id ? 'border-sky-500 bg-sky-500/15' : 'border-slate-800'}"
            onclick={() => (chosen = t.id)}
          >
            <PlayerHead {view} id={t.id} size={40} />
            <span class="max-w-full truncate text-sm font-bold">{playerName(view, t.id)}</span>
            <span class="text-xs text-slate-500">{formatMeters(t.height)} m{i === 0 ? ' · vorne' : ''}</span>
          </button>
        {/each}
      </div>
      <div class="mt-3 flex gap-2">
        <button class="btn-ghost flex-1" onclick={() => (picking = false)}>Abbrechen</button>
        <button class="btn-primary flex-[2]" disabled={!chosen} onclick={confirm}>Einsetzen</button>
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-[1fr_1fr_1fr_1fr_1.15fr] gap-2 select-none">
    <button class="ctl" aria-label="nach links" {disabled} onpointerdown={(e) => hold(-1, e)} onpointerup={stopHold} onpointercancel={stopHold} onlostpointercapture={stopHold}>
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="ctl" aria-label="nach rechts" {disabled} onpointerdown={(e) => hold(1, e)} onpointerup={stopHold} onpointercancel={stopHold} onlostpointercapture={stopHold}>
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="ctl" aria-label="drehen" {disabled} onpointerdown={() => !disabled && onRotate()}>
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button
      class="ctl {fastOn ? 'ctl-on' : ''}"
      aria-label="schneller fallen"
      {disabled}
      onpointerdown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        fast(true);
      }}
      onpointerup={() => fast(false)}
      onpointercancel={() => fast(false)}
      onlostpointercapture={() => fast(false)}
    >
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M6 7l6 6 6-6M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button
      class="ctl flex-col gap-0.5 {stock ? 'ctl-special' : 'opacity-50'}"
      aria-label="Spezial einsetzen"
      disabled={!stock || disabled}
      onclick={useClick}
    >
      {#if stock && info}
        <TowerIcon special={stock} size={24} />
        <span class="text-[0.65rem] font-black leading-none">{info.name}</span>
      {:else}
        <svg viewBox="0 0 24 24" class="h-6 w-6"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
        <span class="text-[0.6rem] font-bold leading-none">leer</span>
      {/if}
    </button>
  </div>
</div>

<style>
  .ctl {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 4rem;
    border-radius: 1.25rem;
    background: linear-gradient(180deg, #ffffff, #eef2f7);
    color: #27324a;
    border: 1px solid rgba(30, 50, 90, 0.12);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 4px 0 rgba(30, 50, 90, 0.14),
      0 8px 18px -10px rgba(30, 50, 90, 0.35);
    transition: transform 80ms ease, box-shadow 80ms ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
  }
  .ctl:active:not(:disabled),
  .ctl-on {
    transform: translateY(3px);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 1px 0 rgba(30, 50, 90, 0.14);
  }
  .ctl-special {
    background: linear-gradient(180deg, #ffe6a3, #ffc542);
    color: #4a3200;
    border-color: rgba(160, 100, 0, 0.35);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.8) inset,
      0 4px 0 #d39a12,
      0 0 22px -4px rgba(255, 190, 40, 0.8);
    animation: tower-ready 1.6s ease-in-out infinite;
  }
  @keyframes tower-ready {
    0%,
    100% {
      filter: brightness(1);
    }
    50% {
      filter: brightness(1.08);
    }
  }
</style>
