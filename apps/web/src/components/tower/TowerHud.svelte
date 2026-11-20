<script lang="ts">
  import { TOWER_SPECIALS, type TowerSpecial } from '@quiz/shared';
  import TowerBadge from './TowerBadge.svelte';
  import TowerNext from './TowerNext.svelte';
  import TowerRing from './TowerRing.svelte';
  import { GOLD, groupOf, meters } from './towerStyle.ts';

  /**
   * Dünne HUD-Zeile über dem Handy-Spielfeld (36 px): Menü, Höhe mit Rest bis zur Linie und Platz, rechts die
   * scharfen Stein-Zauber (Ranken, Vergrößern, Mini-Steine, Schwerer Stein) als kleine, überlappende Plaketten, die
   * laufenden Effekte mit Restzeit-Ring und der nächste Stein (bei Steinwahl zwei Formen zum Antippen).
   */
  let {
    height,
    goal,
    rank,
    total,
    showRank,
    effects,
    armed = [],
    next,
    pick = null,
    picked = 0,
    onPick,
    color,
    fog = false,
    offline = false,
    onMenu,
  }: {
    height: number;
    goal: number;
    rank: number;
    total: number;
    showRank: boolean;
    /** Laufende Effekte auf mir: `value` ist die Restzeit von 1 bis 0. */
    effects: { id: number; special: TowerSpecial; value: number }[];
    /** Zauber, die auf die nächsten Steine wirken (scharf). */
    armed?: TowerSpecial[];
    next: number;
    /** Steinwahl: die zwei Formen und die gewählte. */
    pick?: readonly [number, number] | null;
    picked?: 0 | 1;
    onPick?: (i: 0 | 1) => void;
    color: string;
    fog?: boolean;
    offline?: boolean;
    onMenu: () => void;
  } = $props();

  const gap = $derived(goal - height);
</script>

<div class="flex h-9 items-center gap-1.5">
  <button
    class="glass pointer-events-auto grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/85"
    aria-label="Menü"
    onpointerdown={(e) => e.stopPropagation()}
    onclick={onMenu}
  >
    <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
  </button>

  <div class="glass flex h-9 min-w-0 items-center rounded-xl text-white">
    <div class="flex items-baseline gap-1.5 px-2.5">
      <span class="font-mono text-[1.15rem] font-black leading-none tabular-nums">{meters(height)}<span class="ml-0.5 text-[0.7rem] font-bold text-white/60">m</span></span>
      {#if gap <= 0}
        <span class="whitespace-nowrap text-[0.7rem] font-extrabold" style="color:{GOLD}">über der Linie</span>
      {:else}
        <span class="whitespace-nowrap text-[0.7rem] font-semibold text-white/65">noch <span class="font-bold tabular-nums text-white/90">{meters(gap)}</span></span>
      {/if}
    </div>
    {#if showRank}
      <div class="flex h-full items-baseline gap-0.5 border-l border-white/10 pl-2 pr-2.5 pt-[9px] {rank === 1 ? 'rounded-r-xl bg-[rgba(246,196,83,0.14)]' : ''}" aria-label="Platz {rank} von {total}">
        <span class="text-[0.95rem] font-black leading-none" style={rank === 1 ? `color:${GOLD}` : ''}>{rank}.</span>
        <span class="text-[0.6rem] font-bold leading-none text-white/50">/{total}</span>
      </div>
    {/if}
  </div>

  {#if offline}
    <span class="shrink-0 rounded-full bg-amber-400/90 px-2 py-1 text-[0.6rem] font-extrabold uppercase tracking-wider text-[#2a1d00]">offline</span>
  {/if}

  <div class="ml-auto flex min-w-0 items-center gap-1">
    {#if armed.length > 0}
      <span class="armed flex shrink-0 items-center">
        {#each armed as a (a)}
          <span class="fx-sm glass" title="{TOWER_SPECIALS[a].name} wirkt auf die nächsten Steine"><TowerBadge special={a} size={22} /></span>
        {/each}
      </span>
    {/if}
    {#each effects as e (e.id)}
      <span class="fx glass" title={TOWER_SPECIALS[e.special].name}>
        <TowerRing value={e.value} size={34} stroke={2.5} color={groupOf(e.special) === 'dark' ? '#b9a2ff' : '#ffd36b'} track="rgba(255,255,255,0.14)">
          <TowerBadge special={e.special} size={24} />
        </TowerRing>
      </span>
    {/each}
    <TowerNext form={next} {color} {fog} options={pick} chosen={picked} onChoose={onPick} />
  </div>
</div>

<style>
  .glass {
    background: rgba(10, 16, 30, 0.5);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
    -webkit-tap-highlight-color: transparent;
  }
  .fx-sm {
    display: inline-grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    border-radius: 999px;
  }
  .armed > :global(* + *) {
    margin-left: -0.5rem;
  }
  .fx {
    display: inline-grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    flex-shrink: 0;
    border-radius: 999px;
  }
</style>
