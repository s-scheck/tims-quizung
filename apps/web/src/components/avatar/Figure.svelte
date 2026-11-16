<script lang="ts">
  import { FIGURE_H, FIGURE_W, RIG, type AvatarPart } from '@quiz/shared';
  import type { FigureParts, Pose } from '../../lib/avatar.ts';

  /**
   * Ganze Figur auf dem festen Rig. Jedes Teil dreht sich um sein Gelenk, die Kopfbedeckung hängt am Kopf.
   * `size` ist die Höhe in px, `seed` verschiebt die Animation, damit nicht alle im Gleichtakt wippen.
   */
  let {
    parts,
    size = 120,
    pose = 'idle',
    crown = false,
    seed = 0,
  }: { parts: FigureParts; size?: number; pose?: Pose; crown?: boolean; seed?: number } = $props();

  const scale = $derived(size / FIGURE_H);
  const BODY: AvatarPart[] = ['legL', 'legR', 'torso', 'armL', 'armR'];
  const hat = RIG.hat;
  const head = RIG.head;
</script>

<div class="relative shrink-0" style="width:{FIGURE_W * scale}px; height:{size}px" aria-hidden="true">
  <div class="rig pose-{pose}" style="width:{FIGURE_W}px; height:{FIGURE_H}px; transform: scale({scale}); --delay:{-(seed % 7) * 0.37}s">
    <div class="body">
      {#each BODY as part (part)}
        {@const r = RIG[part]}
        {#if parts[part]}
          <div class="part {part}" style="left:{r.at.x}px; top:{r.at.y}px; width:{r.w}px; height:{r.h}px; transform-origin:{r.pivot.x}px {r.pivot.y}px">
            <img src={parts[part]} alt="" draggable="false" />
          </div>
        {/if}
      {/each}
      <div class="part headgroup" style="left:{hat.at.x}px; top:{hat.at.y}px; width:{hat.w}px; height:{hat.h}px; transform-origin:{hat.pivot.x}px {hat.pivot.y}px">
        {#if parts.head}
          <img
            src={parts.head}
            alt=""
            draggable="false"
            style="position:absolute; left:{head.at.x - hat.at.x}px; top:{head.at.y - hat.at.y}px; width:{head.w}px; height:{head.h}px"
          />
        {/if}
        {#if parts.hat}<img src={parts.hat} alt="" draggable="false" style="position:absolute; inset:0" />{/if}
        {#if crown}<span class="crown" style="top:{parts.hat ? -40 : head.at.y - hat.at.y + 4 - 62}px">👑</span>{/if}
      </div>
    </div>
  </div>
</div>

<style>
  .rig {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  .body {
    position: absolute;
    inset: 0;
    transform-origin: 100px 442px;
  }
  .part {
    position: absolute;
  }
  .part img {
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-user-drag: none;
  }
  .crown {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 72px;
    line-height: 1;
    filter: drop-shadow(0 4px 6px rgb(0 0 0 / 0.35));
    animation: crown-in 600ms cubic-bezier(0.2, 0.7, 0.3, 1.4) both;
  }

  /* Ruhe: leichtes Wippen und Schwingen. */
  .pose-idle .body,
  .pose-wave .body {
    animation: bob 2.4s ease-in-out var(--delay) infinite;
  }
  .pose-idle .armL,
  .pose-wave .armL {
    animation: sway-l 2.4s ease-in-out var(--delay) infinite alternate;
  }
  .pose-idle .armR {
    animation: sway-r 2.4s ease-in-out var(--delay) infinite alternate;
  }
  .pose-idle .headgroup,
  .pose-wave .headgroup {
    animation: tilt 3.2s ease-in-out var(--delay) infinite alternate;
  }
  .pose-wave .armR {
    animation: wave 0.45s ease-in-out infinite alternate;
  }

  /* Jubeln: hüpfen, Arme hoch. */
  .pose-cheer .body {
    animation: jump 0.7s ease-in-out infinite;
  }
  .pose-cheer .armL {
    animation: cheer-l 0.35s ease-in-out infinite alternate;
  }
  .pose-cheer .armR {
    animation: cheer-r 0.35s ease-in-out infinite alternate;
  }
  .pose-cheer .legL {
    animation: kick-l 0.35s ease-in-out infinite alternate;
  }
  .pose-cheer .legR {
    animation: kick-r 0.35s ease-in-out infinite alternate;
  }
  .pose-cheer .headgroup {
    animation: tilt 0.35s ease-in-out infinite alternate;
  }

  /* Traurig: zusammengesackt, Kopf und Arme hängen. */
  .pose-sad .body {
    animation: slump 3.6s ease-in-out var(--delay) infinite;
  }
  .pose-sad .headgroup {
    transform: rotate(16deg);
  }
  .pose-sad .armL {
    transform: rotate(-7deg);
  }
  .pose-sad .armR {
    transform: rotate(7deg);
  }

  /* Gehen: Beine und Arme im Wechsel. */
  .pose-walk .body {
    animation: step-bob 0.25s ease-in-out infinite alternate;
  }
  .pose-walk .legL,
  .pose-walk .armR {
    animation: stride 0.5s ease-in-out infinite alternate;
  }
  .pose-walk .legR,
  .pose-walk .armL {
    animation: stride 0.5s ease-in-out infinite alternate-reverse;
  }

  @keyframes bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px) scaleY(1.01);
    }
  }
  @keyframes sway-l {
    from {
      transform: rotate(7deg);
    }
    to {
      transform: rotate(-3deg);
    }
  }
  @keyframes sway-r {
    from {
      transform: rotate(-7deg);
    }
    to {
      transform: rotate(3deg);
    }
  }
  @keyframes tilt {
    from {
      transform: rotate(-4deg);
    }
    to {
      transform: rotate(4deg);
    }
  }
  @keyframes wave {
    from {
      transform: rotate(-160deg);
    }
    to {
      transform: rotate(-120deg);
    }
  }
  @keyframes jump {
    0%,
    100% {
      transform: translateY(0) scaleY(0.97);
    }
    45% {
      transform: translateY(-38px) scaleY(1.02);
    }
  }
  @keyframes cheer-l {
    from {
      transform: rotate(140deg);
    }
    to {
      transform: rotate(168deg);
    }
  }
  @keyframes cheer-r {
    from {
      transform: rotate(-140deg);
    }
    to {
      transform: rotate(-168deg);
    }
  }
  @keyframes kick-l {
    from {
      transform: rotate(4deg);
    }
    to {
      transform: rotate(14deg);
    }
  }
  @keyframes kick-r {
    from {
      transform: rotate(-4deg);
    }
    to {
      transform: rotate(-14deg);
    }
  }
  @keyframes slump {
    0%,
    100% {
      transform: translateY(8px);
    }
    50% {
      transform: translateY(11px);
    }
  }
  @keyframes step-bob {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-6px);
    }
  }
  @keyframes stride {
    from {
      transform: rotate(-22deg);
    }
    to {
      transform: rotate(22deg);
    }
  }
  @keyframes crown-in {
    from {
      transform: translate(-50%, -60px) scale(0.3);
      opacity: 0;
    }
    to {
      transform: translate(-50%, 0) scale(1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rig * {
      animation: none !important;
    }
  }
</style>
