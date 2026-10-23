<script lang="ts">
  import { crossfade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import type { RoomView, SortRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { draggable, type DragPoint, type DragStart } from '../lib/drag.ts';
  import { scrollIntoViewIfHidden } from '../lib/scroll.ts';
  import Card from './Card.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import HostDecision from './HostDecision.svelte';
  import PlayerList from './PlayerList.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: SortRoundView; readonly?: boolean } = $props();

  const category = $derived(round.category);
  const cardsById = $derived(new Map(round.cards.map((c) => [c.id, c])));
  const placement = $derived(round.placement);
  const selection = $derived(round.selection);
  const activeName = $derived(playerName(view, round.activePlayerId));
  const activePlayer = $derived(view.players.find((p) => p.id === round.activePlayerId));
  const canAct = $derived(!readonly && client.isActive && view.phase === 'playing' && !placement);
  const selectionComplete = $derived(selection.cardId !== undefined && selection.gapIndex !== undefined);
  const canSkip = $derived(
    !readonly && client.isHost && !client.isActive && view.phase === 'playing' && !placement && view.settings.timerSeconds === 0,
  );

  /**
   * Vorschau: Sind Karte und Lücke gewählt, liegt die Karte schon sichtbar in der Kette.
   * Nach dem Bestätigen steht sie an derselben Stelle, dann ohne Vorschau. So springt nichts und kein Platzhalter bleibt stehen.
   */
  const previewCardId = $derived(
    !placement && selection.cardId !== undefined && selection.gapIndex !== undefined && round.pool.includes(selection.cardId)
      ? selection.cardId
      : null,
  );
  const previewGap = $derived(previewCardId !== null ? (selection.gapIndex ?? null) : null);

  interface Row {
    cardId: string;
    preview: boolean;
    /** Index der echten Lücke über bzw. unter dieser Zeile. */
    gapAbove: number;
    gapBelow: number;
  }
  const rows = $derived.by(() => {
    const out: Row[] = round.chain.map((cardId, i) => ({ cardId, preview: false, gapAbove: i, gapBelow: i + 1 }));
    if (previewCardId !== null && previewGap !== null) {
      out.splice(previewGap, 0, { cardId: previewCardId, preview: true, gapAbove: previewGap, gapBelow: previewGap });
    }
    return out;
  });
  const poolIds = $derived(round.pool.filter((id) => id !== previewCardId));

  /** Die Lücke, in der die Vorschau liegt, braucht keinen eigenen Knopf mehr. */
  function showGap(gapIndex: number): boolean {
    return previewGap === null || gapIndex !== previewGap;
  }

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Nach einem Drop landet die Karte sofort, ohne noch einmal aus dem Pool zu fliegen. */
  let instant = false;
  const [send, receive] = crossfade({ duration: () => (reduced || instant ? 0 : 450), easing: cubicOut });
  const flipOpts = { duration: reduced ? 0 : 300 };

  // ------------------------------------------------------------ Ziehen

  interface Drag {
    cardId: string;
    x: number;
    y: number;
    dx: number;
    dy: number;
    w: number;
  }
  let drag = $state<Drag | null>(null);
  let dropGap = $state<number | null>(null);

  type Drop = { kind: 'gap'; index: number } | { kind: 'pool' } | null;

  function dropFromHit(hit: HTMLElement | null, y: number): Drop {
    const drop = hit?.dataset.drop ?? '';
    if (drop.startsWith('gap:')) return { kind: 'gap', index: Number(drop.slice(4)) };
    if (drop.startsWith('row:')) {
      const [above, below] = drop.slice(4).split(':').map(Number);
      const rect = hit!.getBoundingClientRect();
      return { kind: 'gap', index: y < rect.top + rect.height / 2 ? above! : below! };
    }
    if (drop === 'pool') return { kind: 'pool' };
    return null;
  }

  function onDragStart(s: DragStart) {
    drag = { cardId: s.id, x: s.x, y: s.y, dx: s.x - s.rect.left, dy: s.y - s.rect.top, w: s.rect.width };
  }

  function onDragMove(p: DragPoint, hit: HTMLElement | null) {
    if (drag) {
      drag.x = p.x;
      drag.y = p.y;
    }
    const drop = dropFromHit(hit, p.y);
    dropGap = drop?.kind === 'gap' ? drop.index : null;
  }

  function onDragEnd(p: DragPoint, hit: HTMLElement | null) {
    const cardId = drag?.cardId;
    const drop = dropFromHit(hit, p.y);
    drag = null;
    dropGap = null;
    if (!canAct || !cardId || !drop) return;
    instant = true;
    setTimeout(() => (instant = false), 400);
    if (drop.kind === 'gap') {
      client.send({ type: 'select', turnNo: round.turnNo, cardId, gapIndex: drop.index });
    } else if (cardId === previewCardId) {
      client.send({ type: 'select', turnNo: round.turnNo, cardId: undefined, gapIndex: selection.gapIndex });
    }
  }

  // ------------------------------------------------------------ Tippen

  function pickCard(cardId: string) {
    if (!canAct) return;
    const next = selection.cardId === cardId ? undefined : cardId;
    client.send({ type: 'select', turnNo: round.turnNo, cardId: next, gapIndex: selection.gapIndex });
  }

  function pickGap(gapIndex: number) {
    if (!canAct) return;
    const next = selection.gapIndex === gapIndex ? undefined : gapIndex;
    client.send({ type: 'select', turnNo: round.turnNo, cardId: selection.cardId, gapIndex: next });
  }

  function confirm() {
    if (!canAct || !selectionComplete) return;
    client.send({ type: 'confirm', turnNo: round.turnNo });
  }

  function statusFor(cardId: string) {
    return placement?.cardId === cardId ? placement.status : null;
  }

  // Spannungsbalken unter der gerade gelegten Karte, rein kosmetisch.
  let suspense = $state(1);
  $effect(() => {
    const p = placement;
    if (!p || p.status !== 'pending') {
      suspense = 1;
      return;
    }
    let raf = 0;
    const total = p.resolveAt - (p.resolveAt - 2000);
    const tick = () => {
      suspense = Math.max(0, Math.min(1, (p.resolveAt - client.serverNow()) / total));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  });

  let barHeight = $state(0);

  // Zuschauer und Screen scrollen zur gerade eingeloggten Karte, damit bei langen Ketten niemand den Moment verpasst.
  let chainEl = $state<HTMLOListElement>();
  let scrolledFor = '';
  $effect(() => {
    const p = placement;
    const list = chainEl;
    if (!p || p.status !== 'pending' || !list) return;
    const key = `${p.cardId}:${round.turnNo}`;
    if (key === scrolledFor) return;
    scrolledFor = key;
    if (!readonly && client.isActive) return;
    const el = list.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(p.cardId)}"]`);
    if (el) scrollIntoViewIfHidden(el);
  });

  const statusText = $derived.by(() => {
    if (view.phase === 'host_decision') return null;
    if (placement) {
      const who = placement.by === client.myId && !readonly ? 'Du hast' : `${playerName(view, placement.by)} hat`;
      if (placement.status === 'pending') return `${who} gelegt…`;
      if (placement.status === 'correct') return 'Richtig!';
      return 'Falsch!';
    }
    if (!readonly && client.isActive) return 'Du bist dran';
    return `${activeName} ist dran`;
  });

  const hint = $derived.by(() => {
    if (view.phase !== 'playing' || placement || readonly) return '';
    if (client.isActive) {
      if (!selection.cardId) return 'Zieh eine Karte aus dem Pool in die Kette oder tippe sie an.';
      if (selection.gapIndex === undefined) return 'Zieh sie an die richtige Stelle oder tippe eine Lücke an.';
      return 'Passt? Dann bestätigen. Zum Verschieben einfach noch einmal ziehen.';
    }
    if (client.isEliminated) return 'Du bist raus. Schau zu, wie es weitergeht.';
    if (client.isModerator) return 'Du moderierst diese Runde.';
    if (!client.inRound) return 'Du bist ab der nächsten Runde dabei.';
    return '';
  });
</script>

{#snippet gap(i: number)}
  {@const active = dropGap === i || (dropGap === null && canAct && previewCardId === null && selection.gapIndex === i)}
  <button
    type="button"
    data-drop="gap:{i}"
    class="gap group flex w-full items-center justify-center rounded-lg transition
      {active ? 'h-9 bg-indigo-500/30 ring-2 ring-indigo-400' : canAct ? 'h-7 hover:bg-slate-800' : 'h-3'}"
    disabled={!canAct}
    aria-label="Lücke {i + 1}"
    onclick={() => pickGap(i)}
  >
    {#if active}
      <span class="text-xs font-semibold text-indigo-200">{drag ? 'hier ablegen' : 'hier einsortieren'}</span>
    {:else if canAct}
      <span class="h-0.5 w-full rounded bg-slate-700 group-hover:bg-indigo-400"></span>
    {/if}
  </button>
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="space-y-1">
      <p class="text-sm text-slate-400">{category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{category.question}</h2>
    </header>

    <div class="card flex items-center gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold {placement?.status === 'correct' ? 'text-emerald-300' : placement?.status === 'wrong' ? 'text-rose-300' : ''}">
          {statusText ?? ''}
        </p>
        {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}
        {#if activePlayer && !activePlayer.connected && view.phase === 'playing'}
          <p class="text-sm text-amber-300">{activeName} ist gerade nicht verbunden.</p>
        {/if}
      </div>
      <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
      {#if canSkip}
        <button class="btn-ghost text-xs" onclick={() => client.send({ type: 'skip_turn', turnNo: round.turnNo })}>Zug überspringen</button>
      {/if}
    </div>

    {#if view.phase === 'host_decision'}
      <HostDecision {view} {readonly} />
    {/if}

    <div class="card">
      <p class="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-emerald-300">▲ {category.topLabel}</p>
      <ol class="space-y-1" bind:this={chainEl}>
        {#each rows as row (row.cardId)}
          {@const card = cardsById.get(row.cardId)}
          {@const status = row.preview ? null : statusFor(row.cardId)}
          <li animate:flip={flipOpts}>
            {#if showGap(row.gapAbove)}
              {@render gap(row.gapAbove)}
            {/if}
            <div
              class="relative transition-opacity {drag?.cardId === row.cardId ? 'opacity-30' : ''}"
              data-card-id={row.cardId}
              data-drop="row:{row.gapAbove}:{row.gapBelow}"
              in:receive|global={{ key: row.cardId }}
              out:send|global={{ key: row.cardId }}
              use:draggable={{ id: row.cardId, enabled: canAct && row.preview, onStart: onDragStart, onMove: onDragMove, onEnd: onDragEnd }}
            >
              <Card
                name={card?.name ?? '?'}
                {status}
                selected={row.preview}
                isStart={row.cardId === round.startCardId}
                disabled={!row.preview}
                large={readonly}
                onclick={row.preview ? () => pickCard(row.cardId) : undefined}
              />
              {#if status === 'pending'}
                <div class="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded bg-slate-900/60">
                  <div class="h-full bg-amber-300" style="width:{suspense * 100}%"></div>
                </div>
              {/if}
            </div>
          </li>
        {/each}
        {#if showGap(round.chain.length)}
          <li>{@render gap(round.chain.length)}</li>
        {/if}
      </ol>
      <p class="mt-2 text-center text-xs font-semibold uppercase tracking-widest text-sky-300">▼ {category.bottomLabel}</p>
    </div>
  </section>

  <aside class="space-y-4">
    <div class="card" data-drop="pool">
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="font-bold">Offene Karten</h3>
        <span class="text-xs text-slate-500">{round.pool.length} übrig</span>
      </div>
      <div class="grid gap-2 {readonly ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-2'}">
        {#each poolIds as cardId (cardId)}
          {@const card = cardsById.get(cardId)}
          <div
            class="transition-opacity {drag?.cardId === cardId ? 'opacity-30' : ''}"
            animate:flip={flipOpts}
            in:receive|global={{ key: cardId }}
            out:send|global={{ key: cardId }}
            use:draggable={{ id: cardId, enabled: canAct, onStart: onDragStart, onMove: onDragMove, onEnd: onDragEnd }}
          >
            <Card name={card?.name ?? '?'} selected={selection.cardId === cardId} disabled={!canAct} large={readonly} onclick={() => pickCard(cardId)} />
          </div>
        {/each}
        {#if poolIds.length === 0}
          <p class="col-span-full py-3 text-center text-sm text-slate-500">Alle Karten liegen in der Kette.</p>
        {/if}
      </div>
    </div>

    <div class="card">
      <h3 class="mb-3 font-bold">Spieler</h3>
      <PlayerList {view} showScores large={readonly} />
    </div>
  </aside>
</div>

{#if drag}
  <div
    class="pointer-events-none fixed z-50"
    style="left:{drag.x - drag.dx}px; top:{drag.y - drag.dy}px; width:{drag.w}px; transform: rotate(-2deg) scale(1.04)"
  >
    <Card name={cardsById.get(drag.cardId)?.name ?? '?'} selected ghost />
  </div>
{/if}

{#if canAct}
  <div aria-hidden="true" style="height:{barHeight}px"></div>
  <div
    bind:clientHeight={barHeight}
    class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur"
    style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))"
  >
    <div class="mx-auto flex max-w-5xl items-center gap-3">
      <div class="min-w-0 flex-1 text-sm text-slate-300">
        {#if selection.cardId}
          <span class="font-semibold text-slate-50">{cardsById.get(selection.cardId)?.name}</span>
          {#if selection.gapIndex !== undefined}
            <span class="text-slate-400"> → Lücke {selection.gapIndex + 1} von {round.chain.length + 1}</span>
          {/if}
        {:else}
          <span class="text-slate-500">Noch keine Karte gewählt</span>
        {/if}
      </div>
      <button class="btn-primary shrink-0" disabled={!selectionComplete} onclick={confirm}>Bestätigen</button>
    </div>
  </div>
{/if}
