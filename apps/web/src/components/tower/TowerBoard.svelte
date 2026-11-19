<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    FX_BOULDER,
    FX_FOG,
    FX_GLUE,
    specialTargetsOthers,
    TOWER_SPECIALS,
    type RoomView,
    type TowerEffectView,
    type TowerRoundView,
    type TowerSide,
    type TowerSpecial,
  } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerColor } from '../../lib/format.ts';
  import { FrameClock } from '../../lib/frameClock.svelte.ts';
  import EndCategoryButton from '../EndCategoryButton.svelte';
  import TowerAlert from './TowerAlert.svelte';
  import TowerBadge from './TowerBadge.svelte';
  import TowerOffer from './TowerOffer.svelte';
  import TowerCanvas from './TowerCanvas.svelte';
  import TowerControls, { towerGestures } from './TowerControls.svelte';
  import TowerCountdown from './TowerCountdown.svelte';
  import TowerHold from './TowerHold.svelte';
  import TowerNext from './TowerNext.svelte';
  import TowerOverview from './TowerOverview.svelte';
  import TowerRail from './TowerRail.svelte';
  import TowerRing from './TowerRing.svelte';
  import { TowerSim } from './TowerSim.ts';
  import TowerSpecialCard from './TowerSpecialCard.svelte';
  import TowerTarget from './TowerTarget.svelte';
  import TowerTickerFeed from './TowerTickerFeed.svelte';
  import TowerToast from './TowerToast.svelte';
  import { type TowerScene } from './towerDraw.ts';
  import { towerFeed } from './towerFeed.svelte.ts';
  import { towerCastFeedback, towerEffectFeedback, towerOfferFeedback, towerSimFeedback } from './towerFeedback.ts';
  import { GOLD, groupOf, meters } from './towerStyle.ts';
  import type { TickerItem } from './towerTicker.ts';
  import { TickerList } from './towerTickerList.svelte.ts';

  /**
   * Hochstapler. Am Handy: der eigene Turm mit Physik, Steuerung und einem schlanken HUD über dem Spielfeld.
   * Am Fernseher (`readonly`) und für den moderierenden Host: alle Türme in der Übersicht (TowerOverview).
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
  let latest: { effects: TowerEffectView[]; playing: boolean; goAt: number } = { effects: [], playing: false, goAt: 0 };
  $effect(() => {
    latest = { effects: round.effects, playing: view.phase === 'playing', goAt: round.goAt };
  });

  let ui = $state({ height: 0, hold: 0, next: 0, glue: false, boulder: false, fog: false });
  let gust: { at: number; dir: number } | null = null;
  let lastSent = 0;
  let lastUi = 0;
  const seen = new Set<number>();

  function apply(e: TowerEffectView, time: number) {
    if (!sim) return;
    towerEffectFeedback(e, me);
    // Vom Schutzschild abgefangen: wirkt nicht.
    if (e.blocked) return;
    const dir = e.id % 2 === 0 ? 1 : -1;
    sim.applySpecial(e.special, dir);
    if (e.special === 'gust') gust = { at: time, dir };
  }

  function tick(dt: number, time: number) {
    // Vor „Los!“ (Start-Countdown, Serverzeit) fällt nichts.
    if (!sim || !latest.playing || client.serverNow() < latest.goAt) return;
    const now = client.serverNow();
    // Abgefangene Zauber laufen trotzdem durch `apply` (Klang „Schild blockt“), wirken aber nie.
    const mine = latest.effects.filter((e) => e.target === me);
    const active = (s: TowerSpecial) => mine.some((e) => e.special === s && !e.blocked && e.until > now);
    sim.setIce(active('ice'));
    sim.turbo = active('turbo');
    sim.shield = active('shield');
    const fog = active('fog');
    if (sim.beam && !active('beam')) sim.removeBeam();
    for (const e of mine) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      apply(e, time);
    }
    sim.advance(dt);
    const events = sim.drain();
    towerSimFeedback(events);
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

  /** Läuft das Rennen schon (nach dem Countdown)? */
  const started = $derived(view.phase === 'playing' && clock.now >= round.goAt);

  const handlers = {
    move: (dir: -1 | 1) => started && sim?.move(dir),
    rotate: () => started && sim?.rotate(),
    fast: (on: boolean) => sim && (sim.fast = on && started),
  };

  // Klang zu Zauber-Angebot und Wahl (reagiert nur auf Wechsel). Tastatur steuert TowerControls.
  $effect(() => {
    if (sim) towerOfferFeedback(round.my?.offer ?? null, round.my?.stock ?? null);
  });

  /** Ziele für Störer: alle anderen, der Höchste zuerst. */
  const targets = $derived.by(() => {
    void towerFeed.version;
    return round.turnOrder
      .filter((id) => id !== me && round.players[id])
      .map((id) => {
        const f = towerFeed.frame(id, round.startedAt);
        return { id, height: f?.h ?? round.players[id]?.height ?? 0, color: colorOf(id), holding: (f?.hold ?? 0) > 0, hold: f?.hold ?? 0, shielded: round.players[id]?.shielded ?? false };
      })
      .sort((a, b) => b.height - a.height);
  });

  function useSpecial(special: TowerSpecial, targetId?: string) {
    towerCastFeedback();
    client.send({ type: 'tower_special_use', special, ...(targetId ? { targetId } : {}) });
  }

  // ------------------------------------------------------------- Handy: HUD

  /** Höhe der Karten unten im Spielfeld; die Kamera hebt den Turm darüber, damit nichts verdeckt baut. */
  let bottomHeight = $state(0);
  const bottomInset = $derived(bottomHeight > 0 ? bottomHeight + 8 : 0);

  const stock = $derived(round.my?.stock ?? null);
  let picking = $state<TowerSpecial | null>(null);
  $effect(() => {
    // Vorrat weg (eingesetzt oder Runde vorbei): Zielwahl schließen.
    if (picking && stock !== picking) untrack(() => (picking = null));
  });
  function tapSpecial() {
    if (!stock || !started) return;
    if (!specialTargetsOthers(stock)) useSpecial(stock);
    else if (targets.length > 0) picking = stock;
  }
  function pick(id: string) {
    if (picking) useSpecial(picking, id);
    picking = null;
  }

  // Magie-Angebot an Marken und Spezialsteinen: hell oder dunkel, genau eins.
  const offer = $derived(round.my?.offer ?? null);
  const choosing = $derived(offer !== null && view.phase === 'playing');
  function choose(side: TowerSide) {
    client.send({ type: 'tower_choose', side });
  }

  /** Gegner, der gerade über der Linie hält (der knappste zuerst): Jetzt zählt dunkle Magie. */
  const holder = $derived(started ? ([...targets].filter((t) => t.holding).sort((a, b) => b.hold - a.hold)[0] ?? null) : null);
  const darkStock = $derived(stock && groupOf(stock) === 'dark' ? stock : null);
  function strike() {
    if (darkStock && holder) useSpecial(darkStock, holder.id);
  }
  const shielded = $derived(me ? (round.players[me]?.shielded ?? false) : false);

  /** Platz live: eigener Turm gegen die letzten Frames der anderen. */
  const rank = $derived(1 + targets.filter((t) => t.height > ui.height + 0.05).length);
  const total = $derived(targets.length + 1);
  const gap = $derived(round.goalHeight - ui.height);
  const nextMark = $derived(round.marks.find((m) => m > ui.height && !(me && round.players[me]?.marks.includes(m))) ?? null);

  /** Laufende Effekte auf mir mit Restzeit; Kleber und Brocken solange sie scharf sind. */
  const myEffects = $derived(round.effects.filter((e) => e.target === me && !e.blocked && e.until > clock.now && TOWER_SPECIALS[e.special].durationMs > 0));

  const railEntries = $derived([
    ...targets.map((t) => ({ id: t.id, height: t.height, color: t.color })),
    ...(me ? [{ id: me, height: ui.height, color: myColor }] : []),
  ]);

  // Ticker und Banner: Was mich trifft, kommt groß als Banner, der Rest dezent als Meldung.
  const ticker = new TickerList(4200, 2);
  let toasts = $state<{ id: number; by: string; special: TowerSpecial; blocked: boolean; at: number }[]>([]);
  $effect(() => {
    if (!sim) return;
    const ids = round.turnOrder.filter((id) => round.players[id]);
    const heights: Record<string, number> = Object.fromEntries(targets.map((t) => [t.id, t.height]));
    const holds: Record<string, number> = {};
    void towerFeed.version;
    for (const t of targets) holds[t.id] = towerFeed.frame(t.id, round.startedAt)?.hold ?? 0;
    if (me) {
      heights[me] = ui.height;
      holds[me] = 0;
    }
    const input = {
      now: performance.now(),
      goal: round.goalHeight,
      players: ids,
      heights,
      holds,
      marks: Object.fromEntries(ids.map((id) => [id, round.players[id]?.marks ?? []])),
      effects: round.effects,
    };
    untrack(() => {
      towerFeed.noteSpells(round.startedAt, input.effects);
      // Eigene Höhe sieht man ohnehin; vom eigenen Turm meldet der Ticker nur die Führung.
      const keep = (i: TickerItem) => (i.player === me ? i.kind === 'lead' || (i.kind === 'effect' && i.target !== me) : !(i.kind === 'effect' && i.target === me));
      const fresh = ticker.feed(input, keep);
      for (const i of fresh) if (i.kind === 'effect' && i.target === me && i.player !== me) toasts = [...toasts, { id: i.id, by: i.player, special: i.special, blocked: i.blocked, at: i.at }].slice(-1);
    });
  });
  $effect(() => {
    void clock.now;
    untrack(() => {
      const t = performance.now();
      ticker.prune(t);
      if (toasts.some((x) => t - x.at > 2600)) toasts = toasts.filter((x) => t - x.at <= 2600);
    });
  });
</script>

{#if sim}
  <div class="-mx-2 flex flex-col gap-2" style="height: calc(100dvh - 5.75rem)">
    <!-- Spielfläche mit Gesten, HUD liegt darüber -->
    <div class="field relative min-h-0 flex-1 overflow-hidden rounded-[1.75rem] {shielded ? 'field-shield' : ''}" use:towerGestures={handlers}>
      <TowerCanvas class="h-full w-full" scene={myScene} onTick={tick} worldWidth={13} headroom={9.5} insetBottom={bottomInset} />

      <!-- Oben: Höhe, Platz, nächster Stein -->
      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
        <div class="flex flex-col items-start gap-1.5">
          <div class="hud flex items-stretch overflow-hidden rounded-2xl text-white">
            <div class="px-3 pb-1.5 pt-1">
              <div class="flex items-baseline gap-1">
                <span class="font-mono text-[1.9rem] font-black leading-none tabular-nums">{meters(ui.height)}</span>
                <span class="text-sm font-bold text-white/60">m</span>
              </div>
              <div class="mt-0.5 text-[0.68rem] font-bold leading-tight text-white/65">
                {#if gap <= 0}
                  <span style="color:{GOLD}">über der Linie!</span>
                {:else}
                  noch <span class="text-white">{meters(gap)} m</span> bis {round.goalHeight} m
                {/if}
              </div>
            </div>
            {#if total > 1 && (ui.height > 0.3 || targets.some((t) => t.height > 0.3))}
              <div class="flex flex-col items-center justify-center border-l border-white/10 px-2.5 {rank === 1 ? 'bg-[rgba(246,196,83,0.14)]' : ''}">
                <span class="text-[1.35rem] font-black leading-none" style={rank === 1 ? `color:${GOLD}` : ''}>{rank}.</span>
                <span class="text-[0.6rem] font-bold text-white/55">von {total}</span>
              </div>
            {/if}
          </div>
          {#if ui.glue || ui.boulder || myEffects.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#if ui.glue}<span class="chip"><TowerBadge special="glue" size={22} />{TOWER_SPECIALS.glue.name} bereit</span>{/if}
              {#if ui.boulder}<span class="chip"><TowerBadge special="boulder" size={22} />{TOWER_SPECIALS.boulder.name} kommt</span>{/if}
              {#each myEffects as e (e.id)}
                <span class="chip">
                  <TowerRing value={(e.until - clock.now) / (e.until - e.at)} size={28} stroke={2.5}>
                    <TowerBadge special={e.special} size={22} />
                  </TowerRing>
                  {TOWER_SPECIALS[e.special].name}
                  <span class="font-mono tabular-nums text-white/70">{Math.max(0, Math.ceil((e.until - clock.now) / 1000))}</span>
                </span>
              {/each}
            </div>
          {/if}
        </div>
        <div class="flex flex-col items-end gap-2">
          <TowerNext form={ui.next} color={myColor} fog={ui.fog} />
        </div>
      </div>

      <!-- Rechts: Höhenrennen gegen die anderen -->
      {#if total > 1}
        <div class="rail pointer-events-none absolute bottom-24 right-2 top-[6.6rem] w-8 rounded-full px-1 pb-4 pt-5">
          <TowerRail {view} goal={round.goalHeight} marks={round.marks} entries={railEntries} {me} vertical head={22} />
        </div>
      {/if}

      <!-- Mitte: Alarm und Banner; links unter der Höhe dezent der Ticker -->
      <div class="pointer-events-none absolute inset-x-0 top-[6.5rem] flex flex-col items-center gap-2 px-3">
        {#if holder && view.phase === 'playing'}
          <TowerAlert {view} holder={holder.id} hold={holder.hold} shielded={holder.shielded} dark={darkStock} offerOpen={offer !== null} onStrike={strike} />
        {/if}
        {#each toasts as t (t.id)}
          <TowerToast {view} by={t.by} special={t.special} blocked={t.blocked} />
        {/each}
      </div>
      {#if !holder && toasts.length === 0}
        <div class="pointer-events-none absolute left-2.5 right-12 {myEffects.length > 0 || ui.glue || ui.boulder ? 'top-[8.4rem]' : 'top-[5.9rem]'}">
          <TowerTickerFeed {view} items={ticker.items} {me} glass size="sm" />
        </div>
      {/if}

      {#if ui.hold > 0 && view.phase === 'playing'}
        <div class="pointer-events-none absolute inset-0 grid place-items-center">
          <TowerHold hold={ui.hold} size={150} />
        </div>
      {/if}

      <!-- Unten: Zauber im Vorrat (bleibt auch während einer Wahl einsetzbar), darunter ein offenes Angebot -->
      <div class="absolute bottom-2 left-2 z-20 flex flex-col gap-2 {choosing ? 'right-2' : 'right-11'}" bind:clientHeight={bottomHeight}>
        {#if stock || !choosing}
          <div class="flex items-end gap-2 pl-0.5">
            <div class="max-w-[17rem] flex-1">
              <TowerSpecialCard {stock} {nextMark} disabled={!started} onTap={tapSpecial} compact={choosing} />
            </div>
            {#if client.isHost && !choosing}
              <div class="ml-auto" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <EndCategoryButton {view} label="Beenden" title="Das Rennen endet sofort, gewertet wird nach Höhe." />
              </div>
            {/if}
          </div>
        {/if}
        {#if choosing && offer}
          <TowerOffer {offer} {stock} urge={holder !== null} onChoose={choose} />
        {/if}
      </div>

      {#if picking}
        <TowerTarget {view} special={picking} {targets} goal={round.goalHeight} onPick={pick} onCancel={() => (picking = null)} />
      {/if}

      {#if clock.now > 0 && clock.now < round.goAt + 1000}
        <TowerCountdown goAt={round.goAt} now={clock.now} goal={round.goalHeight} />
      {/if}
    </div>

    <TowerControls disabled={!started} onMove={handlers.move} onRotate={handlers.rotate} onFast={handlers.fast} />
  </div>
{:else}
  <TowerOverview {view} {round} {readonly} />
{/if}

<style>
  .field {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.06),
      0 14px 34px -14px rgba(20, 40, 90, 0.55);
  }
  /* Schutzschild aktiv: goldener Saum um das Spielfeld. */
  .field-shield {
    box-shadow:
      inset 0 0 0 2px rgba(255, 214, 110, 0.9),
      inset 0 0 36px -6px rgba(250, 196, 70, 0.7),
      0 0 22px -4px rgba(250, 196, 70, 0.55);
  }
  .field-shield::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    box-shadow: inset 0 0 0 2px rgba(255, 214, 110, 0.9);
    animation: shield 2.4s ease-in-out infinite;
  }
  @keyframes shield {
    50% {
      box-shadow:
        inset 0 0 0 3px rgba(255, 230, 150, 1),
        inset 0 0 50px -4px rgba(250, 196, 70, 0.6);
    }
  }
  .hud {
    background: rgba(10, 16, 30, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow:
      inset 0 0 0 1px rgba(255, 255, 255, 0.14),
      0 8px 24px -12px rgba(5, 10, 25, 0.6);
  }
  .rail {
    background: linear-gradient(180deg, rgba(10, 16, 30, 0.42), rgba(10, 16, 30, 0.28));
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    padding: 0.15rem 0.6rem 0.15rem 0.2rem;
    font-size: 0.72rem;
    font-weight: 800;
    color: white;
    background: rgba(10, 16, 30, 0.6);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
  }
</style>
