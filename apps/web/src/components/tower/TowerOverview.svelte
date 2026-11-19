<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { FX_FOG, type RoomView, type TowerRoundView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerColor, playerName } from '../../lib/format.ts';
  import { FrameClock } from '../../lib/frameClock.svelte.ts';
  import EndCategoryButton from '../EndCategoryButton.svelte';
  import TowerCountdown from './TowerCountdown.svelte';
  import TowerRail from './TowerRail.svelte';
  import TowerTickerFeed from './TowerTickerFeed.svelte';
  import TowerTile from './TowerTile.svelte';
  import type { TowerScene } from './towerDraw.ts';
  import { towerFeed } from './towerFeed.svelte.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerRing from './TowerRing.svelte';
  import { GOLD, HOLD_GREEN } from './towerStyle.ts';
  import { TickerList } from './towerTickerList.svelte.ts';

  /**
   * Übersicht aller Türme, live aus den Frames: am Fernseher (`readonly`) bildschirmfüllend wie eine Sportübertragung,
   * für den moderierenden Host als Spalte zum Scrollen. Kopfzeile mit Ziellinie und Ereignis-Ticker, Kacheln je Spieler,
   * darunter das Höhenrennen über alle.
   */
  let { view, round, readonly = false }: { view: RoomView; round: TowerRoundView; readonly?: boolean } = $props();

  const clock = new FrameClock();
  onMount(() => clock.start());
  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));

  const builders = $derived(round.turnOrder.filter((id) => round.players[id]));
  const live = $derived.by(() => {
    void towerFeed.version;
    return Object.fromEntries(
      builders.map((id) => {
        const f = towerFeed.frame(id, round.startedAt);
        return [id, { h: f?.h ?? round.players[id]?.height ?? 0, hold: f?.hold ?? 0 }];
      }),
    ) as Record<string, { h: number; hold: number }>;
  });
  const ranked = $derived([...builders].sort((a, b) => (live[b]?.h ?? 0) - (live[a]?.h ?? 0)));
  const rankOf = (id: string) => 1 + builders.filter((o) => (live[o]?.h ?? 0) > (live[id]?.h ?? 0) + 0.05).length;
  /** Plätze erst, wenn überhaupt jemand baut. */
  const anyBuilt = $derived(builders.some((id) => (live[id]?.h ?? 0) > 0.3));
  const leader = $derived.by(() => {
    const top = ranked[0];
    const second = ranked[1];
    if (!top || (live[top]?.h ?? 0) < 0.5) return null;
    if (second && Math.abs((live[top]?.h ?? 0) - (live[second]?.h ?? 0)) < 0.05) return null;
    return top;
  });

  // Ticker: neue Ereignisse aus Server-Stand und Frames.
  const ticker = new TickerList(6500, untrack(() => (readonly ? 4 : 3)));
  $effect(() => {
    const input = {
      now: performance.now(),
      goal: round.goalHeight,
      players: builders,
      heights: Object.fromEntries(builders.map((id) => [id, live[id]?.h ?? 0])),
      holds: Object.fromEntries(builders.map((id) => [id, live[id]?.hold ?? 0])),
      marks: Object.fromEntries(builders.map((id) => [id, round.players[id]?.marks ?? []])),
      effects: round.effects,
    };
    untrack(() => {
      towerFeed.noteSpells(round.startedAt, input.effects);
      ticker.feed(input);
    });
  });
  $effect(() => {
    void clock.now;
    untrack(() => ticker.prune(performance.now()));
  });

  /** Spalten je Spielerzahl: bis vier nebeneinander, darüber zwei Reihen. */
  const cols = $derived(readonly ? (builders.length <= 4 ? Math.max(1, builders.length) : Math.ceil(builders.length / 2)) : Math.min(2, builders.length));
  const rows = $derived(Math.ceil(builders.length / cols));

  function remoteScene(id: string): () => TowerScene {
    const color = colorOf(id);
    return () => {
      const f = towerFeed.frame(id, round.startedAt);
      const fx = f?.fx ?? 0;
      const g = round.effects.filter((e) => e.target === id && e.special === 'gust').at(-1);
      const gustAt = g ? performance.now() - (client.serverNow() - g.at) : null;
      return {
        stones: f ? towerFeed.stones(id, performance.now()) : [],
        height: f?.h ?? 0,
        goal: round.goalHeight,
        marks: round.marks,
        reached: round.players[id]?.marks ?? [],
        color,
        fx,
        hold: f?.hold ?? 0,
        fog: (fx & FX_FOG) !== 0,
        gust: g && gustAt !== null ? { at: gustAt, dir: g.id % 2 === 0 ? 1 : -1 } : null,
        won: round.winners.includes(id),
      };
    };
  }
  // Szenen je Spieler einmal anlegen, damit die Kacheln nie neu starten.
  const scenes = new Map<string, () => TowerScene>();
  const sceneOf = (id: string) => scenes.get(id) ?? (scenes.set(id, remoteScene(id)), scenes.get(id)!);

  /** Wer gerade über der Linie hält (am weitesten zuerst). */
  const holder = $derived(builders.filter((id) => (live[id]?.hold ?? 0) > 0).sort((a, b) => (live[b]?.hold ?? 0) - (live[a]?.hold ?? 0))[0] ?? null);
  const effectsOn = (id: string) => round.effects.filter((e) => e.target === id && e.until > clock.now);
  const railEntries = $derived(builders.map((id) => ({ id, height: live[id]?.h ?? 0, color: colorOf(id), holding: (live[id]?.hold ?? 0) > 0 })));
</script>

<div class="relative flex flex-col gap-3" style={readonly ? 'height: calc(100dvh - 5.75rem)' : undefined}>
  <!-- Kopfzeile: Ziellinie, Frage, Alarm beim Halten -->
  <div class="flex items-center justify-between gap-4 {readonly ? '' : 'flex-wrap'}">
    <div class="flex items-center gap-3">
      <div class="goal flex flex-col items-center justify-center rounded-2xl {readonly ? 'px-4 py-1.5' : 'px-3 py-1'}">
        <span class="text-[0.58rem] font-extrabold uppercase tracking-[0.25em] text-white/60">Ziellinie</span>
        <span class="font-black leading-none {readonly ? 'text-3xl' : 'text-2xl'}" style="color:{GOLD}">{round.goalHeight}<span class="ml-0.5 text-[0.55em]">m</span></span>
      </div>
      <div class="min-w-0">
        <p class="text-xs font-extrabold uppercase tracking-[0.25em] text-slate-500">Hochstapler</p>
        <h2 class="font-black leading-tight {readonly ? 'text-2xl' : 'text-xl'}">Wer hält zuerst über der Linie?</h2>
      </div>
    </div>
    {#if holder}
      <div class="alert flex items-center gap-3 rounded-2xl px-4 py-2 text-white">
        <TowerRing value={live[holder]?.hold ?? 0} size={readonly ? 48 : 40} stroke={4} color={HOLD_GREEN}>
          <PlayerHead {view} id={holder} size={readonly ? 34 : 28} />
        </TowerRing>
        <div>
          <p class="font-black leading-tight {readonly ? 'text-2xl' : 'text-lg'}">{playerName(view, holder)} hält!</p>
          <p class="text-sm font-extrabold text-[#c9b8ff]">Jetzt hilft nur noch dunkle Magie</p>
        </div>
      </div>
    {:else if readonly}
      <p class="text-right text-sm text-slate-500">Drei Sekunden ruhig über der Linie gewinnt.<br />An jeder Marke: helle oder dunkle Magie.</p>
    {/if}
    {#if !readonly}<EndCategoryButton {view} label="Rennen beenden" title="Das Rennen endet sofort, gewertet wird nach Höhe." />{/if}
  </div>

  {#if !readonly}
    <TowerTickerFeed {view} items={ticker.items} size="sm" />
  {/if}

  <!-- Türme, am Fernseher mit Ticker rechts daneben -->
  <div class="flex min-h-0 flex-1 gap-4">
    <div class="grid min-h-0 flex-1 gap-3" style="grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-template-rows: repeat({rows}, minmax(0, 1fr))">
      {#each builders as id (id)}
        <div class="tile-cell flex min-h-0 justify-center" style={readonly ? undefined : 'height: 44dvh'}>
          <TowerTile
            {view}
            {id}
            scene={sceneOf(id)}
            color={colorOf(id)}
            height={live[id]?.h ?? 0}
            hold={live[id]?.hold ?? 0}
            goal={round.goalHeight}
            rank={anyBuilt ? rankOf(id) : null}
            leader={leader === id}
            effects={effectsOn(id)}
            now={clock.now}
            hasStock={round.players[id]?.hasStock ?? false}
            shielded={round.players[id]?.shielded ?? false}
            labels={builders.length <= 4}
            big={readonly && builders.length <= 4}
            minVisible={round.goalHeight + 4}
          />
        </div>
      {/each}
    </div>
    {#if readonly}
      <aside class="flex w-[19rem] shrink-0 flex-col gap-2 overflow-hidden">
        <p class="text-xs font-extrabold uppercase tracking-[0.25em] text-slate-500">Live</p>
        {#if ticker.items.length === 0}
          <p class="text-sm text-slate-500">Hier erscheint, wer zaubert, wer Marken knackt und wer die Führung übernimmt.</p>
        {/if}
        <TowerTickerFeed {view} items={ticker.items} size="md" />
      </aside>
    {/if}
  </div>

  <!-- Höhenrennen -->
  <div class="rounded-2xl border border-slate-800 bg-slate-900 {readonly ? 'px-8 pb-1 pt-1' : 'px-5 pb-1 pt-1'}">
    <TowerRail {view} goal={round.goalHeight} marks={round.marks} entries={railEntries} {leader} head={readonly ? 30 : 24} />
  </div>

  {#if clock.now > 0 && clock.now < round.goAt + 1000}
    <div class="absolute inset-0 overflow-hidden rounded-3xl"><TowerCountdown goAt={round.goAt} now={clock.now} goal={round.goalHeight} /></div>
  {/if}
</div>

<style>
  /* Kachel füllt ihre Zelle, wird aber nie breiter als ein hohes Hochformat (sonst wirkt der Turm verloren). */
  .tile-cell > :global(*) {
    flex: 1 1 auto;
    max-width: 30rem;
  }
  .alert {
    background: linear-gradient(160deg, #1e1646, #0c0a22);
    box-shadow:
      inset 0 0 0 1.5px rgba(62, 224, 143, 0.7),
      0 0 30px -6px rgba(62, 224, 143, 0.6);
    animation: alarm 900ms ease-in-out infinite;
  }
  @keyframes alarm {
    50% {
      box-shadow:
        inset 0 0 0 2px rgba(62, 224, 143, 1),
        0 0 44px -2px rgba(62, 224, 143, 0.8);
    }
  }
  .goal {
    background: linear-gradient(180deg, #1a2238, #0e1426);
    box-shadow:
      inset 0 0 0 1px rgba(246, 196, 83, 0.45),
      0 0 24px -8px rgba(246, 196, 83, 0.5);
  }
</style>
