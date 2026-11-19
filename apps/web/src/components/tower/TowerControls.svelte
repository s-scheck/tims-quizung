<script lang="ts" module>
  import { wakeTowerAudio } from './towerFeedback.ts';

  /** Auto-Repeat wie in Profi-Stapelspielen: erster Schritt sofort, nach `DAS_MS` alle `ARR_MS` ein weiterer. */
  export const DAS_MS = 165;
  export const ARR_MS = 45;

  export interface TowerHandlers {
    move: (dir: -1 | 1) => void;
    rotate: () => void;
    fast: (on: boolean) => void;
  }

  /**
   * Halten von links/rechts mit Auto-Repeat. Mehrere Quellen (Knopf, Taste) dürfen gleichzeitig halten; es gilt
   * die zuletzt gedrückte Richtung, beim Loslassen übernimmt die andere wieder (ohne erneute Verzögerung).
   */
  export function createRepeater(move: () => (dir: -1 | 1) => void) {
    const held: { dir: -1 | 1; src: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let onChange: (dirs: Set<number>) => void = () => {};
    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const run = (dir: -1 | 1, delay: number) => {
      stopTimer();
      timer = setTimeout(function again() {
        move()(dir);
        timer = setTimeout(again, ARR_MS);
      }, delay);
    };
    const notify = () => onChange(new Set(held.map((h) => h.dir)));
    return {
      press(dir: -1 | 1, src: string) {
        if (held.some((h) => h.src === src && h.dir === dir)) return;
        held.push({ dir, src });
        move()(dir);
        run(dir, DAS_MS);
        notify();
      },
      release(dir: -1 | 1, src: string) {
        const i = held.findIndex((h) => h.src === src && h.dir === dir);
        if (i < 0) return;
        const wasActive = i === held.length - 1;
        held.splice(i, 1);
        if (held.length === 0) stopTimer();
        else if (wasActive) run(held[held.length - 1]!.dir, ARR_MS);
        notify();
      },
      releaseAll() {
        held.length = 0;
        stopTimer();
        notify();
      },
      watch(fn: (dirs: Set<number>) => void) {
        onChange = fn;
      },
    };
  }

  /**
   * Gesten auf der Spielfläche. Der Stein folgt dem Finger 1:1 (eine halbe Einheit je halbe Zellbreite auf dem
   * Bildschirm), nach unten ziehen und halten beschleunigt, Tippen oder kurz nach oben wischen dreht.
   * Erst nach einem kleinen Totbereich entscheidet sich die Richtung: Wischen dreht nie versehentlich.
   * `worldWidth` ist die sichtbare Breite in Steineinheiten (wie bei `TowerCanvas`).
   */
  export function towerGestures(node: HTMLElement, handlers: TowerHandlers & { worldWidth?: number }) {
    const SLOP = 10;
    const TAP_MS = 280;
    type Mode = 'none' | 'drag' | 'fast' | 'up';
    let g: { id: number; x0: number; y0: number; t: number; anchor: number; mode: Mode } | null = null;
    const step = () => Math.max(10, node.clientWidth / (handlers.worldWidth ?? 13) / 2);
    const down = (e: PointerEvent) => {
      wakeTowerAudio();
      if (g) return;
      node.setPointerCapture?.(e.pointerId);
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now(), anchor: e.clientX, mode: 'none' };
    };
    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (g.mode === 'none' && Math.hypot(dx, dy) > SLOP) {
        if (dy > 0 && dy > Math.abs(dx) * 1.2) {
          g.mode = 'fast';
          handlers.fast(true);
        } else if (dy < 0 && -dy > Math.abs(dx) * 1.5) g.mode = 'up';
        else g.mode = 'drag';
      }
      if (g.mode === 'drag') {
        const s = step();
        while (e.clientX - g.anchor >= s) {
          handlers.move(1);
          g.anchor += s;
        }
        while (g.anchor - e.clientX >= s) {
          handlers.move(-1);
          g.anchor -= s;
        }
      }
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'fast') handlers.fast(false);
      else if (!cancelled && (g.mode === 'up' || (g.mode === 'none' && performance.now() - g.t < TAP_MS))) handlers.rotate();
      g = null;
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
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
  import { onDestroy, untrack } from 'svelte';

  /**
   * Steuerung am Handy: große Knöpfe ◀ ▶ ⟳ ▼ (Schieben mit Auto-Repeat beim Halten, ▼ beschleunigt solange
   * gedrückt) und die Zauber-Taste. Am Rechner dieselbe Steuerung über die Tastatur: Pfeile oder A/D schieben,
   * Hoch/W/Leertaste dreht, Runter/S beschleunigt. Dunkle Zauber brauchen ein Ziel: Köpfe der Mitspieler,
   * der Führende ist vorausgewählt.
   */
  let {
    disabled = false,
    onMove,
    onRotate,
    onFast,
  }: {
    disabled?: boolean;
    onMove: (dir: -1 | 1) => void;
    onRotate: () => void;
    onFast: (on: boolean) => void;
  } = $props();

  // ---------------------------------------------------- Halten = wiederholen

  const repeater = createRepeater(() => onMove);
  let heldDirs = $state(new Set<number>());
  repeater.watch((dirs) => (heldDirs = dirs));
  onDestroy(() => repeater.releaseAll());

  function press(dir: -1 | 1, e: PointerEvent) {
    wakeTowerAudio();
    if (disabled) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    repeater.press(dir, `p${e.pointerId}`);
  }
  function release(dir: -1 | 1, e: PointerEvent) {
    repeater.release(dir, `p${e.pointerId}`);
  }

  // Schnell fallen: Knopf und Taste dürfen sich überlappen.
  const fastBy = new Set<string>();
  let fastOn = $state(false);
  function fast(on: boolean, src: string) {
    if (on && disabled) return;
    if (on) fastBy.add(src);
    else fastBy.delete(src);
    const now = fastBy.size > 0;
    if (now === fastOn) return;
    fastOn = now;
    onFast(now);
  }

  function rotate() {
    wakeTowerAudio();
    if (!disabled) onRotate();
  }

  // Gesperrt (Runde vorbei): alles Gehaltene loslassen.
  $effect(() => {
    if (disabled) untrack(onBlur);
  });

  // ---------------------------------------------------------- Tastatur

  const KEY_DIR: Record<string, -1 | 1> = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 };
  const typing = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  };

  function onKeyDown(e: KeyboardEvent) {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const dir = KEY_DIR[e.key];
    if (dir !== undefined) {
      e.preventDefault();
      wakeTowerAudio();
      // Eigenes Auto-Repeat statt der Wiederholung des Systems.
      if (!e.repeat && !disabled) repeater.press(dir, `k${e.key.toLowerCase()}`);
    } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) rotate();
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      wakeTowerAudio();
      fast(true, 'key');
    }
  }
  function onKeyUp(e: KeyboardEvent) {
    const dir = KEY_DIR[e.key];
    if (dir !== undefined) repeater.release(dir, `k${e.key.toLowerCase()}`);
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') fast(false, 'key');
  }
  function onBlur() {
    repeater.releaseAll();
    fastBy.clear();
    if (fastOn) {
      fastOn = false;
      onFast(false);
    }
  }

</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} onblur={onBlur} />

<div class="relative">
  <div class="grid grid-cols-4 gap-2 select-none">
    <button
      class="ctl {heldDirs.has(-1) ? 'ctl-on' : ''}"
      aria-label="nach links"
      {disabled}
      onpointerdown={(e) => press(-1, e)}
      onpointerup={(e) => release(-1, e)}
      onpointercancel={(e) => release(-1, e)}
      onlostpointercapture={(e) => release(-1, e)}
      oncontextmenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button
      class="ctl {heldDirs.has(1) ? 'ctl-on' : ''}"
      aria-label="nach rechts"
      {disabled}
      onpointerdown={(e) => press(1, e)}
      onpointerup={(e) => release(1, e)}
      onpointercancel={(e) => release(1, e)}
      onlostpointercapture={(e) => release(1, e)}
      oncontextmenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="ctl" aria-label="drehen" {disabled} onpointerdown={rotate} oncontextmenu={(e) => e.preventDefault()}>
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button
      class="ctl {fastOn ? 'ctl-on' : ''}"
      aria-label="schneller fallen"
      {disabled}
      onpointerdown={(e) => {
        wakeTowerAudio();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        fast(true, `p${e.pointerId}`);
      }}
      onpointerup={(e) => fast(false, `p${e.pointerId}`)}
      onpointercancel={(e) => fast(false, `p${e.pointerId}`)}
      onlostpointercapture={(e) => fast(false, `p${e.pointerId}`)}
      oncontextmenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 24 24" class="h-7 w-7"><path d="M6 7l6 6 6-6M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
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
    transition: transform 70ms ease, box-shadow 70ms ease;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
    touch-action: none;
  }
  .ctl:active:not(:disabled),
  .ctl-on {
    transform: translateY(3px);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.9) inset,
      0 1px 0 rgba(30, 50, 90, 0.14);
  }
</style>
