<script lang="ts">
  import { crossfade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';
  import type { MatchRoundView, MatchTargetView, PlacementStatus, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { draggable, type DragPoint, type DragStart } from '../lib/drag.ts';
  import { scrollIntoViewIfHidden } from '../lib/scroll.ts';
  import Card from './Card.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import HostDecision from './HostDecision.svelte';
  import EndCategoryButton from './EndCategoryButton.svelte';
  import LivesList from './LivesList.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: MatchRoundView; readonly?: boolean } = $props();

  const attempt = $derived(round.attempt);
  const selection = $derived(round.selection);
  const cardsById = $derived(new Map(round.cards.map((c) => [c.id, c])));
  const activeName = $derived(playerName(view, round.activePlayerId));
  const activePlayer = $derived(view.players.find((p) => p.id === round.activePlayerId));
  const canAct = $derived(!readonly && client.isActive && view.phase === 'playing' && !attempt);
  const selectionComplete = $derived(selection.cardId !== undefined && selection.targetId !== undefined);
  const canSkip = $derived(
    !readonly && client.isHost && !client.isActive && view.phase === 'playing' && !attempt && view.settings.timerSeconds === 0,
  );
  const matchedCount = $derived(round.targets.filter((t) => t.matchedCardId !== null).length);

  /** Vorschau: Sind Karte und Ziel gewählt, liegt die Karte schon im Zielfeld. Nach dem Bestätigen bleibt sie dort. */
  const previewCardId = $derived(
    !attempt && selection.cardId !== undefined && selection.targetId !== undefined && round.pool.includes(selection.cardId)
      ? selection.cardId
      : null,
  );
  const poolIds = $derived(round.pool.filter((id) => id !== previewCardId));

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Nach einem Drop landet die Karte sofort, ohne noch einmal aus dem Pool zu fliegen. */
  let instant = false;
  const [send, receive] = crossfade({ duration: () => (reduced || instant ? 0 : 450), easing: cubicOut });
  const flipOpts = { duration: reduced ? 0 : 300 };

  /** Welche Karte liegt (fest, im Versuch oder als Vorschau) in diesem Zielfeld? */
  function cardIn(target: MatchTargetView): { id: string; status: PlacementStatus | null; preview: boolean } | null {
    if (target.matchedCardId) return { id: target.matchedCardId, status: null, preview: false };
    if (attempt && attempt.targetId === target.id) return { id: attempt.cardId, status: attempt.status, preview: false };
    if (previewCardId !== null && selection.targetId === target.id) return { id: previewCardId, status: null, preview: true };
    return null;
  }

  function isFree(target: MatchTargetView): boolean {
    return !target.matchedCardId && !(attempt && attempt.targetId === target.id);
  }

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
  let dropTarget = $state<string | null>(null);

  type Drop = { kind: 'target'; id: string } | { kind: 'pool' } | null;

  function dropFromHit(hit: HTMLElement | null): Drop {
    const drop = hit?.dataset.drop ?? '';
    if (drop.startsWith('target:')) return { kind: 'target', id: drop.slice(7) };
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
    const drop = dropFromHit(hit);
    dropTarget = drop?.kind === 'target' ? drop.id : null;
  }

  function onDragEnd(_p: DragPoint, hit: HTMLElement | null) {
    const cardId = drag?.cardId;
    const drop = dropFromHit(hit);
    drag = null;
    dropTarget = null;
    if (!canAct || !cardId || !drop) return;
    instant = true;
    setTimeout(() => (instant = false), 400);
    if (drop.kind === 'target') {
      client.send({ type: 'select', turnNo: round.turnNo, cardId, targetId: drop.id });
    } else if (cardId === previewCardId) {
      client.send({ type: 'select', turnNo: round.turnNo, cardId: undefined, targetId: selection.targetId });
    }
  }

  // ------------------------------------------------------------ Tippen

  function pickCard(cardId: string) {
    if (!canAct) return;
    const next = selection.cardId === cardId ? undefined : cardId;
    client.send({ type: 'select', turnNo: round.turnNo, cardId: next, targetId: selection.targetId });
  }

  function pickTarget(targetId: string) {
    if (!canAct) return;
    const next = selection.targetId === targetId ? undefined : targetId;
    client.send({ type: 'select', turnNo: round.turnNo, cardId: selection.cardId, targetId: next });
  }

  function confirm() {
    if (!canAct || !selectionComplete) return;
    client.send({ type: 'confirm', turnNo: round.turnNo });
  }

  let barHeight = $state(0);

  // Zuschauer und Screen scrollen zum Zielfeld, in das gerade eingeloggt wurde.
  let targetsEl = $state<HTMLOListElement>();
  let scrolledFor = '';
  $effect(() => {
    const a = attempt;
    const list = targetsEl;
    if (!a || a.status !== 'pending' || !list) return;
    const key = `${a.cardId}:${a.targetId}:${round.turnNo}`;
    if (key === scrolledFor) return;
    scrolledFor = key;
    if (!readonly && client.isActive) return;
    const el = list.querySelector<HTMLElement>(`[data-target-id="${CSS.escape(a.targetId)}"]`);
    if (el) scrollIntoViewIfHidden(el);
  });

  const statusText = $derived.by(() => {
    if (view.phase === 'host_decision') return null;
    if (attempt) {
      const who = attempt.by === client.myId && !readonly ? 'Du hast' : `${playerName(view, attempt.by)} hat`;
      if (attempt.status === 'pending') return `${who} zugeordnet…`;
      if (attempt.status === 'correct') return 'Richtig!';
      return 'Falsch!';
    }
    if (!readonly && client.isActive) return 'Du bist dran';
    return `${activeName} ist dran`;
  });

  const hint = $derived.by(() => {
    if (view.phase !== 'playing' || attempt || readonly) return '';
    if (client.isActive) {
      if (!selection.cardId) return `Zieh eine Karte (${round.category.leftLabel}) auf ein Ziel oder tippe sie an.`;
      if (!selection.targetId) return `Zieh sie auf das passende Ziel (${round.category.rightLabel}) oder tippe es an.`;
      return 'Passt? Dann bestätigen. Zum Verschieben einfach noch einmal ziehen.';
    }
    if (client.isEliminated) return 'Keine Leben mehr. Schau zu, wie es weitergeht.';
    if (client.isModerator) return 'Du moderierst diese Runde und siehst die Lösung.';
    if (!client.inRound) return 'Du bist ab der nächsten Runde dabei.';
    return '';
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="space-y-1">
      <p class="text-sm text-slate-400">{round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
    </header>

    <div class="card flex items-center gap-4 {attempt?.status === 'wrong' ? 'animate-shake' : ''}">
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold {attempt?.status === 'correct' ? 'text-emerald-300' : attempt?.status === 'wrong' ? 'text-rose-300' : ''}">
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
      <EndCategoryButton {view} {readonly} />
    </div>

    {#if view.phase === 'host_decision'}
      <HostDecision {view} {readonly} />
    {/if}

    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <p class="text-xs font-semibold uppercase tracking-widest text-sky-300">{round.category.rightLabel}</p>
        <span class="text-xs text-slate-500">{matchedCount} von {round.cards.length} zugeordnet</span>
      </div>
      <ol class="space-y-1.5" bind:this={targetsEl}>
        {#each round.targets as target (target.id)}
          {@const inSlot = cardIn(target)}
          {@const free = isFree(target)}
          {@const selected = selection.targetId === target.id && canAct}
          {@const hovered = dropTarget === target.id}
          <li
            class="flex items-center gap-3 rounded-lg border px-3 py-2 transition
              {target.matchedCardId ? 'border-emerald-500/40 bg-emerald-500/10' : hovered ? 'border-indigo-400 bg-indigo-500/15 ring-2 ring-indigo-400/60' : 'border-slate-800 bg-slate-900/60'}
              {readonly ? 'text-xl' : ''}"
            data-drop={free && canAct ? `target:${target.id}` : undefined}
            data-target-id={target.id}
          >
            <span class="min-w-0 flex-1 break-words font-semibold">
              {target.text}
              {#if round.privileged && target.decoy}<span class="badge ml-1 bg-amber-500/20 text-amber-300">Köder</span>{/if}
            </span>
            <div class="w-[46%] shrink-0 sm:w-[40%]">
              {#if inSlot}
                <div
                  class="transition-opacity {drag?.cardId === inSlot.id ? 'opacity-30' : ''}"
                  in:receive|global={{ key: inSlot.id }}
                  out:send|global={{ key: inSlot.id }}
                  use:draggable={{ id: inSlot.id, enabled: canAct && inSlot.preview, onStart: onDragStart, onMove: onDragMove, onEnd: onDragEnd }}
                >
                  <Card
                    name={cardsById.get(inSlot.id)?.text ?? '?'}
                    status={inSlot.status}
                    selected={inSlot.preview}
                    disabled={!inSlot.preview}
                    large={readonly}
                    onclick={inSlot.preview ? () => pickCard(inSlot.id) : undefined}
                  />
                </div>
                {#if target.matchedBy && !readonly}
                  <p class="mt-0.5 text-right text-[10px] text-slate-500">{playerName(view, target.matchedBy)}</p>
                {/if}
              {:else}
                <button
                  type="button"
                  class="flex min-h-10 w-full items-center justify-center rounded-xl border border-dashed px-2 py-1 text-xs transition
                    {selected || hovered ? 'border-indigo-400 bg-indigo-500/25 text-indigo-100 ring-2 ring-indigo-400/60' : 'border-slate-700 text-slate-500'}
                    {canAct ? 'hover:border-indigo-400 hover:text-indigo-200' : 'cursor-default'}
                    {readonly ? 'min-h-14 text-base' : ''}"
                  disabled={!canAct}
                  onclick={() => pickTarget(target.id)}
                >
                  {#if hovered}
                    hier ablegen
                  {:else if selected}
                    hier ablegen
                  {:else if round.privileged && target.solutionCardId}
                    <span class="break-words text-slate-400">{cardsById.get(target.solutionCardId)?.text} 🔒</span>
                  {:else if round.privileged && target.decoy}
                    <span class="text-amber-300/70">passt zu nichts</span>
                  {:else}
                    frei
                  {/if}
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
      {#if round.privileged}
        <p class="mt-2 text-xs text-amber-300/80">Lösung und Köder siehst nur du als Moderator.</p>
      {/if}
    </div>
  </section>

  <aside class="space-y-4">
    <div class="card" data-drop="pool">
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="font-bold">{round.category.leftLabel}</h3>
        <span class="text-xs text-slate-500">{round.pool.length} übrig</span>
      </div>
      <div class="grid gap-2 {readonly ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-2'}">
        {#each poolIds as cardId (cardId)}
          <div
            class="transition-opacity {drag?.cardId === cardId ? 'opacity-30' : ''}"
            animate:flip={flipOpts}
            in:receive|global={{ key: cardId }}
            out:send|global={{ key: cardId }}
            use:draggable={{ id: cardId, enabled: canAct, onStart: onDragStart, onMove: onDragMove, onEnd: onDragEnd }}
          >
            <Card name={cardsById.get(cardId)?.text ?? '?'} selected={selection.cardId === cardId} disabled={!canAct} large={readonly} onclick={() => pickCard(cardId)} />
          </div>
        {/each}
        {#if poolIds.length === 0}
          <p class="col-span-full py-3 text-center text-sm text-slate-500">Alle Karten sind verteilt.</p>
        {/if}
      </div>
    </div>

    <div class="card">
      <h3 class="mb-3 font-bold">Leben</h3>
      <LivesList {view} {round} {readonly} />
    </div>
  </aside>
</div>

{#if drag}
  <div
    class="pointer-events-none fixed z-50"
    style="left:{drag.x - drag.dx}px; top:{drag.y - drag.dy}px; width:{drag.w}px; transform: rotate(-2deg) scale(1.04)"
  >
    <Card name={cardsById.get(drag.cardId)?.text ?? '?'} selected ghost />
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
      <div class="min-w-0 flex-1 break-words text-sm text-slate-300">
        {#if selection.cardId}
          <span class="font-semibold text-slate-50">{cardsById.get(selection.cardId)?.text}</span>
          {#if selection.targetId}
            <span class="text-slate-400"> → {round.targets.find((t) => t.id === selection.targetId)?.text}</span>
          {/if}
        {:else}
          <span class="text-slate-500">Noch keine Karte gewählt</span>
        {/if}
      </div>
      <button class="btn-primary shrink-0" disabled={!selectionComplete} onclick={confirm}>Bestätigen</button>
    </div>
  </div>
{/if}
