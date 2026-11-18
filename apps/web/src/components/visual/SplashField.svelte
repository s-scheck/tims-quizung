<script lang="ts">
  import { AIM_MAX_DEG, blobFor, CANNON, obstaclesAt, windLevel, type Point, type SplashBlobView } from '@quiz/shared';
  import { FrameClock } from '../../lib/frameClock.svelte.ts';
  import type { FigureParts, Pose } from '../../lib/avatar.ts';
  import Figure from '../avatar/Figure.svelte';
  import Countdown from './Countdown.svelte';

  /**
   * Spielfeld von oben: Quadrat mit Farbflecken, Kanone unten mittig mit der Figur des Schützen daneben,
   * fliegende Kugel mit Schatten im Bogen, pendelnde Hindernisse und Wind. Alles läuft nach Serverzeit,
   * damit Handy und Fernseher dasselbe zeigen. Was über den Rand hinausgeht, ist abgeschnitten wie in der Zählung.
   */
  let {
    blobs,
    colorOf,
    startedAt,
    obstacles = 0,
    wind = null,
    shooter = null,
    aim = null,
    countdownUntil = null,
    class: className = '',
    style = undefined,
  }: {
    blobs: SplashBlobView[];
    colorOf: (playerId: string) => string;
    startedAt: number;
    obstacles?: number;
    wind?: Point | null;
    shooter?: { parts: FigureParts; pose: Pose } | null;
    /** Laufender Richtungswert 0 bis 1 beim Zielen, dreht das Rohr. */
    aim?: number | null;
    countdownUntil?: number | null;
    class?: string;
    style?: string;
  } = $props();

  const clock = new FrameClock();
  $effect(() => clock.start());
  const now = $derived(clock.now);

  // Ansicht: Feld 0..1000, darunter Platz für Kanone und Figur.
  const VB = { x: -80, y: -60, w: 1160, h: 1420 };
  const U = 1000;
  let height = $state(0);

  const shapes = new Map<number, string>();
  function shapeOf(b: SplashBlobView): string {
    let d = shapes.get(b.id);
    if (!d) {
      d = blobFor(b.seed, b.landing)
        .polygons.map((poly) => `M${poly.map((p) => `${(p.x * U).toFixed(1)},${(p.y * U).toFixed(1)}`).join('L')}Z`)
        .join('');
      shapes.set(b.id, d);
    }
    return d;
  }

  const landed = $derived(blobs.filter((b) => b.landAt <= now));
  const flying = $derived(blobs.filter((b) => b.firedAt <= now && now < b.landAt));
  const misses = $derived(blobs.filter((b) => !b.onField && b.landAt <= now && now - b.landAt < 2500));
  const bars = $derived(obstacles > 0 ? obstaclesAt(obstacles, now - startedAt) : []);

  /** Lage der Kugel: Bodenpunkt und Höhe im Bogen, mit Abprall als zweitem, flacherem Bogen. */
  function ball(b: SplashBlobView): { x: number; y: number; h: number } {
    const s = Math.min(1, Math.max(0, (now - b.firedAt) / (b.landAt - b.firedAt)));
    const [p0, p1, p2] = b.path as [Point, Point, Point | undefined];
    let a = p0;
    let c = p1;
    let t = s;
    let arc = 0.28;
    if (b.bounceAt !== null && p2) {
      if (s < b.bounceAt) t = s / b.bounceAt;
      else {
        a = p1;
        c = p2;
        t = (s - b.bounceAt) / (1 - b.bounceAt);
        arc = 0.12;
      }
    }
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, h: Math.sin(Math.PI * t) * arc * len };
  }

  const barrelDeg = $derived(aim === null ? 0 : (aim - 0.5) * 2 * AIM_MAX_DEG);
  const windDeg = $derived(wind ? (Math.atan2(wind.y, wind.x) * 180) / Math.PI : 0);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // Figur links neben der Kanone, Füße unten im Bild.
  const figureSize = $derived(height * (300 / VB.h));
</script>

<div class="relative {className}" style="aspect-ratio:{VB.w}/{VB.h}; {style ?? ''}" bind:clientHeight={height}>
  <svg class="absolute inset-0 h-full w-full" viewBox="{VB.x} {VB.y} {VB.w} {VB.h}" aria-label="Spielfeld">
    <defs>
      <clipPath id="splash-field"><rect x="0" y="0" width={U} height={U} rx="24" /></clipPath>
      <pattern id="splash-grid" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M100 0H0V100" fill="none" stroke="rgb(0 0 0 / 0.05)" stroke-width="3" />
      </pattern>
    </defs>

    <rect x="0" y="0" width={U} height={U} rx="24" fill="#f6f1e4" stroke="#d8cdb0" stroke-width="8" />
    <rect x="0" y="0" width={U} height={U} rx="24" fill="url(#splash-grid)" />

    <g clip-path="url(#splash-field)">
      {#each landed as b (b.id)}
        <path class="blob" d={shapeOf(b)} fill={colorOf(b.owner)} />
      {/each}
    </g>

    {#each misses as b (b.id)}
      <g class="miss" transform="translate({clamp(b.landing.x * U, VB.x + 110, VB.x + VB.w - 110)} {clamp(b.landing.y * U, VB.y + 80, 1000)})">
        <circle r="26" fill={colorOf(b.owner)} opacity="0.5" />
        <text y="-36" text-anchor="middle" font-size="40" font-weight="900" fill="#ff4b4b">daneben</text>
      </g>
    {/each}

    {#each bars as o, i (i)}
      <rect x={(o.x - o.w / 2) * U} y={(o.y - o.h / 2) * U} width={o.w * U} height={o.h * U} rx="10" fill="#8b5a2b" stroke="#5c3a1a" stroke-width="5" />
      <rect x={(o.x - o.w / 2) * U + 12} y={(o.y - o.h / 2) * U + 7} width={o.w * U - 24} height="6" rx="3" fill="rgb(255 255 255 / 0.25)" />
    {/each}

    {#if wind}
      {@const level = windLevel(wind)}
      <g transform="translate(960 -8)">
        <text x="-80" y="12" text-anchor="end" font-size="38" font-weight="800" fill="#8f8f8f">Wind {'●'.repeat(level)}</text>
        <circle r="46" fill="rgb(28 176 246 / 0.12)" />
        <g transform="rotate({windDeg})">
          <line x1="-34" y1="0" x2="12" y2="0" stroke="#1cb0f6" stroke-width={6 + level * 4} stroke-linecap="round" />
          <path d="M10 -20 L40 0 L10 20 Z" fill="#1cb0f6" />
        </g>
      </g>
    {/if}

    <!-- Kanone -->
    <g transform="translate({CANNON.x * U} {CANNON.y * U})">
      <g transform="rotate({barrelDeg})" style="transition: transform 80ms linear">
        <rect x="-26" y="-110" width="52" height="120" rx="16" fill="#3b3b3b" stroke="#1f1f1f" stroke-width="6" />
        <rect x="-32" y="-118" width="64" height="24" rx="10" fill="#555" stroke="#1f1f1f" stroke-width="6" />
      </g>
      <circle cx="-48" cy="24" r="30" fill="#6b4226" stroke="#1f1f1f" stroke-width="6" />
      <circle cx="48" cy="24" r="30" fill="#6b4226" stroke="#1f1f1f" stroke-width="6" />
      <rect x="-60" y="0" width="120" height="34" rx="12" fill="#4b4b4b" stroke="#1f1f1f" stroke-width="6" />
    </g>

    {#each flying as b (b.id)}
      {@const p = ball(b)}
      <ellipse cx={p.x * U} cy={p.y * U} rx={22 - p.h * 30} ry={10 - p.h * 14} fill="rgb(0 0 0 / 0.25)" />
      <circle cx={p.x * U} cy={(p.y - p.h) * U} r={20 + p.h * 60} fill={colorOf(b.owner)} stroke="#ffffff" stroke-width="6" />
    {/each}
  </svg>

  {#if shooter && figureSize > 0}
    <div class="pointer-events-none absolute" style="left:{((CANNON.x - 0.2 - VB.x / U) / (VB.w / U)) * 100}%; bottom:0; transform: translateX(-50%)">
      <Figure parts={shooter.parts} size={figureSize} pose={shooter.pose} />
    </div>
  {/if}

  {#if countdownUntil !== null}
    <Countdown until={countdownUntil} {now} />
  {/if}
</div>

<style>
  .blob {
    transform-box: fill-box;
    transform-origin: center;
    animation: splat 420ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
  }
  @keyframes splat {
    from {
      transform: scale(0.2);
      opacity: 0.4;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .miss {
    animation: fade 2500ms ease-out both;
  }
  @keyframes fade {
    0%,
    60% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .blob {
      animation: none;
    }
  }
</style>
