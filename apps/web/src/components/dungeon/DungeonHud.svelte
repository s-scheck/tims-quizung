<script lang="ts">
  import DungeonKeyIcon from './DungeonKeyIcon.svelte';

  /**
   * Dünne Kopfzeile über dem Handy-Dungeon (40 px): Menü, Fortschritt als Raum-Leiste mit Ausgang, Fehlversuche,
   * der Schlüssel (leuchtet, solange man ihn hat) und der Stummschalter. Ohne `room` (Host, Zuschauer) steht dort
   * nur die Überschrift.
   */
  let {
    rooms,
    room = null,
    out = false,
    eliminated = false,
    wrong = 0,
    hasKey = false,
    title = '',
    muted,
    offline = false,
    onMute,
    onMenu,
  }: {
    rooms: number;
    /** Eigener Raum ab 0, null ohne eigene Figur. */
    room?: number | null;
    out?: boolean;
    eliminated?: boolean;
    wrong?: number;
    hasKey?: boolean;
    title?: string;
    muted: boolean;
    offline?: boolean;
    onMute: () => void;
    onMenu: () => void;
  } = $props();
</script>

<div class="flex h-10 items-center gap-1.5">
  <button class="glass grid h-10 w-10 shrink-0 place-items-center rounded-xl text-amber-50/85" aria-label="Menü" onclick={onMenu}>
    <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
  </button>

  {#if room !== null}
    <div class="glass flex h-10 min-w-0 items-center gap-2 rounded-xl px-2.5" aria-label={out ? 'Draußen' : `Raum ${room + 1} von ${rooms}`}>
      <span class="whitespace-nowrap text-[0.8rem] font-black leading-none text-amber-50">
        {#if out}
          Draußen
        {:else}
          Raum {room + 1}<span class="font-bold text-amber-50/45">/{rooms}</span>
        {/if}
      </span>
      <span class="flex items-center gap-[3px]" aria-hidden="true">
        {#each Array.from({ length: rooms }, (_, i) => i) as i (i)}
          <span style="width:{rooms > 5 ? 0.5 : 0.7}rem" class="seg {out || i < room ? 'seg-done' : i === room ? (eliminated ? 'seg-dead' : 'seg-now') : ''}"></span>
        {/each}
        <span class="gate {out ? 'gate-open' : ''}"></span>
      </span>
    </div>
  {:else}
    <div class="glass flex h-10 min-w-0 items-center rounded-xl px-3">
      <span class="truncate text-[0.8rem] font-black text-amber-50">{title}</span>
    </div>
  {/if}

  {#if offline}
    <span class="shrink-0 rounded-full bg-amber-400/90 px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-wider text-[#2a1d00]">offline</span>
  {/if}

  <div class="ml-auto flex shrink-0 items-center gap-1.5">
    {#if room !== null && wrong > 0}
      <span class="glass flex h-10 items-center gap-0.5 rounded-xl px-2.5 text-[0.8rem] font-black text-rose-300" aria-label="{wrong} Fehlversuche">
        <svg viewBox="0 0 12 12" class="h-2.5 w-2.5" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
        <span class="tabular-nums">{wrong}</span>
      </span>
    {/if}
    {#if hasKey}
      <span class="key glass grid h-10 w-10 place-items-center rounded-xl" title="Du hast einen Schlüssel" aria-label="Schlüssel">
        <DungeonKeyIcon size={22} class="-rotate-45" />
      </span>
    {/if}
    <button class="glass grid h-10 w-10 place-items-center rounded-xl text-amber-50/75" aria-label={muted ? 'Ton an' : 'Ton aus'} onclick={onMute}>
      <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" aria-hidden="true">
        <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
        {#if muted}
          <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        {:else}
          <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        {/if}
      </svg>
    </button>
  </div>
</div>

<style>
  .glass {
    background: rgba(18, 14, 10, 0.62);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 226, 170, 0.12);
    -webkit-tap-highlight-color: transparent;
  }
  .seg {
    height: 0.4rem;
    border-radius: 2px;
    background: rgba(255, 236, 200, 0.14);
  }
  .seg-done {
    background: rgba(245, 180, 80, 0.55);
  }
  .seg-now {
    background: #f6c453;
    box-shadow: 0 0 8px rgba(246, 196, 83, 0.75);
  }
  .seg-dead {
    background: rgba(244, 63, 94, 0.55);
  }
  /* Ausgang: ein kleiner Torbogen, offen mit Tageslicht. */
  .gate {
    margin-left: 2px;
    width: 0.55rem;
    height: 0.7rem;
    border-radius: 0.3rem 0.3rem 1px 1px;
    box-shadow: inset 0 0 0 1.5px rgba(255, 236, 200, 0.35);
  }
  .gate-open {
    background: linear-gradient(#fff4c8, #f6c453);
    box-shadow: 0 0 8px rgba(255, 220, 120, 0.8);
  }
  .key {
    color: #ffd36b;
    background: radial-gradient(circle, rgba(246, 196, 83, 0.28), rgba(18, 14, 10, 0.62) 70%);
    box-shadow:
      inset 0 0 0 1px rgba(255, 211, 107, 0.55),
      0 0 14px rgba(246, 196, 83, 0.35);
    animation: key-glow 2.4s ease-in-out infinite;
  }
  @keyframes key-glow {
    50% {
      box-shadow:
        inset 0 0 0 1px rgba(255, 211, 107, 0.8),
        0 0 20px rgba(246, 196, 83, 0.55);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .key {
      animation: none;
    }
  }
</style>
