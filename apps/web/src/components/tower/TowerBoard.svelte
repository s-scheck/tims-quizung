<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    FX_BOULDER,
    FX_FOG,
    FX_GLUE,
    TOWER_GOAL_LABELS,
    TOWER_SPECIALS,
    type RoomView,
    type TowerEffectView,
    type TowerRoundView,
    type TowerSpecial,
  } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerColor, playerName } from '../../lib/format.ts';
  import { FrameClock } from '../../lib/frameClock.svelte.ts';
  import EndCategoryButton from '../EndCategoryButton.svelte';
  import PlayerHead from '../PlayerHead.svelte';
  import TowerCanvas from './TowerCanvas.svelte';
  import TowerControls, { towerGestures } from './TowerControls.svelte';
  import TowerIcon from './TowerIcon.svelte';
  import { TowerSim } from './TowerSim.ts';
  import { drawPreview, formatMeters, type TowerScene } from './towerDraw.ts';
  import { towerFeed } from './towerFeed.svelte.ts';

  /**
   * Hochstapler. Am Handy: der eigene Turm mit Physik, Steuerung und Spezial-Taste.
   * Am Fernseher (`readonly`) und für den moderierenden Host: alle Türme nebeneinander, live aus den Frames.
   */
  let { view, round, readonly = false }: { view: RoomView; round: TowerRoundView; readonly?: boolean } = $props();

  const FRAME_MS = 125;
  const me = $derived(readonly ? null : client.myId);
  const colorOf = (id: string) => playerColor(view.players.findIndex((p) => p.id === id));
  const clock = new FrameClock();
  onMount(() => clock.start());

  // ---------------------------------------------------------------- Handy: eigener Turm

  // Die Physik entsteht einmal pro Runde; spätere Server-Stände ändern nur Effekte und Vorrat.
  const sim = untrack(() => {
    const id = client.myId;
    if (readonly || !id || !round.my || !round.turnOrder.includes(id)) return null;
    return new TowerSim({ seed: round.my.seed, goalHeight: round.goalHeight, marks: round.marks, reachedMarks: round.players[id]?.marks ?? [] });
  });
  const myColor = untrack(() => colorOf(client.myId ?? ''));

  // Was der Bildschirm-Takt braucht, ohne die Animation an Props zu binden.
  let latest: { effects: TowerEffectView[]; playing: boolean } = { effects: [], playing: false };
  $effect(() => {
    latest = { effects: round.effects, playing: view.phase === 'playing' };
  });

  let ui = $state({ height: 0, hold: 0, next: 0, glue: false, boulder: false, fog: false });
  let notice = $state<{ text: string; special: TowerSpecial; until: number } | null>(null);
  let gust: { at: number; dir: number } | null = null;
  let lastSent = 0;
  let lastUi = 0;
  const seen = new Set<number>();

  function apply(e: TowerEffectView, time: number) {
    if (!sim) return;
    switch (e.special) {
      case 'glue':
        sim.glueArmed = true;
        break;
      case 'shrink':
        sim.shrink();
        break;
      case 'beam':
        sim.addBeam();
        break;
      case 'boulder':
        sim.boulderArmed = true;
        break;
      case 'gust': {
        const dir = e.id % 2 === 0 ? 1 : -1;
        sim.gust(dir);
        gust = { at: time, dir };
        break;
      }
    }
    if (e.by !== me) notice = { text: `${playerName(view, e.by)}: ${TOWER_SPECIALS[e.special].name}!`, special: e.special, until: time + 2600 };
  }

  function tick(dt: number, time: number) {
    if (!sim || !latest.playing) return;
    const now = client.serverNow();
    const mine = latest.effects.filter((e) => e.target === me);
    const active = (s: TowerSpecial) => mine.some((e) => e.special === s && e.until > now);
    sim.setIce(active('ice'));
    sim.turbo = active('turbo');
    const fog = active('fog');
    if (sim.beam && !active('beam')) sim.removeBeam();
    for (const e of mine) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      apply(e, time);
    }
    sim.advance(dt);
    const events = sim.drain();
    // Vor dem Ziel noch ein letzter Schnappschuss, damit die Auflösung den Siegerturm genau so zeigt.
    if (time - lastSent >= FRAME_MS || events.some((e) => e.type === 'finish')) {
      lastSent = time;
      const frame = sim.frame(now, fog ? FX_FOG : 0, fog);
      // Der eigene Turm geht nicht zurück; für die Auflösung liegt er trotzdem im Feed.
      if (me) towerFeed.push(me, frame);
      if (client.status === 'open') client.send({ type: 'tower_frame', frame });
    }
    for (const ev of events) {
      if (ev.type === 'special') client.send({ type: 'tower_mark', height: ev.height, piece: ev.index });
      else if (ev.type === 'mark') client.send({ type: 'tower_mark', height: ev.height });
      else if (ev.type === 'finish') client.send({ type: 'tower_finish', height: ev.height });
    }
    if (time - lastUi >= 90) {
      lastUi = time;
      const fx = sim.effectFlags();
      ui = { height: sim.height, hold: sim.holdMs / 3000, next: sim.peekNext(), glue: (fx & FX_GLUE) !== 0, boulder: (fx & FX_BOULDER) !== 0, fog };
      if (notice && time > notice.until) notice = null;
    }
  }

  const myScene = (): TowerScene | null =>
    sim && {
      stones: sim.stones(),
      height: sim.height,
      goal: round.goalHeight,
      marks: round.marks,
      reached: round.marks.filter((m) => sim.height >= m || (me ? round.players[me]?.marks.includes(m) : false)),
      color: myColor,
      fx: sim.effectFlags(),
      hold: sim.holdMs / 3000,
      fog: ui.fog,
      gust,
    };

  const handlers = {
    move: (dir: -1 | 1) => sim?.move(dir),
    rotate: () => sim?.rotate(),
    fast: (on: boolean) => sim && (sim.fast = on),
  };

  function onKey(e: KeyboardEvent) {
    if (!sim) return;
    if (e.key === 'ArrowLeft') handlers.move(-1);
    else if (e.key === 'ArrowRight') handlers.move(1);
    else if (e.key === 'ArrowUp' || e.key === ' ') handlers.rotate();
    else if (e.key === 'ArrowDown') handlers.fast(true);
    else return;
    e.preventDefault();
  }
  function onKeyUp(e: KeyboardEvent) {
    if (sim && e.key === 'ArrowDown') handlers.fast(false);
  }

  // Vorschau des nächsten Steins.
  let previewCanvas = $state<HTMLCanvasElement | null>(null);
  $effect(() => {
    const c = previewCanvas;
    const form = ui.next;
    if (!c || ui.fog) return;
    const ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    if (ctx) drawPreview(ctx, c.clientWidth, c.clientHeight, dpr, form, myColor, 0);
  });

  /** Ziele für Störer: alle anderen, der Höchste zuerst. */
  const targets = $derived.by(() => {
    void towerFeed.version;
    return round.turnOrder
      .filter((id) => id !== me && round.players[id])
      .map((id) => ({ id, height: towerFeed.frame(id, round.startedAt)?.h ?? round.players[id]?.height ?? 0 }))
      .sort((a, b) => b.height - a.height);
  });

  function useSpecial(special: TowerSpecial, targetId?: string) {
    client.send({ type: 'tower_special_use', special, ...(targetId ? { targetId } : {}) });
  }

  const myEffects = $derived(round.effects.filter((e) => e.target === me && e.until > clock.now && TOWER_SPECIALS[e.special].durationMs > 0));

  // ---------------------------------------------------------- Übersicht: alle Türme

  const builders = $derived(round.turnOrder.filter((id) => round.players[id]));
  const heightOf = (id: string): number => {
    void towerFeed.version;
    return towerFeed.frame(id, round.startedAt)?.h ?? round.players[id]?.height ?? 0;
  };
  const holdOf = (id: string): number => {
    void towerFeed.version;
    return towerFeed.frame(id, round.startedAt)?.hold ?? 0;
  };
  const leader = $derived.by(() => {
    void towerFeed.version;
    let best: string | null = null;
    let h = 0.5;
    for (const id of builders) {
      const v = heightOf(id);
      if (v > h) {
        h = v;
        best = id;
      }
    }
    return best;
  });
  const cols = $derived(builders.length <= 6 ? Math.max(1, builders.length) : Math.ceil(builders.length / 2));
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

  const effectsOn = (id: string) => round.effects.filter((e) => e.target === id && e.until > clock.now);
  const ticker = $derived(round.effects.filter((e) => e.until > clock.now).slice(-3).reverse());
</script>

<svelte:window onkeydown={onKey} onkeyup={onKeyUp} />

{#if sim}
  <div class="-mx-2 flex flex-col gap-2" style="height: calc(100dvh - 5.75rem)">
    <!-- Kopfzeile: Höhe, Gegner, Vorschau -->
    <div class="flex items-stretch gap-2">
      <div class="flex min-w-0 flex-1 flex-col justify-center rounded-2xl bg-slate-900 px-3 py-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500">Höhe</span>
          <span class="font-mono text-lg font-black">{formatMeters(ui.height)}<span class="text-sm text-slate-500">&nbsp;/ {round.goalHeight} m</span></span>
        </div>
        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div class="h-full rounded-full transition-[width] duration-200" style="width:{Math.min(100, (ui.height / round.goalHeight) * 100)}%; background:{myColor}"></div>
        </div>
        <div class="mt-1 flex items-center gap-2 overflow-hidden">
          {#each targets.slice(0, 4) as t (t.id)}
            <span class="inline-flex shrink-0 items-center gap-1 text-xs text-slate-400"><PlayerHead {view} id={t.id} size={16} />{formatMeters(t.height)}</span>
          {/each}
        </div>
      </div>
      <div class="flex w-[4.5rem] flex-col items-center justify-center rounded-2xl bg-slate-900 px-1 py-1">
        <span class="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-500">Nächster</span>
        {#if ui.fog}
          <span class="flex h-11 w-11 items-center justify-center text-slate-500"><TowerIcon special="fog" size={26} /></span>
        {:else}
          <canvas bind:this={previewCanvas} class="h-11 w-11"></canvas>
        {/if}
      </div>
      {#if client.isHost}
        <div class="flex items-center"><EndCategoryButton {view} label="Beenden" title="Das Rennen endet sofort, gewertet wird nach Höhe." /></div>
      {/if}
    </div>

    <!-- Spielfläche mit Gesten -->
    <div class="relative min-h-0 flex-1 overflow-hidden rounded-3xl shadow-[0_10px_30px_-12px_rgba(30,60,110,0.45)]" use:towerGestures={handlers}>
      <TowerCanvas class="h-full w-full" scene={myScene} onTick={tick} worldWidth={13} headroom={9.5} />
      <div class="pointer-events-none absolute inset-x-0 top-2 flex flex-col items-center gap-1.5 px-2">
        {#if notice}
          <div class="tower-pop flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-sm font-black text-slate-800 shadow-lg">
            <TowerIcon special={notice.special} size={18} class="text-sky-600" />{notice.text}
          </div>
        {/if}
        {#if ui.glue || ui.boulder || myEffects.length > 0}
          <div class="flex flex-wrap justify-center gap-1.5">
            {#if ui.glue}<span class="fx-chip text-amber-700"><TowerIcon special="glue" size={14} />Kleber bereit</span>{/if}
            {#if ui.boulder}<span class="fx-chip text-rose-700"><TowerIcon special="boulder" size={14} />Brocken kommt</span>{/if}
            {#each myEffects as e (e.id)}
              <span class="fx-chip text-sky-800"><TowerIcon special={e.special} size={14} />{TOWER_SPECIALS[e.special].name} {Math.max(0, Math.ceil((e.until - clock.now) / 1000))} s</span>
            {/each}
          </div>
        {/if}
      </div>
      {#if ui.hold > 0 && view.phase === 'playing'}
        <div class="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span class="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-black text-white shadow-lg">Ruhig halten … {formatMeters(Math.max(0, 3 - ui.hold * 3))} s</span>
        </div>
      {/if}
    </div>

    <TowerControls
      {view}
      stock={round.my?.stock ?? null}
      {targets}
      disabled={view.phase !== 'playing'}
      onMove={handlers.move}
      onRotate={handlers.rotate}
      onFast={handlers.fast}
      onUse={useSpecial}
    />
  </div>
{:else}
  <!-- Übersicht: Fernseher und moderierender Host -->
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm text-slate-400">Hochstapler · Ziellinie {TOWER_GOAL_LABELS[round.options.goal]}</p>
        <h2 class="font-black {readonly ? 'text-3xl' : 'text-2xl'}">Wer steht zuerst {round.goalHeight} m hoch?</h2>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        {#each ticker as e (e.id)}
          <span class="tower-pop inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm font-semibold">
            <PlayerHead {view} id={e.by} size={18} />
            <TowerIcon special={e.special} size={16} class="text-sky-500" />
            {TOWER_SPECIALS[e.special].name}
            {#if e.target !== e.by}<span class="text-slate-500">→</span><PlayerHead {view} id={e.target} size={18} />{playerName(view, e.target)}{/if}
          </span>
        {/each}
        {#if !readonly}<EndCategoryButton {view} label="Rennen beenden" title="Das Rennen endet sofort, gewertet wird nach Höhe." />{/if}
      </div>
    </div>

    <div class="grid gap-3" style="grid-template-columns: repeat({readonly ? cols : Math.min(2, builders.length)}, minmax(0, 1fr))">
      {#each builders as id (id)}
        {@const h = heightOf(id)}
        <div class="flex min-w-0 flex-col overflow-hidden rounded-3xl border bg-slate-900 {leader === id ? 'border-amber-400' : 'border-slate-800'}">
          <div class={readonly ? 'fit-media' : ''}>
            <TowerCanvas
              class="w-full"
              style={readonly ? `height: calc(${Math.round(68 / rows)}dvh * var(--fit-media, 1))` : 'height: 42dvh'}
              scene={remoteScene(id)}
              worldWidth={13}
              headroom={5}
              minVisible={round.goalHeight + 4}
              labels={builders.length <= 4}
            />
          </div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
            <PlayerHead {view} {id} size={readonly ? 30 : 24} />
            <span class="min-w-0 flex-1 truncate font-bold">{playerName(view, id)}</span>
            <span class="whitespace-nowrap font-mono font-black {holdOf(id) > 0 ? 'text-emerald-400' : ''}">{formatMeters(h)} m</span>
            {#if effectsOn(id).length > 0 || round.players[id]?.hasStock}
              <span class="flex basis-full flex-wrap items-center gap-x-2 gap-y-0.5 {readonly ? '' : 'text-sm'}">
                {#each effectsOn(id) as e (e.id)}
                  <span class="inline-flex items-center gap-1 whitespace-nowrap text-sky-500" title={TOWER_SPECIALS[e.special].name}
                    ><TowerIcon special={e.special} size={16} />{#if readonly && builders.length <= 3}<span class="text-sm font-semibold">{TOWER_SPECIALS[e.special].name}</span>{/if}</span
                  >
                {/each}
                {#if round.players[id]?.hasStock}<span class="ml-auto whitespace-nowrap text-xs font-semibold text-amber-500" title="Spezial im Vorrat">★ Spezial</span>{/if}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .fx-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.88);
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 800;
    box-shadow: 0 4px 12px -6px rgba(20, 40, 80, 0.5);
  }
  .tower-pop {
    animation: tower-pop 260ms ease-out;
  }
  @keyframes tower-pop {
    0% {
      transform: translateY(-6px) scale(0.92);
      opacity: 0;
    }
    100% {
      transform: none;
      opacity: 1;
    }
  }
</style>
