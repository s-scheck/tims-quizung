<script lang="ts">
  import { untrack } from 'svelte';
  import type { DungeonRoundView, RoomView } from '@quiz/shared';
  import { figureById, type Pose } from '../../lib/avatar.ts';
  import Figure from '../avatar/Figure.svelte';
  import MiniHead from '../avatar/MiniHead.svelte';
  import { doorFormat, doorIcon, doorShort, ROOM_HUES } from './doorLabel.ts';
  import { archPath, archStones, doorCx, doorTop, floorPlates, sceneGeo, seeded, wallStones } from './dungeonArt.ts';
  import { DUNGEON_SUSPENSE_MS } from './dungeonFeedback.ts';
  import { DUNGEON_REVEAL_MS, dungeonAnimationStart, dungeonRevealAt, dungeonRevealOrder } from './dungeonTiming.ts';

  /**
   * Ein Raum des Dungeons: Quaderwand im Fackellicht, Bodenplatten in Perspektive, schwere Holztüren in Rundbögen
   * mit Schild darüber. Alles in echten Pixeln gezeichnet, daher passt es zu jedem Seitenverhältnis (`fill`).
   * Figuren stehen unten und laufen per Übergang zu ihrer Tür; bestätigt warten sie davor.
   * Im Ergebnis bleibt erst alles zu (Spannung), dann löst sich Spieler für Spieler auf: Tür auf, Licht, hindurch –
   * oder Tür knallt, Gitter fällt, zurückgestoßen. Lädt man mitten im Ergebnis neu, steht gleich der Endzustand da.
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
    fill = false,
    onPick,
  }: {
    view: RoomView;
    round: DungeonRoundView;
    roomIndex: number;
    meId?: string | null;
    interactive?: boolean;
    compact?: boolean;
    selected?: string | null;
    /** Füllt die Höhe des Elternelements statt fester Seitenverhältnisse (Handy ohne Scrollen). */
    fill?: boolean;
    onPick?: (doorId: string) => void;
  } = $props();

  const uid = `dg${Math.random().toString(36).slice(2, 8)}`;
  const doors = $derived(round.rooms[roomIndex] ?? []);
  const hue = $derived(ROOM_HUES[roomIndex % ROOM_HUES.length]!);
  const n = $derived(Math.max(1, doors.length));
  const mine = $derived(meId ? round.players[meId] : undefined);
  const lockedRaw = $derived(mine?.locked ?? []);

  let W = $state(0);
  let H = $state(0);
  const g = $derived(sceneGeo(W, H, n, compact));
  const stones = $derived(W > 0 ? wallStones(g, roomIndex + 1, compact) : []);
  const plates = $derived(W > 0 ? floorPlates(g, roomIndex + 1) : []);
  const torches = $derived(Array.from({ length: n + 1 }, (_, k) => ({ x: g.pad + k * g.slot, y: doorTop(g) + g.dh * 0.32 })));
  const motes = $derived.by(() => {
    const rnd = seeded(roomIndex * 31 + 5);
    return Array.from({ length: compact ? 5 : 11 }, () => ({ x: rnd(), y: rnd(), r: 0.6 + rnd() * 1.1, d: 7 + rnd() * 8, delay: -rnd() * 12 }));
  });

  // ------------------------------------------------------------ Ergebnis-Takt

  /** Lokale Startzeit der Ergebnis-Animation; null heißt: kein Ergebnis oder gleich Endzustand. */
  let t0 = $state<number | null>(null);
  let now = $state(Date.now());
  let seen: string | null = null;
  $effect(() => {
    const stage = round.stage;
    const rn = round.roundNo;
    const key = `${rn}:${stage}`;
    if (key === seen) return;
    const live = seen !== null && seen.startsWith(`${rn}:`) && stage === 'result';
    seen = key;
    untrack(() => {
      t0 = stage === 'result' ? dungeonAnimationStart(round, live) : null;
      now = Date.now();
    });
  });
  const order = $derived(round.stage === 'result' ? dungeonRevealOrder(round, roomIndex, meId) : []);
  const animEnd = $derived(dungeonRevealAt(Math.max(0, order.length - 1)) + DUNGEON_REVEAL_MS + 400);
  $effect(() => {
    const start = t0;
    const end = animEnd;
    if (start === null) return;
    const id = setInterval(() => {
      now = Date.now();
      if (now - start > end) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  });
  const elapsed = $derived(t0 === null ? Infinity : now - t0);
  const suspense = $derived(round.stage === 'result' && elapsed < DUNGEON_SUSPENSE_MS);

  type Phase = 'pending' | 'reveal' | 'done';
  /** Verriegelte Türen, wie man sie gerade sieht: die eben gescheiterte erst nach ihrer Auflösung (keine Vorwegnahme). */
  const locked = $derived.by(() => {
    const set = new Set(lockedRaw);
    const res = meId && round.stage === 'result' ? round.results?.[meId] : undefined;
    if (res && !res.correct && phaseOf(meId!) === 'pending') set.delete(res.doorId);
    return set;
  });
  function phaseOf(id: string): Phase {
    const k = order.indexOf(id);
    if (k < 0 || t0 === null) return 'done';
    const at = dungeonRevealAt(k);
    if (elapsed < at) return 'pending';
    return elapsed < at + DUNGEON_REVEAL_MS ? 'reveal' : 'done';
  }

  // ------------------------------------------------------------ Figuren

  /** In welchem Raum jemand gerade zu sehen ist: im Ergebnis noch dort, wo seine Tür war. */
  function sceneRoom(id: string): number | null {
    const res = round.stage === 'result' ? round.results?.[id] : undefined;
    if (res) return res.room;
    const p = round.players[id];
    if (!p || p.status === 'out') return null;
    return p.room;
  }

  interface Spot {
    id: string;
    x: number;
    y: number;
    pose: Pose;
    gone: boolean;
    dim: boolean;
    phase: Phase;
  }

  const doorIndex = (doorId: string | null | undefined) => (doorId ? doors.findIndex((d) => d.id === doorId) : -1);

  const spots = $derived.by((): Spot[] => {
    if (W === 0) return [];
    const ids = round.turnOrder.filter((id) => sceneRoom(id) === roomIndex);
    const atDoor = new Map<string, string[]>();
    for (const id of ids) {
      const res = round.stage === 'result' ? round.results?.[id] : undefined;
      const doorId = res?.doorId ?? round.walk[id]?.doorId ?? null;
      if (doorId) atDoor.set(doorId, [...(atDoor.get(doorId) ?? []), id]);
    }
    const floor = g.h - g.hy;
    return ids.map((id, k) => {
      const p = round.players[id];
      const res = round.stage === 'result' ? round.results?.[id] : undefined;
      const w = round.walk[id];
      const doorId = res?.doorId ?? w?.doorId ?? null;
      const i = doorIndex(doorId);
      const phase = res ? phaseOf(id) : 'done';
      const startX = ids.length === 1 ? g.w / 2 : g.w * (0.14 + (k / (ids.length - 1)) * 0.72);
      const start = { x: startX, y: g.front };
      if (p?.status === 'eliminated' && !res) return { id, ...start, pose: 'sad', gone: false, dim: true, phase };
      if (i < 0) return { id, ...start, pose: 'idle', gone: false, dim: round.skipped.includes(id), phase };
      const group = atDoor.get(doorId!) ?? [id];
      const offset = (group.indexOf(id) - (group.length - 1) / 2) * Math.min(g.dw / Math.max(group.length, 1), g.dw * 0.42);
      const x = doorCx(g, i) + offset;
      if (res && phase !== 'pending') {
        if (res.correct) return { id, x: doorCx(g, i), y: g.hy - g.dh * 0.06, pose: 'walk', gone: true, dim: false, phase };
        // Zurückgestoßen: ein Stück in den Raum, leicht zur Seite.
        return { id, x: x + (offset >= 0 ? 1 : -1) * g.dw * 0.25, y: g.hy + floor * 0.42, pose: 'sad', gone: false, dim: p?.status === 'eliminated', phase };
      }
      if (res || w?.confirmed) return { id, x, y: g.hy + floor * 0.03, pose: 'still', gone: false, dim: false, phase };
      return { id, x, y: g.hy + floor * 0.2, pose: 'idle', gone: false, dim: false, phase };
    });
  });

  // Laufen: Pose „walk“, solange sich das Ziel gerade geändert hat.
  let moving = $state<Record<string, number>>({});
  let lastKey: Record<string, string> = {};
  $effect(() => {
    const t = Date.now();
    const next: Record<string, number> = {};
    for (const s of spots) {
      const key = `${Math.round(s.x / Math.max(1, W) * 200)}:${Math.round(s.y / Math.max(1, H) * 200)}`;
      if (lastKey[s.id] !== undefined && lastKey[s.id] !== key) next[s.id] = t;
      lastKey[s.id] = key;
    }
    if (Object.keys(next).length === 0) return;
    untrack(() => (moving = { ...moving, ...next }));
    // Danach einmal neu zeichnen, damit die Pose wieder ruhig wird.
    const tm = setTimeout(() => (moving = { ...moving }), 950);
    return () => clearTimeout(tm);
  });
  const isMoving = (id: string) => (moving[id] ?? 0) > Date.now() - 900;

  /** Perspektive: Größe an der Tür bis vorn. */
  const sizeDoor = $derived(g.dh * 0.66);
  const sizeFront = $derived(Math.min(g.dh * 1.45, (g.h - g.hy) * 0.78, g.h * 0.34));
  const scaleAt = (y: number) => {
    const t = Math.min(1.1, Math.max(-0.1, (y - g.hy) / Math.max(1, g.front - g.hy)));
    return (sizeDoor + (sizeFront - sizeDoor) * t) / Math.max(1, sizeFront);
  };

  // ------------------------------------------------------------ Türzustand

  interface DoorState {
    open: boolean;
    gate: boolean;
    slam: boolean;
    tense: boolean;
  }

  const doorStates = $derived.by((): DoorState[] =>
    doors.map((door) => {
      const here = round.stage === 'result' ? order.filter((id) => round.results?.[id]?.doorId === door.id) : [];
      const res = (id: string) => round.results![id]!;
      // Bei mehreren an derselben Tür zählt die zuletzt aufgelöste: ein Falscher knallt sie wieder zu.
      const shown = here.filter((id) => phaseOf(id) !== 'pending');
      const latest = shown.length > 0 ? res(shown[shown.length - 1]!) : null;
      const open = !!latest?.correct;
      const wrongShown = shown.filter((id) => !res(id).correct);
      const gate = !open && (locked.has(door.id) || wrongShown.length > 0);
      const standing = here.length > 0 || round.turnOrder.some((id) => round.walk[id]?.doorId === door.id && round.walk[id]?.confirmed && sceneRoom(id) === roomIndex);
      return {
        open,
        gate,
        slam: wrongShown.some((id) => phaseOf(id) === 'reveal'),
        tense: suspense && standing,
      };
    }),
  );

  /** Spuren an der Tür ohne die Versuche, deren Auflösung noch aussteht (sonst verrät die Tür das Ergebnis). */
  function visibleTries(door: (typeof doors)[number]) {
    if (round.stage !== 'result') return door.tries;
    const hide = order.filter((id) => round.results?.[id]?.doorId === door.id && phaseOf(id) === 'pending');
    if (hide.length === 0) return door.tries;
    const out = [...door.tries];
    for (const id of hide) {
      const k = out.findLastIndex((t) => t.playerId === id);
      if (k >= 0) out.splice(k, 1);
    }
    return out;
  }

  function tryMark(t: { correct: boolean }): string {
    return t.correct ? 'ok' : 'bad';
  }
</script>


<div
  class="scene relative w-full select-none overflow-hidden {compact ? 'rounded-xl' : 'rounded-2xl'}"
  class:tense-all={suspense}
  style="{fill ? 'height: 100%' : `aspect-ratio: ${compact ? '1000 / 1000' : '1000 / 1120'}`}; --hue:{hue}"
  bind:clientWidth={W}
  bind:clientHeight={H}
>
  {#if W > 0 && H > 0}
    <svg class="absolute inset-0 h-full w-full" viewBox="0 0 {W} {H}" aria-hidden="true">
      <defs>
        <linearGradient id="{uid}-wallshade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgb(4 3 2 / 0.92)" />
          <stop offset={Math.max(0.05, (doorTop(g) - g.ph) / g.hy)} stop-color="rgb(4 3 2 / 0.45)" />
          <stop offset="0.9" stop-color="rgb(4 3 2 / 0.12)" />
          <stop offset="1" stop-color="rgb(0 0 0 / 0.55)" />
        </linearGradient>
        <linearGradient id="{uid}-floorshade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgb(0 0 0 / 0.7)" />
          <stop offset="0.35" stop-color="rgb(0 0 0 / 0.2)" />
          <stop offset="1" stop-color="rgb(0 0 0 / 0.5)" />
        </linearGradient>
        <radialGradient id="{uid}-torch">
          <stop offset="0" stop-color="hsl(38 100% 64% / 0.85)" />
          <stop offset="0.3" stop-color="hsl(30 95% 52% / 0.4)" />
          <stop offset="0.65" stop-color="hsl(24 90% 45% / 0.12)" />
          <stop offset="1" stop-color="hsl(22 90% 45% / 0)" />
        </radialGradient>
        <radialGradient id="{uid}-pool">
          <stop offset="0" stop-color="hsl(34 100% 60% / 0.3)" />
          <stop offset="1" stop-color="hsl(30 100% 50% / 0)" />
        </radialGradient>
        <radialGradient id="{uid}-flame" cx="0.5" cy="0.72" r="0.6">
          <stop offset="0" stop-color="#fffbe0" />
          <stop offset="0.3" stop-color="#ffd25a" />
          <stop offset="0.7" stop-color="#ff7a1a" />
          <stop offset="1" stop-color="rgb(255 70 0 / 0)" />
        </radialGradient>
        <linearGradient id="{uid}-wood" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#3b2312" />
          <stop offset="0.5" stop-color="#5a3519" />
          <stop offset="1" stop-color="#2e1b0d" />
        </linearGradient>
        <linearGradient id="{uid}-woodv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgb(255 210 150 / 0.16)" />
          <stop offset="0.5" stop-color="rgb(0 0 0 / 0)" />
          <stop offset="1" stop-color="rgb(0 0 0 / 0.45)" />
        </linearGradient>
        <linearGradient id="{uid}-iron" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#6b6e74" />
          <stop offset="1" stop-color="#25272b" />
        </linearGradient>
        <radialGradient id="{uid}-inside" cx="0.5" cy="0.95" r="0.9">
          <stop offset="0" stop-color="hsl({hue} 20% 10%)" />
          <stop offset="1" stop-color="#020101" />
        </radialGradient>
        <radialGradient id="{uid}-light" cx="0.5" cy="0.6" r="0.7">
          <stop offset="0" stop-color="#fff6d8" />
          <stop offset="0.5" stop-color="#ffd27a" />
          <stop offset="1" stop-color="#d9861f" />
        </radialGradient>
        <linearGradient id="{uid}-spill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="hsl(42 100% 75% / 0.42)" />
          <stop offset="1" stop-color="hsl(36 100% 60% / 0)" />
        </linearGradient>
        <radialGradient id="{uid}-vignette" cx="0.5" cy="0.55" r="0.75">
          <stop offset="0.5" stop-color="rgb(0 0 0 / 0)" />
          <stop offset="1" stop-color="rgb(0 0 0 / 0.72)" />
        </radialGradient>
        <filter id="{uid}-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={Math.max(1.5, g.dw * 0.18)} /></filter>
        {#each doors as _, i (i)}
          <clipPath id="{uid}-clip-{i}"><path d={archPath(doorCx(g, i), g.hy, g.dw, g.dh)} /></clipPath>
        {/each}
      </defs>

      <!-- Wand: Quader mit Kante oben hell, unten dunkel -->
      <rect width={W} height={g.hy} fill="hsl({hue} 10% 7%)" />
      <g>
        {#each stones as s, k (k)}
          {@const gap = Math.max(0.8, s.h * 0.07)}
          <rect x={s.x + gap} y={s.y + gap} width={Math.max(1, s.w - 2 * gap)} height={Math.max(1, s.h - 2 * gap)} rx={gap * 1.4} fill="hsl({hue} {7 + s.l * 9}% {13 + s.l * 13}%)" />
          <rect x={s.x + gap * 1.6} y={s.y + gap} width={Math.max(1, s.w - 3.2 * gap)} height={gap} fill="rgb(255 240 220 / {0.05 + s.l * 0.06})" />
          <rect x={s.x + gap} y={s.y + s.h - gap * 2} width={Math.max(1, s.w - 2 * gap)} height={gap} fill="rgb(0 0 0 / 0.35)" />
        {/each}
      </g>
      <!-- Fackellicht auf der Wand -->
      <g class="glow" style="mix-blend-mode: screen">
        {#each torches as t, k (k)}
          <ellipse cx={t.x} cy={t.y} rx={g.slot * 1.05} ry={g.dh * 1.1} fill="url(#{uid}-torch)" class="flicker" style="animation-delay:{-k * 0.53}s" />
        {/each}
      </g>
      <rect width={W} height={g.hy} fill="url(#{uid}-wallshade)" />

      <!-- Boden -->
      <rect y={g.hy} width={W} height={g.h - g.hy} fill="hsl({hue} 8% 9%)" />
      {#each plates as p, k (k)}
        <path d={p.d} fill="hsl({hue} {6 + p.l * 6}% {12 + p.l * 7}%)" stroke="rgb(0 0 0 / 0.55)" stroke-width={compact ? 0.8 : 1.4} stroke-linejoin="round" />
      {/each}
      <g style="mix-blend-mode: screen">
        {#each torches as t, k (k)}
          <ellipse cx={t.x} cy={g.hy + (g.h - g.hy) * 0.12} rx={g.slot * 0.8} ry={(g.h - g.hy) * 0.16} fill="url(#{uid}-pool)" class="flicker" style="animation-delay:{-k * 0.53}s" />
        {/each}
      </g>
      <rect y={g.hy} width={W} height={g.h - g.hy} fill="url(#{uid}-floorshade)" />
      <rect y={g.hy - 1} width={W} height={Math.max(2, (g.h - g.hy) * 0.035)} fill="rgb(0 0 0 / 0.55)" />

      <!-- Türen -->
      {#each doors as door, i (door.id)}
        {@const cx = doorCx(g, i)}
        {@const st = doorStates[i]!}
        {@const top = doorTop(g)}
        {@const l = cx - g.dw / 2}
        <!-- Licht aus der offenen Tür auf den Boden -->
        <path
          class="spill"
          class:on={st.open}
          d="M{l} {g.hy}L{l + g.dw} {g.hy}L{cx + g.dw * 1.25} {g.hy + (g.h - g.hy) * 0.55}L{cx - g.dw * 1.25} {g.hy + (g.h - g.hy) * 0.55}Z"
          fill="url(#{uid}-spill)"
          filter="url(#{uid}-soft)"
        />
        <g class:tense={st.tense} class:slam={st.slam} style="transform-origin: {cx}px {g.hy}px">
          <!-- Rahmen aus Bogensteinen -->
          <path d={archPath(cx, g.hy, g.dw + g.fw * 2.2, g.dh + g.fw * 1.1)} fill="rgb(0 0 0 / 0.5)" transform="translate(0 {g.fw * 0.3})" />
          {#each archStones(cx, g.hy, g.dw, g.dh, g.fw) as s, k (k)}
            <path d={s.d} fill="hsl({hue} 7% {27 - s.shade * 60}%)" stroke="rgb(0 0 0 / 0.6)" stroke-width={compact ? 0.6 : 1} />
          {/each}
          <!-- Öffnung: dunkel oder hell -->
          <path d={archPath(cx, g.hy, g.dw, g.dh)} fill="url(#{uid}-inside)" />
          <path class="inside-light" class:on={st.open} d={archPath(cx, g.hy, g.dw, g.dh)} fill="url(#{uid}-light)" />
          <!-- Türblatt -->
          <g clip-path="url(#{uid}-clip-{i})">
            <g class="leaf" class:open={st.open} style="transform-origin: {l}px {g.hy}px">
              <rect x={l} y={top} width={g.dw} height={g.dh} fill="url(#{uid}-wood)" />
              {#each [1, 2, 3] as b (b)}
                <rect x={l + (g.dw * b) / 4 - 0.6} y={top} width={compact ? 0.8 : 1.3} height={g.dh} fill="rgb(0 0 0 / 0.5)" />
              {/each}
              <rect x={l} y={top} width={g.dw} height={g.dh} fill="url(#{uid}-woodv)" />
              {#each [0.3, 0.78] as f (f)}
                <rect x={l} y={top + g.dh * f} width={g.dw} height={Math.max(1.5, g.dh * 0.055)} fill="url(#{uid}-iron)" />
                {#if !compact}
                  {#each [0.12, 0.38, 0.62, 0.88] as rx (rx)}
                    <circle cx={l + g.dw * rx} cy={top + g.dh * (f + 0.0275)} r={Math.max(0.8, g.dw * 0.025)} fill="#9a9ca0" />
                  {/each}
                {/if}
              {/each}
              <circle cx={l + g.dw * 0.78} cy={top + g.dh * 0.57} r={g.dw * 0.075} fill="none" stroke="#b49a63" stroke-width={Math.max(1, g.dw * 0.03)} />
              <rect x={l + g.dw * 0.73} y={top + g.dh * 0.46} width={g.dw * 0.1} height={g.dh * 0.06} rx={g.dw * 0.02} fill="#2a2420" />
            </g>
            <!-- Fallgitter -->
            <g class="gate" class:down={st.gate} style="--lift:{-g.dh * 1.05}px">
              {#each Array.from({ length: 5 }, (_, b) => b) as b (b)}
                {@const bx = l + (g.dw * (b + 0.5)) / 5}
                {@const bw = Math.max(1.2, g.dw * 0.055)}
                <path d="M{bx - bw / 2} {top}V{g.hy - g.dh * 0.05}L{bx} {g.hy}L{bx + bw / 2} {g.hy - g.dh * 0.05}V{top}Z" fill="url(#{uid}-iron)" stroke="rgb(0 0 0 / 0.6)" stroke-width="0.6" />
              {/each}
              {#each [0.28, 0.55, 0.8] as f (f)}
                <rect x={l} y={top + g.dh * f} width={g.dw} height={Math.max(1.2, g.dh * 0.04)} fill="url(#{uid}-iron)" stroke="rgb(0 0 0 / 0.5)" stroke-width="0.5" />
              {/each}
            </g>
          </g>
        </g>
        {#if selected === door.id}
          <path d={archPath(cx, g.hy, g.dw + g.fw * 2.6, g.dh + g.fw * 1.3)} fill="none" stroke="#fcd34d" stroke-width={compact ? 1.5 : 2.5} class="sel-ring" />
        {/if}
      {/each}

      <!-- Fackeln: Halter, Flamme, Glut -->
      {#each torches as t, k (k)}
        {@const s = Math.max(compact ? 2.4 : 3.4, g.dw * 0.085)}
        <path d="M{t.x - s * 0.9} {t.y + s * 2.6}L{t.x - s * 0.55} {t.y + s * 0.7}L{t.x + s * 0.55} {t.y + s * 0.7}L{t.x + s * 0.9} {t.y + s * 2.6}Z" fill="#3f3122" />
        <rect x={t.x - s * 1.1} y={t.y + s * 2.5} width={s * 2.2} height={s * 0.7} rx={s * 0.2} fill="#2b2d31" />
        <rect x={t.x - s * 0.4} y={t.y + s * 3.1} width={s * 0.8} height={s * 1.4} fill="#1d1e21" />
        <circle cx={t.x} cy={t.y - s * 0.4} r={s * 3.2} fill="url(#{uid}-torch)" class="flicker" style="animation-delay:{-k * 0.41}s" />
        <path
          class="flame"
          style="transform-origin: {t.x}px {t.y + s * 0.8}px; animation-delay:{-k * 0.29}s"
          d="M{t.x} {t.y - s * 2.4}C{t.x + s * 0.5} {t.y - s * 1.2} {t.x + s * 1.1} {t.y - s * 0.4} {t.x + s * 0.9} {t.y + s * 0.3}C{t.x + s * 0.7} {t.y + s * 0.9} {t.x - s * 0.7} {t.y + s * 0.9} {t.x - s * 0.9} {t.y + s * 0.3}C{t.x - s * 1.1} {t.y - s * 0.4} {t.x - s * 0.4} {t.y - s * 1.1} {t.x} {t.y - s * 2.4}Z"
          fill="url(#{uid}-flame)"
        />
        {#if !compact}
          {#each [0, 1] as e (e)}
            <circle class="ember" cx={t.x} cy={t.y - s} r={Math.max(0.7, s * 0.16)} fill="#ffb347" style="animation-delay:{-(k * 0.7 + e * 1.3)}s; --dx:{(e ? 1 : -1) * s * 1.5}px; --dy:{-g.dh * 0.45}px" />
          {/each}
        {/if}
      {/each}

      <!-- Staub im Licht -->
      {#each motes as m, k (k)}
        <circle class="mote" cx={m.x * W} cy={g.hy * 0.3 + m.y * (g.h - g.hy * 0.3) * 0.8} r={m.r * (compact ? 0.6 : 1)} fill="rgb(255 225 170 / 0.5)" style="animation-duration:{m.d}s; animation-delay:{m.delay}s" />
      {/each}

      <rect width={W} height={H} fill="url(#{uid}-vignette)" />
    </svg>

    <!-- Schilder über den Türen -->
    {#each doors as door, i (door.id)}
      {@const isLocked = locked.has(door.id)}
      {@const cx = doorCx(g, i)}
      <div
        class="plaque pointer-events-none absolute text-center leading-tight {selected === door.id ? 'sel' : ''}"
        class:dimmed={isLocked}
        style="left:{cx}px; top:{doorTop(g) - g.fw * 1.25}px; width:{Math.min(g.slot * 0.94, g.dw * (compact ? 1.5 : 1.75))}px; max-height:{g.ph}px"
      >
        <span class="block truncate font-black text-amber-100" style="font-size:{compact ? Math.max(6, Math.min(11, g.ph * 0.62)) : Math.max(9, Math.min(13, g.slot * 0.15))}px"
          ><span class="mr-0.5 opacity-70">{doorIcon(door)}</span>{doorShort(door)}</span
        >
        {#if !compact}
          <span class="block hyphens-auto break-words text-amber-200/75 {g.ph >= 48 ? 'line-clamp-2' : 'line-clamp-1'}" lang="de" style="font-size:{Math.max(8, Math.min(10.5, g.slot * 0.12))}px">{door.title}</span>
        {/if}
      </div>
      <!-- Spuren an der Tür: Kerben mit Kopf, wer durch ist und wer nicht -->
      {@const tries = visibleTries(door)}
      {#if tries.length > 0}
        {@const shown = tries.slice(-(compact ? 6 : 3))}
        <div
          class="tries pointer-events-none absolute flex items-center justify-center"
          class:compact
          style="left:{cx}px; top:{doorTop(g) - g.fw * 1.25 + (compact ? 1 : 3)}px; width:{g.slot * 0.96}px; gap:{compact ? 1 : 2}px"
        >
          {#each shown as t, k (k)}
            {@const parts = figureById(view, t.playerId)}
            <span class="mark {tryMark(t)}" title={t.correct ? 'geschafft' : 'gescheitert'}>
              {#if !compact && parts}<MiniHead {parts} size={Math.min(13, g.slot * 0.15)} />{/if}
              <i>{t.correct ? '✓' : '✗'}</i>
            </span>
          {/each}
          {#if tries.length > shown.length}<span class="more">+{tries.length - shown.length}</span>{/if}
        </div>
      {/if}
      {#if !compact}
        <button
          class="door absolute"
          style="left:{cx - g.dw / 2 - g.fw}px; top:{doorTop(g) - g.fw * 1.25 - g.ph}px; width:{g.dw + g.fw * 2}px; height:{g.dh + g.fw * 1.25 + g.ph}px"
          disabled={!interactive || isLocked}
          aria-label="{door.title}, {doorFormat(door)}{isLocked ? ', verschlossen' : ''}"
          onclick={() => onPick?.(door.id)}
        ></button>
      {/if}
    {/each}

    <!-- Figuren -->
    {#each spots as s (s.id)}
      {@const parts = figureById(view, s.id) ?? {}}
      <div
        class="walker pointer-events-none absolute"
        class:gone={s.gone}
        class:dim={s.dim}
        class:pushed={s.phase === 'reveal' && s.pose === 'sad'}
        style="left:{s.x}px; top:{s.y}px; z-index:{Math.round(s.y)}; transform: translate(-50%, -100%) scale({scaleAt(s.y) * (s.gone ? 0.82 : 1)})"
      >
        <Figure {parts} size={sizeFront} pose={isMoving(s.id) && s.pose !== 'sad' ? 'walk' : s.pose} seed={s.id.charCodeAt(0)} />
        {#if s.id === meId && !compact}
          <span class="me-tag absolute left-1/2 -translate-x-1/2 rounded-full bg-amber-300 px-1.5 font-black text-slate-900" style="top:{-Math.max(10, sizeFront * 0.1)}px; font-size:{Math.max(10, 10 / scaleAt(s.y))}px">Du</span>
        {/if}
      </div>
    {/each}

  {/if}
</div>

<style>
  .scene {
    background: hsl(var(--hue) 10% 7%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
    --flicker-speed: 2.3s;
  }
  .scene.tense-all {
    --flicker-speed: 0.7s;
  }
  .flicker {
    animation: flicker var(--flicker-speed) ease-in-out infinite;
  }
  @keyframes flicker {
    0%,
    100% {
      opacity: 0.85;
    }
    30% {
      opacity: 1;
    }
    52% {
      opacity: 0.68;
    }
    78% {
      opacity: 0.95;
    }
  }
  .flame {
    animation: flame 0.85s ease-in-out infinite alternate;
  }
  .tense-all .flame {
    animation-duration: 0.32s;
  }
  @keyframes flame {
    from {
      transform: scale(0.9, 0.96) skewX(-4deg);
    }
    to {
      transform: scale(1.06, 1.12) skewX(4deg);
    }
  }
  .ember {
    animation: ember 3.2s linear infinite;
    opacity: 0;
  }
  @keyframes ember {
    0% {
      transform: translate(0, 0);
      opacity: 0;
    }
    15% {
      opacity: 0.9;
    }
    100% {
      transform: translate(var(--dx), var(--dy));
      opacity: 0;
    }
  }
  .mote {
    animation: mote 10s ease-in-out infinite alternate;
  }
  @keyframes mote {
    0% {
      transform: translate(0, 0);
      opacity: 0.1;
    }
    50% {
      opacity: 0.7;
    }
    100% {
      transform: translate(14px, -22px);
      opacity: 0.15;
    }
  }
  .leaf {
    transition:
      transform 750ms cubic-bezier(0.3, 0.7, 0.25, 1),
      filter 750ms;
  }
  .leaf.open {
    transform: scaleX(0.14) skewY(-6deg);
    filter: brightness(0.5);
  }
  .inside-light,
  .spill {
    opacity: 0;
    transition: opacity 600ms 150ms;
  }
  .inside-light.on {
    opacity: 0.95;
  }
  .spill.on {
    opacity: 1;
  }
  .gate {
    transform: translateY(var(--lift));
    transition: transform 700ms cubic-bezier(0.4, 0, 0.6, 1);
  }
  .gate.down {
    transform: translateY(0);
    transition: transform 380ms cubic-bezier(0.55, 0, 0.75, 0.4);
  }
  .tense {
    animation: tense 0.18s linear infinite;
  }
  @keyframes tense {
    0%,
    100% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-0.6px, 0.3px) rotate(-0.25deg);
    }
    75% {
      transform: translate(0.6px, -0.2px) rotate(0.25deg);
    }
  }
  .slam {
    animation: slam 520ms cubic-bezier(0.3, 0.8, 0.3, 1.4) 300ms;
  }
  @keyframes slam {
    0%,
    100% {
      transform: none;
    }
    20% {
      transform: translate(-3px, 1px) rotate(-1.2deg);
    }
    45% {
      transform: translate(2.5px, 0) rotate(0.9deg);
    }
    70% {
      transform: translate(-1px, 0);
    }
  }
  .sel-ring {
    filter: drop-shadow(0 0 6px rgb(252 211 77 / 0.8));
  }
  .plaque {
    transform: translate(-50%, -100%);
    overflow: hidden;
    border-radius: 5px;
    padding: 2px 3px;
    background: linear-gradient(#3a2814, #20150a);
    border: 1px solid #8a6a32;
    box-shadow:
      0 2px 6px rgb(0 0 0 / 0.6),
      0 0 12px rgb(255 180 70 / 0.18),
      inset 0 1px 0 rgb(255 255 255 / 0.14);
    transition: opacity 300ms;
  }
  .plaque.sel {
    border-color: #fcd34d;
    box-shadow:
      0 0 0 1px #fcd34d,
      0 0 14px rgb(252 211 77 / 0.55);
  }
  .plaque.dimmed {
    opacity: 0.45;
  }
  .tries {
    transform: translateX(-50%);
  }
  .mark {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    border-radius: 999px;
    padding: 0 3px 0 1px;
    background: rgb(15 10 5 / 0.72);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.1);
    font-size: 9px;
    font-weight: 900;
    line-height: 14px;
  }
  .mark i {
    font-style: normal;
  }
  .mark.ok {
    color: #86efac;
  }
  .mark.bad {
    color: #fda4af;
  }
  .tries.compact .mark {
    padding: 0 1px;
    font-size: 6px;
    line-height: 7px;
  }
  .more {
    font-size: 9px;
    font-weight: 800;
    color: rgb(253 230 138 / 0.8);
  }
  .door {
    border-radius: 999px 999px 6px 6px / 30% 30% 6px 6px;
    background: transparent;
    -webkit-tap-highlight-color: transparent;
  }
  .door:not(:disabled) {
    cursor: pointer;
  }
  .door:focus-visible {
    outline: 2px solid #fcd34d;
    outline-offset: 2px;
  }
  .walker {
    transition:
      left 900ms cubic-bezier(0.45, 0.05, 0.4, 1),
      top 900ms cubic-bezier(0.45, 0.05, 0.4, 1),
      transform 900ms cubic-bezier(0.45, 0.05, 0.4, 1),
      opacity 450ms 650ms,
      filter 400ms;
    transform-origin: 50% 100%;
    filter: drop-shadow(0 6px 6px rgb(0 0 0 / 0.55));
  }
  .walker.pushed {
    transition:
      left 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) 260ms,
      top 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) 260ms,
      transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2) 260ms,
      filter 400ms;
  }
  .walker.gone {
    opacity: 0;
  }
  .walker.dim {
    filter: grayscale(1) brightness(0.55);
  }
  @media (prefers-reduced-motion: reduce) {
    .flame,
    .flicker,
    .ember,
    .mote,
    .tense,
    .slam {
      animation: none;
    }
    .walker,
    .leaf,
    .gate {
      transition: none;
    }
  }
</style>
