<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    FX_BOULDER,
    FX_FOG,
    FX_GLUE,
    specialTargetsOthers,
    STONE_FALLING,
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
  import TowerAlert from './TowerAlert.svelte';
  import TowerOffer from './TowerOffer.svelte';
  import TowerCanvas from './TowerCanvas.svelte';
  import TowerControls, { towerGestures } from './TowerControls.svelte';
  import TowerCountdown from './TowerCountdown.svelte';
  import TowerHold from './TowerHold.svelte';
  import TowerHud from './TowerHud.svelte';
  import TowerMenu from './TowerMenu.svelte';
  import TowerNotice, { noticeStrong, type TowerNoticeItem } from './TowerNotice.svelte';
  import TowerOverview from './TowerOverview.svelte';
  import TowerRail from './TowerRail.svelte';
  import { TowerSim } from './TowerSim.ts';
  import TowerSpecialCard from './TowerSpecialCard.svelte';
  import TowerTarget from './TowerTarget.svelte';
  import { type TowerScene } from './towerDraw.ts';
  import { towerFeed } from './towerFeed.svelte.ts';
  import { towerCastFeedback, towerEffectFeedback, towerOfferFeedback, towerSimFeedback } from './towerFeedback.ts';
  import { groupOf, toneOf } from './towerStyle.ts';
  import type { TickerItem } from './towerTicker.ts';
  import { TickerList } from './towerTickerList.svelte.ts';

  /**
   * Hochstapler. Am Handy: der eigene Turm mit Physik im Vollbild, eine dünne HUD-Zeile oben, flache Steuerleiste
   * unten mit der Zauber-Taste in der Mitte. Alles andere (Angebot, Meldungen, Alarm) bleibt schmal am Rand.
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

  /** `fall`: Lage des fallenden Steins (−1 links, 0 Mitte, 1 rechts), damit Meldungen ausweichen. */
  let ui = $state({ height: 0, hold: 0, next: 0, glue: false, boulder: false, fog: false, fall: 0 });
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
      const x = sim.stones().find((s) => s.flags & STONE_FALLING)?.x ?? 0;
      const fall = x < -1.2 ? -1 : x > 1.2 ? 1 : 0;
      ui = { height: sim.height, hold: sim.holdMs / 3000, next: sim.peekNext(), glue: (fx & FX_GLUE) !== 0, boulder: (fx & FX_BOULDER) !== 0, fog, fall };
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


  // ------------------------------------------------------------- Handy: Vollbild und HUD

  // Solange das Spielfeld den Bildschirm hat, scrollt und federt nichts darunter.
  onMount(() => {
    if (!sim) return;
    document.documentElement.classList.add('tower-lock');
    return () => document.documentElement.classList.remove('tower-lock');
  });

  /** Gemessene Höhen der Leisten oben und unten; die Kamera hält die Turmspitze und den Sockel davon frei. */
  let topHeight = $state(0);
  let bottomHeight = $state(0);
  const topInset = $derived(topHeight > 0 ? topHeight + 6 : 0);
  const bottomInset = $derived(bottomHeight > 0 ? bottomHeight + 8 : 0);

  /** Nur Gesten: Knöpfe eingeklappt, die Zauber-Taste schwebt. Wird je Gerät gemerkt. */
  const GESTURES_KEY = 'quiz:tower:gestures';
  const HINT_KEY = 'quiz:tower:hint';
  const readStore = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const writeStore = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // privater Modus: dann eben nicht gemerkt
    }
  };
  let gestures = $state(readStore(GESTURES_KEY) === '1');
  function setGestures(on: boolean) {
    gestures = on;
    writeStore(GESTURES_KEY, on ? '1' : '0');
  }
  /** Gesten-Hinweis im Countdown nur beim allerersten Rennen auf diesem Gerät. */
  const showHint = readStore(HINT_KEY) !== '1';
  if (showHint && sim) writeStore(HINT_KEY, '1');

  let menuOpen = $state(false);

  const stock = $derived(round.my?.stock ?? null);
  let picking = $state<TowerSpecial | null>(null);
  $effect(() => {
    // Vorrat weg (eingesetzt oder Runde vorbei): Zielwahl schließen.
    if (picking && stock !== picking) untrack(() => (picking = null));
  });
  function tapSpecial() {
    if (!stock || !started) return;
    if (!specialTargetsOthers(stock)) useSpecial(stock);
    else if (targets.length === 1) useSpecial(stock, targets[0]!.id);
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
  /** Dunkle Magie per Tipp auf einen Kopf in der Höhenleiste. */
  function railPick(id: string) {
    if (darkStock && started) useSpecial(darkStock, id);
  }
  const shielded = $derived(me ? (round.players[me]?.shielded ?? false) : false);

  /** Platz live: eigener Turm gegen die letzten Frames der anderen. */
  const rank = $derived(1 + targets.filter((t) => t.height > ui.height + 0.05).length);
  const total = $derived(targets.length + 1);
  const showRank = $derived(total > 1 && (ui.height > 0.3 || targets.some((t) => t.height > 0.3)));
  const myMarks = $derived(me ? (round.players[me]?.marks ?? []) : []);
  const nextMark = $derived(round.marks.find((m) => m > ui.height && !myMarks.includes(m)) ?? null);
  /** Weg von der letzten Marke unter mir bis zur nächsten, 0 bis 1: der Ring um die leere Zauber-Taste. */
  const markProgress = $derived.by(() => {
    if (nextMark === null) return 0;
    const from = Math.max(0, ...round.marks.filter((m) => m < nextMark));
    return (ui.height - from) / Math.max(0.5, nextMark - from);
  });

  /** Laufende Effekte auf mir mit Restzeit; Kleber und Brocken zeigt das HUD, solange sie scharf sind. */
  const myEffects = $derived(
    round.effects
      .filter((e) => e.target === me && !e.blocked && e.until > clock.now && TOWER_SPECIALS[e.special].durationMs > 0)
      .map((e) => ({ id: e.id, special: e.special, value: (e.until - clock.now) / Math.max(1, e.until - e.at) })),
  );

  const railEntries = $derived([
    ...targets.map((t) => ({ id: t.id, height: t.height, color: t.color, holding: t.holding, shielded: t.shielded })),
    ...(me ? [{ id: me, height: ui.height, color: myColor }] : []),
  ]);

  // Meldungen: höchstens eine. Trifft mich ein Zauber, verdrängt das alles andere; Marken und „hält“ (dafür gibt es
  // den Alarm) kommen gar nicht, vom eigenen Turm nur die Führung und die eigenen Zauber.
  const ticker = new TickerList(2600, 1);
  let hit = $state<TowerNoticeItem | null>(null);
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
      const keep = (i: TickerItem) => {
        if (i.kind === 'mark' || i.kind === 'hold') return false;
        if (i.kind === 'effect') return i.target !== me;
        return i.player !== me || i.kind === 'lead';
      };
      const fresh = ticker.feed(input, keep);
      for (const i of fresh) if (i.kind === 'effect' && i.target === me && i.player !== me) hit = { id: i.id, kind: 'hit', at: i.at, by: i.player, special: i.special, blocked: i.blocked };
    });
  });
  $effect(() => {
    void clock.now;
    untrack(() => {
      const t = performance.now();
      ticker.prune(t);
      if (hit && t - hit.at > 2800) hit = null;
    });
  });
  /** Die eine sichtbare Meldung. Während eines Alarms nur, was mich direkt betrifft. */
  const notice = $derived.by((): TowerNoticeItem | null => {
    const n = hit ?? ticker.items[0] ?? null;
    if (n && holder && !noticeStrong(n, me)) return null;
    return n;
  });
  /** Meldungen weichen dem fallenden Stein aus: fällt er links, steht die Meldung rechts. */
  const noticeAlign = $derived<'left' | 'right'>(ui.fall < 0 ? 'right' : 'left');
</script>

{#if sim}
  <div class="tower-full fixed inset-0 z-40 flex select-none justify-center overflow-hidden bg-[#0b1220]">
    <!-- Spielfläche mit Gesten über den ganzen Bildschirm (auf breiten Schirmen als Hochformat-Spalte);
         alles andere liegt schmal am Rand darüber -->
    <div class="field relative h-full w-full max-w-[min(100%,72dvh)] overflow-hidden {shielded ? 'field-shield' : ''} {holder ? 'field-alarm' : ''}" use:towerGestures={handlers}>
      <TowerCanvas class="h-full w-full" scene={myScene} onTick={tick} worldWidth={13} headroom={9.5} insetBottom={bottomInset} insetTop={topInset} />

      {#key hit?.id}
        {#if hit && hit.kind === 'hit' && !hit.blocked}
          <div class="hit-flash pointer-events-none absolute inset-0" style="--c:{toneOf(hit.special).glow}"></div>
        {/if}
      {/key}

      <!-- Oben: eine dünne Zeile -->
      <div class="pointer-events-none absolute inset-x-0 top-0 z-20 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]" bind:clientHeight={topHeight}>
        <TowerHud
          height={ui.height}
          goal={round.goalHeight}
          {rank}
          {total}
          {showRank}
          effects={myEffects}
          glue={ui.glue}
          boulder={ui.boulder}
          next={ui.next}
          color={myColor}
          fog={ui.fog}
          offline={client.status !== 'open'}
          onMenu={() => (menuOpen = true)}
        />
      </div>

      <!-- Darunter: höchstens eine Meldung, schmal und seitlich (weicht dem fallenden Stein aus) -->
      <div class="pointer-events-none absolute inset-x-0 z-20 flex flex-col gap-1 pl-2 pr-8" style="top:{topHeight + 6}px">
        {#key notice?.id}
          {#if notice}
            <TowerNotice {view} item={notice} {me} align={noticeAlign} />
          {/if}
        {/key}
      </div>

      <!-- Rechts: Höhenrennen als schmaler Strich -->
      {#if total > 1}
        <div class="pointer-events-none absolute right-1 z-10 w-6" style="top:{topHeight + 22}px; bottom:{bottomHeight + 18}px">
          <TowerRail {view} goal={round.goalHeight} marks={round.marks} entries={railEntries} {me} vertical head={16} armed={!!darkStock && started} onPick={railPick} />
        </div>
      {/if}

      {#if ui.hold > 0 && view.phase === 'playing'}
        <div class="pointer-events-none absolute inset-x-0 z-10 flex justify-center" style="top:{topHeight + 40}px">
          <TowerHold hold={ui.hold} size={88} />
        </div>
      {/if}

      <!-- Unten: Halte-Alarm (mit Ein-Tipp-Zauber am Daumen) und Angebot als schmale Leisten, darunter die
           Steuerleiste mit der Zauber-Taste in der Mitte. Oben fällt der neue Stein, dort bleibt es frei. -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-30" bind:clientHeight={bottomHeight}>
        {#if holder && view.phase === 'playing'}
          <div class="flex justify-center px-2 pb-1.5">
            <TowerAlert {view} holder={holder.id} hold={holder.hold} shielded={holder.shielded} dark={darkStock} offerOpen={offer !== null} onStrike={strike} />
          </div>
        {/if}
        {#if choosing && offer}
          <div class="pointer-events-auto px-2 pb-1.5">
            <TowerOffer {offer} {stock} urge={holder !== null} onChoose={choose} />
          </div>
        {/if}
        {#if gestures}
          <div class="flex justify-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div class="float pointer-events-auto rounded-full">{@render magic()}</div>
          </div>
        {/if}
        <div class={gestures ? '' : 'strip pointer-events-auto px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2'}>
          <TowerControls disabled={!started} hidden={gestures} center={magic} onMove={handlers.move} onRotate={handlers.rotate} onFast={handlers.fast} />
        </div>
      </div>

      {#if picking}
        <TowerTarget {view} special={picking} {targets} bottom={bottomHeight + 6} onPick={pick} onCancel={() => (picking = null)} />
      {/if}

      {#if menuOpen}
        <TowerMenu {view} {gestures} onGestures={setGestures} onClose={() => (menuOpen = false)} />
      {/if}

      {#if clock.now > 0 && clock.now < round.goAt + 1000}
        <TowerCountdown goAt={round.goAt} now={clock.now} goal={round.goalHeight} hint={showHint} />
      {/if}
    </div>
  </div>
{:else}
  <TowerOverview {view} {round} {readonly} />
{/if}

{#snippet magic()}
  <TowerSpecialCard {stock} {nextMark} progress={markProgress} disabled={!started} onTap={tapSpecial} />
{/snippet}

<style>
  :global(html.tower-lock),
  :global(html.tower-lock body) {
    overflow: hidden;
    overscroll-behavior: none;
  }
  .tower-full {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  /* Steuerleiste: dunkles Glas, die Landschaft schimmert durch. */
  .strip {
    background: linear-gradient(180deg, rgba(8, 12, 26, 0.5), rgba(8, 12, 26, 0.72));
    backdrop-filter: blur(14px) saturate(1.2);
    -webkit-backdrop-filter: blur(14px) saturate(1.2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  .float {
    background: rgba(10, 16, 30, 0.55);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  /* Schutzschild aktiv: goldener Saum um das Spielfeld. */
  .field-shield::after,
  .field-alarm::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 5;
  }
  .field-shield::after {
    box-shadow:
      inset 0 0 0 2px rgba(255, 214, 110, 0.85),
      inset 0 0 28px -6px rgba(250, 196, 70, 0.65);
    animation: shield 2.4s ease-in-out infinite;
  }
  /* Ein Gegner hält über der Linie: grünes Leuchten vom Rand. */
  .field-alarm::before {
    box-shadow: inset 0 0 36px 4px rgba(62, 224, 143, 0.55);
    animation: alarm 900ms ease-in-out infinite;
  }
  /* Mich trifft ein Zauber: kurzes Aufleuchten vom Rand in seiner Farbe (statt eines großen Banners). */
  .hit-flash {
    z-index: 6;
    box-shadow: inset 0 0 60px 10px var(--c);
    animation: hit 900ms ease-out forwards;
  }
  @keyframes shield {
    50% {
      box-shadow:
        inset 0 0 0 3px rgba(255, 230, 150, 1),
        inset 0 0 40px -4px rgba(250, 196, 70, 0.6);
    }
  }
  @keyframes alarm {
    50% {
      box-shadow: inset 0 0 50px 10px rgba(62, 224, 143, 0.75);
    }
  }
  @keyframes hit {
    to {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .field-shield::after,
    .field-alarm::before {
      animation: none;
    }
  }
</style>
