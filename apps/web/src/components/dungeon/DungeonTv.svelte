<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { dungeonRanking, type DungeonDoorTry, type DungeonPlayerView, type DungeonRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import PlayerHead from '../PlayerHead.svelte';
  import DungeonMapExit from './DungeonMapExit.svelte';
  import DungeonScene from './DungeonScene.svelte';
  import DungeonTickerFeed from './DungeonTickerFeed.svelte';
  import { DUNGEON_STAGGER_MS, DUNGEON_SUSPENSE_MS } from './dungeonFeedback.ts';
  import { dungeonTicker, type DungeonTickerItem } from './dungeonTicker.ts';
  import { doorIcon, doorShort } from './doorLabel.ts';

  /**
   * Fernseher als Übertragung: oben Fragerunde und Phase mit Countdown, in der Mitte der Dungeon als Karte
   * (Räume als Kacheln, verbunden durch Gänge, am Ende das Tor ins Tageslicht), unten die Spieler mit Fortschritt
   * und Live-Status, daneben der Ticker. Richtig/falsch erscheint erst nach dem Spannungsmoment, wie in der Szene.
   */
  let { view, round }: { view: RoomView; round: DungeonRoundView } = $props();

  // ------------------------------------------------------------ Uhr und Spannung

  let now = $state(client.serverNow());
  let local = $state(performance.now());
  let timer: ReturnType<typeof setInterval> | null = null;
  onMount(() => {
    timer = setInterval(() => {
      now = client.serverNow();
      local = performance.now();
    }, 200);
  });
  onDestroy(() => timer && clearInterval(timer));

  /** Seit wann (Serverzeit) das Ergebnis steht; daraus folgt das Ende der Spannung, auch nach dem Neuladen. */
  const resultStart = $derived(round.stage === 'result' ? round.resultAt : null);
  const suspense = $derived(round.stage === 'result' && resultStart !== null && now < resultStart + DUNGEON_SUSPENSE_MS);

  /** Stand je Spieler, wie er gezeigt wird: während der Spannung noch vor dem Ergebnis. */
  function shown(id: string): DungeonPlayerView | undefined {
    const p = round.players[id];
    const r = round.results?.[id];
    if (!p || !r || !suspense) return p;
    return {
      ...p,
      room: r.room,
      status: 'in',
      exitRound: null,
      wrong: p.wrong - (r.correct ? 0 : 1),
    };
  }
  const ids = $derived(round.turnOrder.filter((id) => round.players[id]));
  const players = $derived(Object.fromEntries(ids.map((id) => [id, shown(id)!])) as Record<string, DungeonPlayerView>);
  const ranking = $derived(dungeonRanking(ids.map((id) => players[id]!)));
  const placeOf = (id: string) => ranking.find((x) => x.playerId === id)?.place ?? 0;
  /** Führend: allein vorn und schon aus Raum 1 heraus. */
  const leader = $derived.by(() => {
    const [a, b] = ranking;
    if (!a || (a.status !== 'out' && a.room === 0)) return null;
    if (b && b.place === a.place) return null;
    return a.playerId;
  });

  /** Spuren an den Türen, während der Spannung ohne die Versuche dieser Runde. */
  function triesOf(doorId: string, tries: DungeonDoorTry[]): DungeonDoorTry[] {
    if (!suspense || !round.results) return tries;
    const hide = Object.entries(round.results).filter(([, r]) => r.doorId === doorId).map(([id]) => id);
    const out = [...tries];
    for (const id of hide) {
      const i = out.findLastIndex((t) => t.playerId === id);
      if (i >= 0) out.splice(i, 1);
    }
    return out;
  }

  // ------------------------------------------------------------ Phase

  const active = $derived(ids.filter((id) => round.players[id]?.status === 'in' && !round.skipped.includes(id)));
  const waiting = $derived(
    round.stage === 'choosing' ? active.filter((id) => !round.walk[id]?.confirmed) : round.stage === 'answering' ? active.filter((id) => !round.answered.includes(id)) : [],
  );
  const phase = $derived.by((): { label: string; text: string } => {
    if (round.stage === 'choosing') return { label: 'Türwahl', text: waiting.length === 0 ? 'alle stehen bereit' : waiting.length === 1 ? '1 wählt noch' : `${waiting.length} wählen noch` };
    if (round.stage === 'answering') return { label: 'Alle antworten', text: waiting.length === 0 ? 'gleich geht es auf' : waiting.length === 1 ? 'noch 1 denkt nach' : `noch ${waiting.length} denken nach` };
    if (suspense) return { label: 'Ergebnis', text: 'die Türen öffnen sich …' };
    const res = Object.values(round.results ?? {});
    const right = res.filter((r) => r.correct).length;
    return { label: 'Ergebnis', text: res.length === 0 ? 'niemand war dran' : `${right} von ${res.length} kommen weiter` };
  });

  /** Live-Status je Spieler. */
  function statusOf(id: string): { text: string; tone: 'wait' | 'ok' | 'bad' | 'gold' | 'off' | 'busy' } {
    const p = players[id];
    if (!p) return { text: '', tone: 'off' };
    const res = round.stage === 'result' ? round.results?.[id] : undefined;
    if (res && suspense) return { text: 'Tür öffnet sich …', tone: 'busy' };
    if (res) {
      if (p.status === 'out') return { text: 'draußen!', tone: 'gold' };
      if (res.correct) return { text: 'richtig', tone: 'ok' };
      if (p.status === 'eliminated') return { text: 'sitzt fest', tone: 'bad' };
      return { text: 'falsch', tone: 'bad' };
    }
    if (p.status === 'out') return { text: `draußen · Platz ${placeOf(id)}`, tone: 'gold' };
    if (p.status === 'eliminated') return { text: 'sitzt fest', tone: 'off' };
    if (round.skipped.includes(id)) return { text: 'setzt aus', tone: 'off' };
    if (round.stage === 'choosing') {
      const w = round.walk[id];
      if (w?.confirmed) return { text: 'in der Tür', tone: 'ok' };
      return w?.doorId ? { text: 'geht zu einer Tür', tone: 'busy' } : { text: 'wählt …', tone: 'wait' };
    }
    if (round.stage === 'answering') return round.answered.includes(id) ? { text: '✓ geantwortet', tone: 'ok' } : { text: 'denkt nach …', tone: 'wait' };
    return { text: 'wartet', tone: 'off' };
  }

  // ------------------------------------------------------------ Ticker

  let ticker = $state<(DungeonTickerItem & { showAt: number })[]>([]);
  let prevRound: DungeonRoundView | null = null;
  let nextId = 1;
  const TICKER_TTL = 16000;
  $effect(() => {
    const next = round;
    untrack(() => {
      const fresh = dungeonTicker(prevRound, next);
      prevRound = next;
      if (fresh.length === 0) return;
      const t = performance.now();
      const start = next.resultAt ?? client.serverNow();
      const wait = Math.max(0, start + DUNGEON_SUSPENSE_MS - client.serverNow());
      const items = fresh.map((f, i) => ({ ...f.event, id: nextId++, at: t, result: f.result, showAt: t + (f.result ? wait + 500 + i * DUNGEON_STAGGER_MS * 2 : 0) }));
      ticker = [...items, ...ticker].slice(0, 14);
    });
  });
  const tickerShown = $derived(
    ticker
      .filter((x) => x.showAt <= local && local - x.showAt < TICKER_TTL)
      .sort((a, b) => b.showAt - a.showAt)
      .slice(0, 7),
  );

  // ------------------------------------------------------------ Karte

  let mapW = $state(0);
  let mapH = $state(0);
  const n = $derived(round.rooms.length);
  const twoRows = $derived(n >= 6);
  const cols = $derived(twoRows ? Math.ceil((n + 1) / 2) : n + 1);
  const maxDoors = $derived(Math.max(...round.rooms.map((d) => d.length)));

  /** Maße in px: Gang zwischen den Kacheln, Kopf über und Türliste unter jeder Kachel. */
  const layout = $derived.by(() => {
    const labelH = 26;
    const listH = twoRows ? 0 : maxDoors * 21 + 6;
    const gapY = twoRows ? 30 : 0;
    const rowH = twoRows ? (mapH - gapY) / 2 : mapH;
    const minGap = 30;
    // Ausgang etwas schmaler als ein Raum (einreihig), zweireihig füllt er den Rest der Reihe.
    const units = twoRows ? cols : n + 0.9;
    const colW = Math.max(40, (mapW - minGap * (cols - 1)) / units);
    const tileH0 = Math.max(60, rowH - labelH - listH);
    const tileH = Math.min(tileH0, colW * (twoRows ? 1.08 : 1.3));
    const tileW = Math.min(colW, tileH * 1.3);
    const gap = cols > 1 ? (mapW - tileW * units) / (cols - 1) : 0;
    return { labelH, listH, gapY, rowH, tileW, tileH, gap, blockH: labelH + tileH + listH };
  });

  /** Platz je Kachel (k = n ist der Ausgang): zweireihig als Schlange, die zweite Reihe läuft zurück. */
  function cell(k: number): { x: number; y: number; w: number } {
    const { tileW, gap, rowH, gapY, blockH } = layout;
    const top = (row: number) => row * (rowH + gapY) + Math.max(0, (rowH - blockH) / 2);
    if (!twoRows) return { x: k * (tileW + gap), y: top(0), w: k === n ? tileW * 0.9 : tileW };
    if (k < cols) return { x: k * (tileW + gap), y: top(0), w: tileW };
    const col = cols - 1 - (k - cols);
    if (k === n) {
      // Ausgang füllt die Reihe bis zum linken Rand.
      return { x: 0, y: top(1), w: col * (tileW + gap) + tileW };
    }
    return { x: col * (tileW + gap), y: top(1), w: tileW };
  }

  /** Gänge zwischen den Kacheln: waagrecht in einer Reihe, senkrecht am Ende der ersten Reihe. */
  const corridors = $derived.by(() => {
    if (mapW === 0) return [];
    const out: { x: number; y: number; w: number; h: number; vertical: boolean; lit: boolean }[] = [];
    const floorY = layout.labelH + layout.tileH * 0.7;
    for (let k = 0; k < n; k++) {
      const a = cell(k);
      const b = cell(k + 1);
      const lit = k + 1 === n;
      if (Math.abs(a.y - b.y) < 1) {
        const left = a.x < b.x ? a : b;
        const right = a.x < b.x ? b : a;
        out.push({ x: left.x + left.w - 2, y: a.y + floorY - 11, w: right.x - left.x - left.w + 4, h: 22, vertical: false, lit });
      } else {
        out.push({ x: a.x + a.w / 2 - 13, y: a.y + layout.labelH + layout.tileH - 2, w: 26, h: b.y + layout.labelH - (a.y + layout.labelH + layout.tileH) + 4, vertical: true, lit });
      }
    }
    return out;
  });

  /** Wer in welchem Raum steht (für den Kopf über der Kachel). */
  const inRoom = (k: number) => ids.filter((id) => players[id]?.status !== 'out' && players[id]?.room === k);
  const outList = $derived(ranking.filter((x) => x.status === 'out').map((x) => ({ id: x.playerId, place: x.place })));

  // ------------------------------------------------------------ Spielerleiste

  const barCols = $derived(ids.length <= 4 ? Math.max(1, ids.length) : ids.length <= 6 ? 3 : 4);
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
</script>

<div class="tv flex flex-col gap-3" style="height: calc(100dvh - 5.75rem)">
  <!-- Kopfzeile -->
  <header class="flex shrink-0 items-center gap-4">
    <div class="mw0">
      <p class="text-xs font-extrabold uppercase tracking-[0.3em] text-amber-500/80">Dungeon</p>
      <h2 class="text-3xl font-black leading-none text-stone-100">Fragerunde {round.roundNo}</h2>
    </div>
    <div class="phase flex mw0 flex-1 items-center gap-3 rounded-2xl px-4 py-2">
      <span class="badge shrink-0 rounded-lg px-2.5 py-1 text-sm font-black uppercase tracking-wider">{phase.label}</span>
      <span class="mw0 truncate text-xl font-bold text-stone-200">{phase.text}</span>
      {#if waiting.length > 0 && waiting.length <= 6}
        <span class="ml-auto flex shrink-0 items-center gap-1">
          {#each waiting as id (id)}<span class="waiting rounded-full"><PlayerHead {view} {id} size={26} /></span>{/each}
        </span>
      {/if}
      {#if round.stage === 'result' && !suspense}
        <span class="ml-auto shrink-0 text-base font-bold text-stone-400">
          {ids.some((id) => round.players[id]?.status === 'in') ? 'Gleich: nächste Türwahl' : 'Gleich: Auswertung'}
        </span>
      {/if}
    </div>
  </header>

  <div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-4">
  <div class="flex min-h-0 flex-col gap-3">
  <!-- Karte -->
  <div class="relative min-h-0 flex-1" bind:clientWidth={mapW} bind:clientHeight={mapH}>
    {#if mapW > 0 && mapH > 0}
      {#each corridors as c, i (i)}
        <div class="corridor absolute {c.vertical ? 'vertical' : ''} {c.lit ? 'lit' : ''}" style="left:{c.x}px; top:{c.y}px; width:{c.w}px; height:{c.h}px"></div>
      {/each}
      {#each round.rooms as doors, k (k)}
        {@const pos = cell(k)}
        {@const here = inRoom(k)}
        <div class="absolute flex flex-col" style="left:{pos.x}px; top:{pos.y}px; width:{pos.w}px">
          <div class="flex items-center gap-1.5 px-0.5" style="height:{layout.labelH}px">
            <span class="roman grid h-5 min-w-5 place-items-center rounded px-1 text-[0.7rem] font-black">{ROMAN[k]}</span>
            <span class="text-sm font-bold text-stone-300">Raum {k + 1}</span>
            <span class="ml-auto flex items-center -space-x-1">
              {#each here.slice(0, 5) as id (id)}<PlayerHead {view} {id} size={18} />{/each}
            </span>
          </div>
          <div class="tile relative overflow-hidden rounded-xl" style="height:{layout.tileH}px">
            <DungeonScene {view} {round} roomIndex={k} compact fill />
          </div>
          {#if layout.listH > 0}
            <ul class="mt-1 space-y-px" style="height:{layout.listH - 4}px">
              {#each doors as d (d.id)}
                {@const tries = triesOf(d.id, d.tries)}
                {@const fails = tries.filter((t) => !t.correct).length}
                {@const wins = tries.filter((t) => t.correct).length}
                <li class="flex h-5 items-center gap-1.5 text-[0.78rem] leading-none text-stone-300">
                  <span class="w-3.5 shrink-0 text-center text-amber-500/80">{doorIcon(d)}</span>
                  <span class="mw0 flex-1 truncate font-semibold">{d.title}</span>
                  <span class="shrink-0 text-[0.7rem] text-stone-500">{doorShort(d)}</span>
                  {#if wins > 0}<span class="shrink-0 font-black text-emerald-400">✓{wins}</span>{/if}
                  {#if fails > 0}<span class="shrink-0 font-black {fails >= 2 ? 'text-rose-400' : 'text-rose-300/70'}">✗{fails}</span>{/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/each}
      {@const ex = cell(n)}
      <div class="absolute flex flex-col" style="left:{ex.x}px; top:{ex.y}px; width:{ex.w}px">
        <div class="flex items-center gap-1.5 px-0.5" style="height:{layout.labelH}px">
          <span class="text-sm font-black uppercase tracking-[0.2em] text-amber-300">Ausgang</span>
          {#if outList.length > 0}<span class="ml-auto text-xs font-bold text-amber-200/70">{outList.length} draußen</span>{/if}
        </div>
        <div style="height:{layout.tileH + (twoRows ? 0 : layout.listH * 0.6)}px">
          <DungeonMapExit {view} out={outList} height={layout.tileH + (twoRows ? 0 : layout.listH * 0.6)} />
        </div>
      </div>
    {/if}
  </div>

  <!-- Spieler -->
  <ul class="grid shrink-0 gap-1.5" style="grid-template-columns: repeat({barCols}, minmax(0, 1fr))">
    {#each ids as id (id)}
      {@const p = players[id]!}
      {@const st = statusOf(id)}
      <li class="card grid items-center gap-x-2.5 gap-y-1 rounded-xl px-2.5 py-1.5 {leader === id ? 'lead' : ''} {p.status === 'eliminated' ? 'opacity-55' : ''}">
        <span class="relative row-span-2">
          <PlayerHead {view} {id} size={34} />
          {#if leader === id}<span class="crown absolute -top-2.5 left-1/2 -translate-x-1/2 text-sm" aria-label="führt">♛</span>{/if}
        </span>
        <span class="flex mw0 items-center gap-2">
          <span class="mw0 truncate text-lg font-black leading-tight text-stone-100">{playerName(view, id)}</span>
          <span class="status {st.tone} ml-auto shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.78rem] font-bold leading-tight">{st.text}</span>
        </span>
        <span class="flex mw0 items-center gap-1.5">
          <span class="flex mw0 flex-1 items-center gap-0.5" aria-label="Raum {Math.min(p.room + 1, n)} von {n}">
            {#each round.rooms as _, k (k)}
              <span class="pip {p.status === 'out' || k < p.room ? 'done' : k === p.room && p.status === 'in' ? 'here' : ''}"></span>
            {/each}
            <span class="pip exit {p.status === 'out' ? 'done' : ''}"></span>
          </span>
          {#if p.wrong > 0}<span class="shrink-0 text-xs font-black leading-none text-rose-400">✗{p.wrong}</span>{/if}
        </span>
      </li>
    {/each}
  </ul>
  </div>

  <!-- Ticker -->
  <aside class="flex min-h-0 flex-col gap-2 overflow-hidden">
    <p class="text-xs font-extrabold uppercase tracking-[0.3em] text-stone-500">Live</p>
    {#if tickerShown.length === 0}
      <p class="text-sm leading-snug text-stone-500">Hier erscheint, wer rauskommt, wer in Führung geht und an welchen Türen es knirscht.</p>
    {/if}
    <DungeonTickerFeed {view} items={tickerShown} />
  </aside>
  </div>
</div>

<style>
  /* Statt min-w-0: Der Fernseher bricht Flex-Zeilen mit .min-w-0 sonst um (app.css). */
  .mw0 {
    min-width: 0;
  }
  .tv {
    color: #e7dccb;
  }
  .phase {
    background: linear-gradient(180deg, #221b15, #15110d);
    box-shadow:
      inset 0 0 0 1px rgb(245 158 11 / 0.18),
      0 10px 26px -18px rgb(0 0 0 / 0.9);
  }
  .badge {
    background: linear-gradient(180deg, #f59e0b, #b45309);
    color: #2a1703;
  }
  .waiting {
    box-shadow: 0 0 0 2px rgb(245 158 11 / 0.5);
    animation: wait 1.4s ease-in-out infinite;
  }
  @keyframes wait {
    50% {
      box-shadow: 0 0 0 2px rgb(245 158 11 / 0.1);
    }
  }
  .roman {
    background: #2a211a;
    color: #fbbf24;
    box-shadow: inset 0 0 0 1px rgb(251 191 36 / 0.35);
  }
  .tile {
    box-shadow:
      0 0 0 1px rgb(120 90 50 / 0.45),
      0 12px 28px -14px rgb(0 0 0 / 0.9);
  }
  .corridor {
    background:
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.35) 0 2px, transparent 2px 16px),
      linear-gradient(180deg, #2b241e, #3a3029 45%, #1c1713);
    box-shadow:
      inset 0 2px 0 rgb(0 0 0 / 0.5),
      inset 0 -2px 0 rgb(255 255 255 / 0.05);
    z-index: 0;
  }
  .corridor.vertical {
    background:
      repeating-linear-gradient(0deg, rgb(0 0 0 / 0.35) 0 2px, transparent 2px 16px),
      linear-gradient(90deg, #2b241e, #3a3029 45%, #1c1713);
  }
  .corridor.lit {
    background:
      repeating-linear-gradient(90deg, rgb(0 0 0 / 0.25) 0 2px, transparent 2px 16px),
      linear-gradient(90deg, #3a3029, #a07a3a);
    box-shadow: 0 0 22px -4px rgb(255 200 100 / 0.45);
  }
  .corridor.lit.vertical {
    background:
      repeating-linear-gradient(0deg, rgb(0 0 0 / 0.25) 0 2px, transparent 2px 16px),
      linear-gradient(180deg, #3a3029, #a07a3a);
  }
  .card {
    grid-template-columns: auto minmax(0, 1fr);
    background: linear-gradient(180deg, #211a14, #16120e);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06);
    transition: box-shadow 300ms;
  }
  .card.lead {
    box-shadow:
      inset 0 0 0 1.5px rgb(251 191 36 / 0.75),
      0 0 26px -10px rgb(251 191 36 / 0.7);
  }
  .crown {
    color: #fbbf24;
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
  }
  .pip {
    height: 6px;
    flex: 1 1 0;
    max-width: 1.6rem;
    border-radius: 2px;
    background: rgb(255 255 255 / 0.1);
  }
  .pip.done {
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
  }
  .pip.here {
    background: rgb(245 158 11 / 0.35);
    box-shadow: inset 0 0 0 1px rgb(251 191 36 / 0.8);
  }
  .pip.exit {
    max-width: 0.6rem;
    border-radius: 999px;
  }
  .pip.exit.done {
    background: #fde68a;
    box-shadow: 0 0 8px rgb(253 230 138 / 0.8);
  }
  .status.wait {
    color: #a8a29e;
    background: rgb(255 255 255 / 0.05);
  }
  .status.busy {
    color: #fcd34d;
    background: rgb(245 158 11 / 0.12);
  }
  .status.ok {
    color: #6ee7b7;
    background: rgb(16 185 129 / 0.14);
  }
  .status.bad {
    color: #fda4af;
    background: rgb(225 29 72 / 0.16);
  }
  .status.gold {
    color: #2a1703;
    background: linear-gradient(180deg, #fde68a, #f59e0b);
  }
  .status.off {
    color: #78716c;
    background: transparent;
  }
  @media (prefers-reduced-motion: reduce) {
    .waiting {
      animation: none;
    }
  }
</style>
