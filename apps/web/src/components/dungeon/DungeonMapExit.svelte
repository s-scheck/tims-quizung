<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { figureById } from '../../lib/avatar.ts';
  import Figure from '../avatar/Figure.svelte';

  /**
   * Ausgang am Ende der Karte: ein Steintor, durch das Tageslicht fällt. Draußen stehen die Rausgekommenen
   * auf der Wiese, mit Platz über dem Kopf, der Erste jubelt.
   */
  let { view, out, height }: { view: RoomView; out: { id: string; place: number }[]; height: number } = $props();

  /** Figuren werden kleiner, je mehr draußen stehen. */
  const size = $derived(height * (out.length <= 2 ? 0.36 : out.length <= 4 ? 0.3 : 0.25));
  const spotX = (k: number) => (out.length === 1 ? 50 : 22 + (k / (out.length - 1)) * 56);
</script>

<div class="gate relative h-full w-full">
  <div class="opening absolute overflow-hidden">
    <svg class="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="dg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#8fc3e8" />
          <stop offset="0.55" stop-color="#f6e7b8" />
          <stop offset="1" stop-color="#ffd27a" />
        </linearGradient>
        <radialGradient id="dg-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stop-color="#fffbe6" />
          <stop offset="0.35" stop-color="#ffe9a6" stop-opacity="0.9" />
          <stop offset="1" stop-color="#ffd27a" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#dg-sky)" />
      <circle cx="62" cy="52" r="30" fill="url(#dg-sun)" />
      <path d="M0 64 Q18 50 34 60 T70 56 T100 60 V100 H0Z" fill="#9db58a" opacity="0.75" />
      <path d="M0 72 Q25 62 50 70 T100 68 V100 H0Z" fill="#6f9a5a" />
      <path d="M0 82 Q30 76 60 82 T100 80 V100 H0Z" fill="#4f7d3f" />
    </svg>
    <div class="rays absolute inset-0"></div>
    {#each out as o, k (o.id)}
      {@const parts = figureById(view, o.id) ?? {}}
      <div class="absolute flex flex-col items-center" style="left:{spotX(k)}%; bottom:6%; transform: translateX(-50%); z-index:{10 + k}">
        <span class="place mb-0.5 grid place-items-center rounded-full font-black leading-none {o.place === 1 ? 'first' : ''}" style="font-size:{Math.max(10, size * 0.16)}px; width:{Math.max(18, size * 0.28)}px; height:{Math.max(18, size * 0.28)}px">{o.place}</span>
        <Figure {parts} size={size} pose={o.place === 1 ? 'cheer' : 'wave'} seed={k * 3 + 1} />
      </div>
    {/each}
  </div>
  {#if out.length === 0}
    <span class="absolute inset-x-0 bottom-[12%] text-center text-[0.8rem] font-bold text-emerald-950/70">noch niemand</span>
  {/if}
</div>

<style>
  .gate {
    border-radius: 999px 999px 0.6rem 0.6rem / 42% 42% 0.6rem 0.6rem;
    background:
      repeating-linear-gradient(0deg, rgb(0 0 0 / 0.35) 0 2px, transparent 2px 22px),
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.28) 0 2px, transparent 2px 34px),
      linear-gradient(180deg, #6b625a, #3f3832);
    box-shadow:
      0 0 60px -6px rgb(255 214 120 / 0.55),
      inset 0 2px 0 rgb(255 255 255 / 0.18),
      0 10px 24px rgb(0 0 0 / 0.6);
  }
  .opening {
    inset: 9% 11% 0 11%;
    border-radius: 999px 999px 0 0 / 40% 40% 0 0;
    box-shadow:
      inset 0 0 0 2px rgb(0 0 0 / 0.35),
      inset 0 10px 24px rgb(0 0 0 / 0.25);
  }
  .rays {
    background: repeating-conic-gradient(from 200deg at 62% 52%, rgb(255 255 255 / 0.16) 0 6deg, transparent 6deg 18deg);
    mix-blend-mode: soft-light;
    animation: rays 18s linear infinite;
    opacity: 0.9;
  }
  @keyframes rays {
    50% {
      opacity: 0.55;
    }
  }
  .place {
    background: rgb(255 255 255 / 0.85);
    color: #3b2a12;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
  }
  .place.first {
    background: linear-gradient(#ffe08a, #c98d12);
    color: #4a3000;
  }
  @media (prefers-reduced-motion: reduce) {
    .rays {
      animation: none;
    }
  }
</style>
