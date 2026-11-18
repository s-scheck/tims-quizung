<script lang="ts">
  import {
    AIM_MAX_DEG,
    aimToTarget,
    blobFor,
    CANNON,
    obstaclesAt,
    RANGE_MAX,
    RANGE_MIN,
    SPLASH_AFTER_LAND_MS,
    SPLASH_BASE_AREA,
    seededRandom,
    windLevel,
    type Point,
    type SplashBlobView,
  } from '@quiz/shared';
  import { FrameClock } from '../../lib/frameClock.svelte.ts';
  import type { FigureParts, Pose } from '../../lib/avatar.ts';
  import Figure from '../avatar/Figure.svelte';
  import Countdown from './Countdown.svelte';

  /**
   * Spielfeld von oben: Platz mit Farbflecken, Feldkanone unten mittig mit der Figur des Schützen daneben,
   * Kraftanzeige rechts im Maßstab der Weite, Fadenkreuz beim Zielen, Kugel mit Schatten im Bogen,
   * pendelnde Hindernisse und Wind. Alles läuft nach Serverzeit, damit Handy und Fernseher dasselbe zeigen.
   * Was über den Rand hinausgeht, ist abgeschnitten wie in der Zählung.
   */
  let {
    blobs,
    colorOf,
    startedAt,
    obstacles = 0,
    wind = null,
    shooter = null,
    aiming = null,
    countdownUntil = null,
    class: className = '',
    style = undefined,
  }: {
    blobs: SplashBlobView[];
    colorOf: (playerId: string) => string;
    startedAt: number;
    obstacles?: number;
    wind?: Point | null;
    shooter?: { id: string; parts: FigureParts; pose: Pose } | null;
    /** Laufendes Zielen: Kraft 0 bis 1, Richtung 0 bis 1 oder null, solange die Kraft noch läuft. */
    aiming?: { power: number; aim: number | null } | null;
    countdownUntil?: number | null;
    class?: string;
    style?: string;
  } = $props();

  const clock = new FrameClock();
  $effect(() => clock.start());
  const now = $derived(clock.now);

  // Ansicht: Feld 0..1000, darüber Platz für Überschießen, rechts die Kraftanzeige, unten Kanone und Figur.
  const U = 1000;
  const VB = { x: -90, y: -170, w: 1250, h: 1470 };
  const C = { x: CANNON.x * U, y: CANNON.y * U };
  const GAUGE = { x: 1050, w: 46 };
  /** Höhe der Kraftanzeige: dieselbe Weite wie geradeaus aufs Feld. */
  const gaugeY = (p: number) => C.y - (RANGE_MIN + p * (RANGE_MAX - RANGE_MIN)) * U;
  const SPLASH_R = Math.sqrt(SPLASH_BASE_AREA / Math.PI) * U;
  let height = $state(0);

  // ------------------------------------------------------------ Flecken

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

  /** Spritzer beim Aufprall: Richtung, Weite und Größe je Fleck fest. */
  const drops = new Map<number, { a: number; d: number; r: number }[]>();
  function dropsOf(b: SplashBlobView) {
    let list = drops.get(b.id);
    if (!list) {
      const rnd = seededRandom(b.seed ^ 0x5eed);
      list = Array.from({ length: 9 }, (_, i) => ({ a: ((i + rnd() * 0.8) / 9) * Math.PI * 2, d: 90 + rnd() * 110, r: 6 + rnd() * 9 }));
      drops.set(b.id, list);
    }
    return list;
  }

  const landed = $derived(blobs.filter((b) => b.landAt <= now));
  const flying = $derived(blobs.filter((b) => b.firedAt <= now && now < b.landAt));
  const impacts = $derived(blobs.filter((b) => b.landAt <= now && now - b.landAt < 650));
  const misses = $derived(blobs.filter((b) => !b.onField && b.landAt <= now && now - b.landAt < 2500));
  const bars = $derived(obstacles > 0 ? obstaclesAt(obstacles, now - startedAt) : []);
  const latest = $derived(blobs.length > 0 ? blobs[blobs.length - 1]! : null);

  // ------------------------------------------------------------- Kugel

  const easeOut = (t: number) => 1 - (1 - t) ** 3;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  /** Lage der Kugel zur Zeit `at`: Bodenpunkt und Höhe im Wurfbogen, Abprall als zweiter, flacher Bogen. */
  function ballAt(b: SplashBlobView, at: number): { x: number; y: number; h: number } {
    const s = clamp((at - b.firedAt) / (b.landAt - b.firedAt), 0, 1);
    const [p0, p1, p2] = b.path as [Point, Point, Point | undefined];
    let a = p0;
    let c = p1;
    let t = s;
    let arc = 0.32;
    if (b.bounceAt !== null && p2) {
      if (s < b.bounceAt) t = s / b.bounceAt;
      else {
        a = p1;
        c = p2;
        t = (s - b.bounceAt) / (1 - b.bounceAt);
        arc = 0.14;
      }
    }
    const len = Math.hypot(c.x - a.x, c.y - a.y);
    return { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t, h: 4 * t * (1 - t) * arc * len };
  }

  // ------------------------------------------------------------ Kanone

  const firing = $derived(!!latest && now >= latest.firedAt && now < latest.landAt + SPLASH_AFTER_LAND_MS);
  const aimValue = $derived(aiming ? (aiming.aim ?? 0.5) : firing && latest ? latest.aim : 0.5);
  const cannonDeg = $derived((aimValue - 0.5) * 2 * AIM_MAX_DEG);
  const sinceFire = $derived(latest ? now - latest.firedAt : Infinity);
  const recoil = $derived(sinceFire >= 0 && sinceFire < 380 ? 26 * (sinceFire < 60 ? sinceFire / 60 : 1 - easeOut((sinceFire - 60) / 320)) : 0);

  // Erschütterung beim Aufprall auf dem Feld.
  const shake = $derived.by(() => {
    const hit = impacts.find((b) => b.onField);
    if (!hit) return { x: 0, y: 0 };
    const d = now - hit.landAt;
    if (d > 260) return { x: 0, y: 0 };
    const amp = 9 * (1 - d / 260);
    return { x: Math.sin(d / 14) * amp, y: Math.cos(d / 19) * amp * 0.6 };
  });

  // ------------------------------------------------------------ Zielen

  const target = $derived(aiming ? aimToTarget(aiming.power, aiming.aim ?? 0.5) : null);
  const targetOnField = $derived(!!target && target.x >= 0 && target.x <= 1 && target.y >= 0 && target.y <= 1);
  const cross = $derived(target ? { x: clamp(target.x * U, VB.x + 50, VB.x + VB.w - 50), y: clamp(target.y * U, VB.y + 50, C.y - 140) } : null);
  const aimColor = $derived(shooter ? colorOf(shooter.id) : '#ffffff');
  const muzzle = $derived.by(() => {
    const r = (cannonDeg * Math.PI) / 180;
    return { x: C.x + Math.sin(r) * 170, y: C.y - Math.cos(r) * 170 };
  });

  const windDeg = $derived(wind ? (Math.atan2(wind.y, wind.x) * 180) / Math.PI : 0);
  const figureSize = $derived(height * (300 / VB.h));
  const pct = (x: number) => ((x - VB.x) / VB.w) * 100;
</script>

<div class="relative select-none {className}" style="aspect-ratio:{VB.w}/{VB.h}; {style ?? ''}" bind:clientHeight={height}>
  <svg class="absolute inset-0 h-full w-full" viewBox="{VB.x} {VB.y} {VB.w} {VB.h}" aria-label="Spielfeld">
    <defs>
      <clipPath id="sf-clip"><rect x="0" y="0" width={U} height={U} rx="34" /></clipPath>
      <linearGradient id="sf-ground" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="1" stop-color="#e6edf5" />
      </linearGradient>
      <pattern id="sf-tiles" width="125" height="125" patternUnits="userSpaceOnUse">
        <path d="M125 0H0V125" fill="none" stroke="rgb(15 23 42 / 0.055)" stroke-width="3" />
      </pattern>
      <radialGradient id="sf-gloss" cx="0.36" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.42" />
        <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.08" />
        <stop offset="1" stop-color="#000000" stop-opacity="0.12" />
      </radialGradient>
      <radialGradient id="sf-ball" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.85" />
        <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.1" />
        <stop offset="1" stop-color="#000000" stop-opacity="0.45" />
      </radialGradient>
      <linearGradient id="sf-iron" x1="-34" y1="0" x2="34" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0b0f14" />
        <stop offset="0.28" stop-color="#4b5563" />
        <stop offset="0.42" stop-color="#a3acb9" />
        <stop offset="0.56" stop-color="#4b5563" />
        <stop offset="1" stop-color="#0b0f14" />
      </linearGradient>
      <linearGradient id="sf-wood" x1="-36" y1="0" x2="36" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#5b3412" />
        <stop offset="0.45" stop-color="#9a6230" />
        <stop offset="1" stop-color="#5b3412" />
      </linearGradient>
      <linearGradient id="sf-wheel" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3b2410" />
        <stop offset="0.5" stop-color="#8a5a2b" />
        <stop offset="1" stop-color="#3b2410" />
      </linearGradient>
      <linearGradient id="sf-power" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#58cc02" />
        <stop offset="0.6" stop-color="#ffc800" />
        <stop offset="1" stop-color="#ff4b4b" />
      </linearGradient>
      <linearGradient id="sf-bar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#64748b" />
        <stop offset="1" stop-color="#1e293b" />
      </linearGradient>
      <filter id="sf-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18" /></filter>
    </defs>

    <g transform="translate({shake.x} {shake.y})">
      <!-- Platz -->
      <rect x="10" y="26" width={U - 20} height={U} rx="34" fill="rgb(0 0 0 / 0.45)" filter="url(#sf-soft)" />
      <circle cx={C.x} cy={C.y} r="150" fill="#1e293b" stroke="#334155" stroke-width="6" />
      <rect x="0" y="0" width={U} height={U} rx="34" fill="url(#sf-ground)" />
      <rect x="0" y="0" width={U} height={U} rx="34" fill="url(#sf-tiles)" />
      <g fill="none" stroke="rgb(15 23 42 / 0.08)" stroke-width="5">
        <rect x="40" y="40" width={U - 80} height={U - 80} rx="18" />
        <circle cx={U / 2} cy={U / 2} r="110" />
        <circle cx={U / 2} cy={U / 2} r="8" fill="rgb(15 23 42 / 0.08)" />
      </g>

      <!-- Farbe -->
      <g clip-path="url(#sf-clip)">
        {#each landed as b (b.id)}
          <g class="blob">
            <path d={shapeOf(b)} fill="rgb(15 23 42 / 0.16)" transform="translate(0 7)" />
            <path d={shapeOf(b)} fill={colorOf(b.owner)} />
            <path d={shapeOf(b)} fill="url(#sf-gloss)" />
          </g>
        {/each}
      </g>
      <rect x="0" y="0" width={U} height={U} rx="34" fill="none" stroke="rgb(255 255 255 / 0.9)" stroke-width="8" />
      <rect x="-6" y="-6" width={U + 12} height={U + 12} rx="40" fill="none" stroke="rgb(148 163 184 / 0.55)" stroke-width="4" />

      <!-- Aufprall: Ring und Spritzer -->
      {#each impacts as b (b.id)}
        {@const k = (now - b.landAt) / 650}
        {@const e = easeOut(k)}
        <g transform="translate({b.landing.x * U} {b.landing.y * U})" opacity={1 - k}>
          <circle r={SPLASH_R * (0.6 + e * 1.1)} fill="none" stroke={colorOf(b.owner)} stroke-width={14 * (1 - k) + 2} />
          {#each dropsOf(b) as d, i (i)}
            <circle cx={Math.cos(d.a) * (SPLASH_R * 0.6 + d.d * e)} cy={Math.sin(d.a) * (SPLASH_R * 0.6 + d.d * e) + 60 * k * k} r={d.r * (1 - k * 0.6)} fill={colorOf(b.owner)} />
          {/each}
        </g>
      {/each}

      {#each misses as b (b.id)}
        <g class="miss" transform="translate({clamp(b.landing.x * U, VB.x + 120, VB.x + VB.w - 120)} {clamp(b.landing.y * U, VB.y + 90, 1000)})">
          <circle r="26" fill={colorOf(b.owner)} opacity="0.55" />
          <text y="-40" text-anchor="middle" font-size="44" font-weight="900" fill="#ff4b4b" stroke="#0f172a" stroke-width="8" paint-order="stroke">daneben</text>
        </g>
      {/each}

      <!-- Hindernisse -->
      {#each bars as o, i (i)}
        {@const x = (o.x - o.w / 2) * U}
        {@const y = (o.y - o.h / 2) * U}
        <rect {x} y={y + 12} width={o.w * U} height={o.h * U} rx="17" fill="rgb(15 23 42 / 0.22)" />
        <rect {x} {y} width={o.w * U} height={o.h * U} rx="17" fill="url(#sf-bar)" stroke="#0f172a" stroke-width="4" />
        <rect x={x + 16} y={y + 6} width={o.w * U - 32} height="7" rx="3.5" fill="rgb(255 255 255 / 0.35)" />
      {/each}

      <!-- Zielhilfe: Richtungsbogen, Linie, Fadenkreuz -->
      {#if aiming && target && cross}
        {#if aiming.aim !== null}
          <g fill="none" stroke="rgb(255 255 255 / 0.85)" stroke-linecap="round">
            <path
              d="M{C.x - Math.sin((AIM_MAX_DEG * Math.PI) / 180) * 200} {C.y - Math.cos((AIM_MAX_DEG * Math.PI) / 180) * 200} A200 200 0 0 1 {C.x + Math.sin((AIM_MAX_DEG * Math.PI) / 180) * 200} {C.y - Math.cos((AIM_MAX_DEG * Math.PI) / 180) * 200}"
              stroke="rgb(15 23 42 / 0.35)"
              stroke-width="16"
            />
            {#each [-60, -45, -30, -15, 0, 15, 30, 45, 60] as deg (deg)}
              {@const r = (deg * Math.PI) / 180}
              <line x1={C.x + Math.sin(r) * 190} y1={C.y - Math.cos(r) * 190} x2={C.x + Math.sin(r) * (deg === 0 ? 222 : 212)} y2={C.y - Math.cos(r) * (deg === 0 ? 222 : 212)} stroke-width="5" />
            {/each}
          </g>
        {/if}
        <line x1={muzzle.x} y1={muzzle.y} x2={target.x * U} y2={target.y * U} stroke={aimColor} stroke-width="6" stroke-dasharray="4 18" stroke-linecap="round" opacity="0.9" />
        <g transform="translate({cross.x} {cross.y})" class="cross">
          <circle r={SPLASH_R} fill={aimColor} fill-opacity="0.14" stroke={aimColor} stroke-width="4" stroke-dasharray="14 12" />
          <g stroke="#0f172a" stroke-width="13" stroke-linecap="round">
            <circle r="34" fill="none" />
            <line x1="-62" y1="0" x2="-20" y2="0" /><line x1="20" y1="0" x2="62" y2="0" />
            <line x1="0" y1="-62" x2="0" y2="-20" /><line x1="0" y1="20" x2="0" y2="62" />
          </g>
          <g stroke={targetOnField ? '#ffffff' : '#ff4b4b'} stroke-width="6" stroke-linecap="round">
            <circle r="34" fill="none" />
            <line x1="-62" y1="0" x2="-20" y2="0" /><line x1="20" y1="0" x2="62" y2="0" />
            <line x1="0" y1="-62" x2="0" y2="-20" /><line x1="0" y1="20" x2="0" y2="62" />
          </g>
          <circle r="7" fill={targetOnField ? '#ffffff' : '#ff4b4b'} stroke="#0f172a" stroke-width="4" />
        </g>
      {/if}

      <!-- Kraftanzeige rechts, gleicher Maßstab wie die Weite geradeaus; nur solange geschossen wird -->
      {#if shooter || aiming}<g>
        <rect x={GAUGE.x} y={gaugeY(1) - 6} width={GAUGE.w} height={gaugeY(0) - gaugeY(1) + 12} rx={GAUGE.w / 2} fill="#0f172a" stroke="#334155" stroke-width="5" />
        <rect x={GAUGE.x + 5} y={gaugeY(1)} width={GAUGE.w - 10} height={0 - gaugeY(1)} rx="12" fill="rgb(255 75 75 / 0.18)" />
        {#if aiming}
          <rect
            x={GAUGE.x + 6}
            y={gaugeY(aiming.power)}
            width={GAUGE.w - 12}
            height={Math.max(0, gaugeY(0) - gaugeY(aiming.power))}
            rx={(GAUGE.w - 12) / 2}
            fill="url(#sf-power)"
            opacity={aiming.aim === null ? 1 : 0.75}
          />
          {#if aiming.aim === null}
            <line x1={U + 8} y1={gaugeY(aiming.power)} x2={GAUGE.x - 4} y2={gaugeY(aiming.power)} stroke="#ffffff" stroke-width="5" stroke-dasharray="6 8" opacity="0.8" />
          {/if}
        {/if}
        <line x1={GAUGE.x - 10} y1="0" x2={GAUGE.x + GAUGE.w + 10} y2="0" stroke="#ff4b4b" stroke-width="5" stroke-linecap="round" />
        <text x={GAUGE.x + GAUGE.w / 2} y={gaugeY(0) + 58} text-anchor="middle" font-size="34" font-weight="800" fill="#94a3b8">Kraft</text>
      </g>{/if}

      <!-- Wind -->
      {#if wind}
        {@const level = windLevel(wind)}
        <g transform="translate(50 -95)">
          <rect x="-46" y="-46" width="290" height="92" rx="46" fill="#0f172a" stroke="#334155" stroke-width="4" />
          <g transform="rotate({windDeg})">
            <line x1="-26" y1="0" x2="10" y2="0" stroke="#38bdf8" stroke-width={6 + level * 4} stroke-linecap="round" />
            <path d="M8 -18 L34 0 L8 18 Z" fill="#38bdf8" />
          </g>
          <text x="60" y="13" font-size="36" font-weight="800" fill="#e2e8f0">Wind</text>
          {#each [0, 1, 2] as i (i)}<circle cx={172 + i * 26} cy="0" r="9" fill={i < level ? '#38bdf8' : '#475569'} />{/each}
        </g>
      {/if}

      <!-- Feldkanone von oben -->
      <g transform="translate({C.x} {C.y})">
        <ellipse cx="6" cy="34" rx="125" ry="100" fill="rgb(0 0 0 / 0.3)" />
        <g style="transform: rotate({cannonDeg}deg); transition: {aiming ? 'none' : 'transform 450ms cubic-bezier(0.3, 0.7, 0.3, 1)'}">
          <g transform="translate(0 {recoil})">
            <!-- Lafette: zwei Wangen, die nach hinten in den Schwanz laufen -->
            <path d="M-38 -26 L38 -26 L28 70 L17 150 Q0 162 -17 150 L-28 70 Z" fill="url(#sf-wood)" stroke="#2b1a0b" stroke-width="5" stroke-linejoin="round" />
            <rect x="-26" y="62" width="52" height="10" rx="3" fill="#1f2937" />
            <rect x="-19" y="128" width="38" height="9" rx="3" fill="#1f2937" />
            <circle cx="-14" cy="96" r="4" fill="#1f2937" /><circle cx="14" cy="96" r="4" fill="#1f2937" />
            <!-- Achse und Räder (von oben schmal) -->
            <rect x="-112" y="-8" width="224" height="16" rx="5" fill="url(#sf-iron)" stroke="#0b0f14" stroke-width="3" />
            {#each [-1, 1] as side (side)}
              <g transform="translate({side * 86} 0)">
                <rect x="-19" y="-80" width="38" height="160" rx="16" fill="#111827" />
                <rect x="-13" y="-74" width="26" height="148" rx="11" fill="url(#sf-wheel)" />
                {#each [-54, -36, -18, 0, 18, 36, 54] as ly (ly)}<line x1="-13" y1={ly} x2="13" y2={ly} stroke="rgb(0 0 0 / 0.35)" stroke-width="3" />{/each}
                <rect x={side * 19 - 8} y="-18" width="16" height="36" rx="5" fill="url(#sf-iron)" stroke="#0b0f14" stroke-width="3" />
              </g>
            {/each}
            <!-- Rohr: verjüngt, mit Verstärkungsringen, Mündungswulst und Traube -->
            <rect x="-9" y="38" width="18" height="18" rx="4" fill="#1f2937" />
            <circle cy="62" r="11" fill="url(#sf-iron)" stroke="#0b0f14" stroke-width="3" />
            <path
              d="M-33 30 Q-33 46 -17 48 L17 48 Q33 46 33 30 L23 -128 L28 -134 L28 -160 Q28 -166 22 -166 L-22 -166 Q-28 -166 -28 -160 L-28 -134 L-23 -128 Z"
              fill="url(#sf-iron)"
              stroke="#0b0f14"
              stroke-width="4"
              stroke-linejoin="round"
            />
            <rect x="-35" y="4" width="70" height="12" rx="4" fill="url(#sf-iron)" stroke="#0b0f14" stroke-width="3" />
            <rect x="-30" y="-64" width="60" height="10" rx="4" fill="url(#sf-iron)" stroke="#0b0f14" stroke-width="3" />
            <rect x="-44" y="-7" width="88" height="14" rx="4" fill="#1f2937" />
            <ellipse cy="-166" rx="17" ry="6" fill="#020305" />

            <!-- Mündungsfeuer und Rauch -->
            {#if sinceFire >= 0 && sinceFire < 900}
              {@const f = sinceFire / 900}
              {#each [0, 1, 2, 3] as i (i)}
                {@const a = (i - 1.5) * 0.55}
                <circle cx={Math.sin(a) * (30 + 110 * easeOut(f))} cy={-176 - Math.cos(a) * 60 * easeOut(f) + 30 * f} r={22 + 46 * easeOut(f)} fill="rgb(100 116 139 / {0.5 * (1 - f)})" />
              {/each}
              {#if sinceFire < 140}
                <path d="M0 -168 L-30 -200 L-12 -206 L0 -262 L12 -206 L30 -200 Z" fill="#ffd34d" opacity={1 - sinceFire / 140} />
                <circle cy="-180" r="26" fill="#fff7c2" opacity={1 - sinceFire / 140} />
              {/if}
            {/if}
          </g>
        </g>
      </g>

      <!-- Kugel mit Schweif und Schatten -->
      {#each flying as b (b.id)}
        {@const p = ballAt(b, now)}
        <ellipse cx={p.x * U} cy={p.y * U} rx={Math.max(8, 24 - p.h * 26)} ry={Math.max(4, 11 - p.h * 12)} fill="rgb(0 0 0 / {Math.max(0.1, 0.3 - p.h * 0.3)})" />
        {#each [4, 3, 2, 1] as k (k)}
          {@const q = ballAt(b, now - k * 18)}
          {#if now - k * 18 > b.firedAt}
            <circle cx={q.x * U} cy={(q.y - q.h) * U} r={(20 + q.h * 70) * (1 - k * 0.14)} fill={colorOf(b.owner)} opacity={0.32 - k * 0.06} />
          {/if}
        {/each}
        <circle cx={p.x * U} cy={(p.y - p.h) * U} r={20 + p.h * 70} fill={colorOf(b.owner)} stroke="#0f172a" stroke-width="4" />
        <circle cx={p.x * U} cy={(p.y - p.h) * U} r={20 + p.h * 70} fill="url(#sf-ball)" />
      {/each}
    </g>
  </svg>

  {#if shooter && figureSize > 0}
    <div class="pointer-events-none absolute" style="left:{pct(C.x - 245)}%; bottom:0; transform: translateX(-50%)">
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
    animation: splat 360ms cubic-bezier(0.2, 0.9, 0.3, 1.35) both;
  }
  @keyframes splat {
    from {
      transform: scale(0.15);
      opacity: 0.5;
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
