<script lang="ts">
  import { untrack } from 'svelte';
  import type { DungeonRoundView, RoomView } from '@quiz/shared';
  import { figureById, type Pose } from '../../lib/avatar.ts';
  import Figure from '../avatar/Figure.svelte';
  import { doorFormat, doorIcon, doorShort, ROOM_HUES } from './doorLabel.ts';

  /**
   * Ein Raum des Dungeons in Schrägsicht: Steinwand mit Fackeln und schweren Holztüren, Steinboden in Perspektive.
   * Die Figuren stehen unten und laufen per Übergang zu ihrer Tür; bestätigt stehen sie in der Öffnung.
   * Im Ergebnis gehen die Richtigen durch die Tür, bei den Falschen schlägt sie zu.
   * `compact` ist die kleine Kachel für den Fernseher: nur Format auf dem Schild, keine Eingabe.
   */
  let {
    view,
    round,
    roomIndex,
    meId = null,
    interactive = false,
    compact = false,
    selected = null,
    onPick,
  }: {
    view: RoomView;
    round: DungeonRoundView;
    roomIndex: number;
    meId?: string | null;
    interactive?: boolean;
    compact?: boolean;
    selected?: string | null;
    onPick?: (doorId: string) => void;
  } = $props();

  const doors = $derived(round.rooms[roomIndex] ?? []);
  const hue = $derived(ROOM_HUES[roomIndex % ROOM_HUES.length]!);
  const n = $derived(Math.max(1, doors.length));
  const locked = $derived(new Set(meId ? (round.players[meId]?.locked ?? []) : []));
  let height = $state(0);

  /** In welchem Raum jemand gerade zu sehen ist: im Ergebnis noch dort, wo seine Tür war. */
  function sceneRoom(id: string): number | null {
    const res = round.stage === 'result' ? round.results?.[id] : undefined;
    if (res) return res.room;
    const p = round.players[id];
    if (!p || p.status === 'out') return null;
    return p.room;
  }

  const doorX = (i: number) => 8 + ((i + 0.5) / n) * 84;
  const doorW = $derived((84 / n) * (compact ? 0.78 : 0.7));

  interface Spot {
    id: string;
    x: number;
    y: number;
    pose: Pose;
    gone: boolean;
    dim: boolean;
  }

  const spots = $derived.by((): Spot[] => {
    const ids = round.turnOrder.filter((id) => sceneRoom(id) === roomIndex);
    const atDoor = new Map<string, string[]>();
    for (const id of ids) {
      const res = round.stage === 'result' ? round.results?.[id] : undefined;
      const doorId = res?.doorId ?? round.walk[id]?.doorId ?? null;
      if (doorId) atDoor.set(doorId, [...(atDoor.get(doorId) ?? []), id]);
    }
    return ids.map((id, k) => {
      const p = round.players[id];
      const res = round.stage === 'result' ? round.results?.[id] : undefined;
      const w = round.walk[id];
      const doorId = res?.doorId ?? w?.doorId ?? null;
      const i = doorId ? doors.findIndex((d) => d.id === doorId) : -1;
      const startX = ids.length === 1 ? 50 : 18 + (k / (ids.length - 1)) * 64;
      const start = { x: startX, y: compact ? 88 : 86 };
      if (res && !res.correct) return { id, ...start, pose: 'sad', gone: false, dim: p?.status === 'eliminated' };
      if (p?.status === 'eliminated') return { id, ...start, pose: 'sad', gone: false, dim: true };
      if (i < 0) return { id, ...start, pose: 'idle', gone: false, dim: round.skipped.includes(id) };
      const group = atDoor.get(doorId!) ?? [id];
      const offset = (group.indexOf(id) - (group.length - 1) / 2) * Math.min(doorW / Math.max(group.length, 1), 5);
      if (res?.correct) return { id, x: doorX(i) + offset, y: 34, pose: 'walk', gone: true, dim: false };
      if (w?.confirmed) return { id, x: doorX(i) + offset, y: 40, pose: 'still', gone: false, dim: false };
      return { id, x: doorX(i) + offset, y: 50, pose: 'idle', gone: false, dim: false };
    });
  });

  // Laufen: Pose „walk“, solange sich das Ziel gerade geändert hat.
  let moving = $state<Record<string, number>>({});
  let lastKey: Record<string, string> = {};
  $effect(() => {
    const now = Date.now();
    const next: Record<string, number> = {};
    for (const s of spots) {
      const key = `${s.x.toFixed(1)}:${s.y}`;
      if (lastKey[s.id] !== undefined && lastKey[s.id] !== key) next[s.id] = now;
      lastKey[s.id] = key;
    }
    if (Object.keys(next).length === 0) return;
    untrack(() => (moving = { ...moving, ...next }));
    // Danach einmal neu zeichnen, damit die Pose wieder ruhig wird.
    setTimeout(() => (moving = { ...moving }), 950);
  });
  const isMoving = (id: string) => (moving[id] ?? 0) > Date.now() - 900;

  /** Perspektive: weiter hinten kleiner. */
  const scaleAt = (y: number) => 0.45 + ((y - 34) / (86 - 34)) * 0.55;
  const baseSize = $derived(height * (compact ? 0.24 : 0.22));

  const openDoors = $derived(
    new Set(
      spots.filter((s) => s.pose === 'still' || s.gone).map((s) => {
        const res = round.results?.[s.id];
        return res?.doorId ?? round.walk[s.id]?.doorId ?? '';
      }),
    ),
  );
  const slammed = $derived(new Set(round.stage === 'result' ? Object.values(round.results ?? {}).filter((r) => !r.correct && r.room === roomIndex).map((r) => r.doorId) : []));
  const torches = $derived(Array.from({ length: n + 1 }, (_, i) => 8 + (i / n) * 84));
</script>

<div class="scene relative w-full select-none overflow-hidden {compact ? 'rounded-xl' : 'rounded-2xl'}" style="aspect-ratio: {compact ? '1000 / 1000' : '1000 / 1120'}; --hue:{hue}" bind:clientHeight={height}>
  <!-- Hintergrund: Wand, Boden, Fackeln -->
  <svg class="absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="dg-wall-{roomIndex}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="hsl({hue} 14% 9%)" />
        <stop offset="1" stop-color="hsl({hue} 16% 21%)" />
      </linearGradient>
      <linearGradient id="dg-floor-{roomIndex}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="hsl({hue} 12% 15%)" />
        <stop offset="1" stop-color="hsl({hue} 10% 27%)" />
      </linearGradient>
      <pattern id="dg-bricks-{roomIndex}" width="120" height="60" patternUnits="userSpaceOnUse">
        <path d="M0 0H120M0 30H120M0 0V30M60 30V60" fill="none" stroke="rgb(0 0 0 / 0.45)" stroke-width="4" />
        <path d="M4 4H56M64 34H116" stroke="rgb(255 255 255 / 0.05)" stroke-width="3" />
      </pattern>
      <radialGradient id="dg-glow-{roomIndex}">
        <stop offset="0" stop-color="hsl(38 100% 62% / 0.55)" />
        <stop offset="1" stop-color="hsl(38 100% 50% / 0)" />
      </radialGradient>
      <radialGradient id="dg-vignette-{roomIndex}" cx="0.5" cy="0.55" r="0.75">
        <stop offset="0.55" stop-color="rgb(0 0 0 / 0)" />
        <stop offset="1" stop-color="rgb(0 0 0 / 0.65)" />
      </radialGradient>
    </defs>
    <rect width="1000" height="420" fill="url(#dg-wall-{roomIndex})" />
    <rect width="1000" height="420" fill="url(#dg-bricks-{roomIndex})" />
    <!-- Boden in Perspektive mit Fugen zum Fluchtpunkt -->
    <polygon points="0,420 1000,420 1000,1000 0,1000" fill="url(#dg-floor-{roomIndex})" />
    <g stroke="rgb(0 0 0 / 0.38)" stroke-width="4">
      {#each Array.from({ length: 13 }, (_, i) => i) as i (i)}
        <line x1={500 + (i - 6) * 95} y1="420" x2={500 + (i - 6) * 260} y2="1000" />
      {/each}
      {#each [470, 540, 630, 745, 885] as y (y)}<line x1="0" y1={y} x2="1000" y2={y} />{/each}
    </g>
    <rect y="412" width="1000" height="26" fill="rgb(0 0 0 / 0.45)" />
    {#each torches as tx, i (i)}
      <ellipse cx={tx * 10} cy="560" rx="150" ry="60" fill="url(#dg-glow-{roomIndex})" class="flicker" style="animation-delay:{-i * 0.37}s" />
      <circle cx={tx * 10} cy="150" r="130" fill="url(#dg-glow-{roomIndex})" class="flicker" style="animation-delay:{-i * 0.37}s" />
    {/each}
    <rect width="1000" height="1000" fill="url(#dg-vignette-{roomIndex})" />
  </svg>

  <!-- Fackeln (HTML, damit sie zwischen den Türen sauber sitzen) -->
  {#each torches as tx, i (i)}
    <div class="pointer-events-none absolute" style="left:{tx}%; top:{compact ? 11 : 10}%; transform: translateX(-50%); width:{compact ? 1.6 : 2.2}%">
      <div class="flame" style="animation-delay:{-i * 0.29}s"></div>
      <div class="mx-auto h-[1.4em] w-[45%] rounded-b bg-gradient-to-b from-stone-500 to-stone-800" style="font-size:{compact ? 6 : 9}px"></div>
    </div>
  {/each}

  <!-- Türen mit Schild -->
  {#each doors as door, i (door.id)}
    {@const isLocked = locked.has(door.id)}
    {@const open = openDoors.has(door.id)}
    {@const isSel = selected === door.id}
    <div class="absolute" style="left:{doorX(i)}%; top:{compact ? 3 : 2}%; width:{Math.min(doorW * 1.3, 84 / n - 1)}%; transform: translateX(-50%)">
      <div
        class="plaque mx-auto mb-[6%] rounded-md px-1 text-center leading-tight {isSel ? 'ring-2 ring-amber-300' : ''}"
        class:opacity-40={isLocked}
      >
        <span class="block truncate font-black text-amber-100" style="font-size:{compact ? 'clamp(6px, 0.8vw, 11px)' : 'clamp(8px, 2.8vw, 13px)'}"><span class="mr-0.5 opacity-70">{doorIcon(door)}</span>{doorShort(door)}</span>
        {#if !compact}
          <span class="line-clamp-2 block hyphens-auto break-words text-amber-200/75" lang="de" style="font-size: clamp(7px, 2.2vw, 10px)">{door.title}</span>
        {/if}
      </div>
    </div>
    <button
      class="door absolute {isSel ? 'selected' : ''} {slammed.has(door.id) ? 'slam' : ''}"
      style="left:{doorX(i)}%; top:{compact ? 17 : 17}%; height:{compact ? 25 : 25}%; width:{doorW}%; transform: translateX(-50%)"
      disabled={!interactive || isLocked}
      aria-label="{door.title}, {doorFormat(door)}{isLocked ? ', verschlossen' : ''}"
      onclick={() => onPick?.(door.id)}
    >
      <div class="frame">
        <div class="opening"></div>
        <div class="leaf" class:open>
          <span class="band" style="top:22%"></span>
          <span class="band" style="top:68%"></span>
          <span class="ring"></span>
        </div>
      </div>
      {#if isLocked}
        <div class="bars"><span></span><span></span></div>
      {/if}
    </button>
  {/each}

  <!-- Figuren -->
  {#if baseSize > 0}
    {#each spots as s (s.id)}
      {@const parts = figureById(view, s.id) ?? {}}
      <div
        class="walker pointer-events-none absolute"
        class:gone={s.gone}
        class:dim={s.dim}
        style="left:{s.x}%; top:{s.y}%; z-index:{Math.round(s.y)}; transform: translate(-50%, -100%) scale({scaleAt(s.y) * (s.gone ? 0.8 : 1)})"
      >
        <Figure {parts} size={baseSize} pose={isMoving(s.id) && s.pose !== 'sad' ? 'walk' : s.pose} seed={s.id.charCodeAt(0)} />
        {#if s.id === meId && !compact}
          <span class="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-1.5 text-[10px] font-black text-slate-900">Du</span>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .scene {
    background: hsl(var(--hue) 12% 10%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
  }
  .flicker {
    animation: flicker 2.3s ease-in-out infinite;
  }
  @keyframes flicker {
    0%,
    100% {
      opacity: 0.85;
    }
    35% {
      opacity: 1;
    }
    55% {
      opacity: 0.7;
    }
    80% {
      opacity: 0.95;
    }
  }
  .flame {
    margin: 0 auto;
    width: 70%;
    aspect-ratio: 1 / 1.6;
    border-radius: 50% 50% 45% 45% / 62% 62% 38% 38%;
    background: radial-gradient(circle at 50% 70%, #fff7c2 0 18%, #ffcf4d 35%, #ff7a1a 65%, rgb(255 80 0 / 0) 72%);
    filter: drop-shadow(0 0 6px rgb(255 160 40 / 0.9));
    transform-origin: 50% 90%;
    animation: flame 0.9s ease-in-out infinite alternate;
  }
  @keyframes flame {
    from {
      transform: scale(0.92, 1) rotate(-3deg);
    }
    to {
      transform: scale(1.06, 1.12) rotate(3deg);
    }
  }
  .plaque {
    background: linear-gradient(#3a2a18, #24180c);
    border: 1px solid #7a5a2a;
    box-shadow:
      0 0 10px rgb(255 190 80 / 0.25),
      inset 0 1px 0 rgb(255 255 255 / 0.12);
    padding-top: 2px;
    padding-bottom: 2px;
  }
  .door {
    perspective: 400px;
    transition: filter 200ms;
  }
  .door:not(:disabled) {
    cursor: pointer;
  }
  .door:not(:disabled):hover .leaf,
  .door.selected .leaf {
    filter: brightness(1.25);
  }
  .door.selected .frame {
    box-shadow:
      0 0 0 3px #fcd34d,
      0 0 24px rgb(252 211 77 / 0.6);
  }
  .frame {
    position: absolute;
    inset: 0;
    border-radius: 999px 999px 4px 4px / 40% 40% 4px 4px;
    background: linear-gradient(#5b5b5b, #3a3a3a);
    padding: 7%;
    box-shadow:
      0 6px 14px rgb(0 0 0 / 0.6),
      inset 0 2px 0 rgb(255 255 255 / 0.15);
  }
  .opening {
    position: absolute;
    inset: 7%;
    border-radius: inherit;
    background: radial-gradient(ellipse at 50% 85%, rgb(255 200 120 / 0.35), #050403 70%);
  }
  .leaf {
    position: absolute;
    inset: 7%;
    border-radius: 999px 999px 2px 2px / 40% 40% 2px 2px;
    background:
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.28) 0 2px, transparent 2px 22%),
      linear-gradient(180deg, #7a4a22, #4e2c12);
    box-shadow: inset 0 0 12px rgb(0 0 0 / 0.55);
    transform-origin: 0% 50%;
    transition: transform 650ms cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  .leaf.open {
    transform: rotateY(-72deg);
  }
  .band {
    position: absolute;
    left: 0;
    right: 0;
    height: 7%;
    background: linear-gradient(#5c6066, #2a2c30);
    box-shadow: 0 1px 0 rgb(0 0 0 / 0.5);
  }
  .ring {
    position: absolute;
    right: 14%;
    top: 50%;
    width: 16%;
    aspect-ratio: 1;
    border-radius: 999px;
    border: 2px solid #b8a272;
  }
  .bars {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14%;
    background: rgb(0 0 0 / 0.35);
    border-radius: 999px 999px 4px 4px / 40% 40% 4px 4px;
  }
  .bars span {
    display: block;
    height: 9%;
    margin: 0 -4%;
    background: linear-gradient(#8b8f96, #3d4046);
    box-shadow: 0 2px 4px rgb(0 0 0 / 0.6);
    transform: rotate(-12deg);
  }
  .bars span + span {
    transform: rotate(12deg);
  }
  .slam {
    animation: slam 520ms cubic-bezier(0.3, 0.8, 0.3, 1.4);
  }
  @keyframes slam {
    0% {
      transform: translateX(-50%);
    }
    20% {
      transform: translateX(calc(-50% - 5px)) rotate(-2deg);
    }
    45% {
      transform: translateX(calc(-50% + 4px)) rotate(1.5deg);
    }
    70% {
      transform: translateX(calc(-50% - 2px));
    }
    100% {
      transform: translateX(-50%);
    }
  }
  .walker {
    transition:
      left 900ms cubic-bezier(0.45, 0.05, 0.4, 1),
      top 900ms cubic-bezier(0.45, 0.05, 0.4, 1),
      transform 900ms cubic-bezier(0.45, 0.05, 0.4, 1),
      opacity 500ms 700ms;
    transform-origin: 50% 100%;
    filter: drop-shadow(0 6px 6px rgb(0 0 0 / 0.55));
  }
  .walker.gone {
    opacity: 0;
  }
  .walker.dim {
    filter: grayscale(1) brightness(0.6);
  }
  @media (prefers-reduced-motion: reduce) {
    .flame,
    .flicker,
    .slam {
      animation: none;
    }
  }
</style>
