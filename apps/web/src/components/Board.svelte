<script lang="ts">
  import { crossfade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import type { RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import Card from './Card.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import HostDecision from './HostDecision.svelte';
  import PlayerList from './PlayerList.svelte';

  let { view, readonly = false }: { view: RoomView; readonly?: boolean } = $props();

  const round = $derived(view.round!);
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

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [send, receive] = crossfade({ duration: reduced ? 0 : 450, easing: cubicOut });
  const flipOpts = { duration: reduced ? 0 : 300 };

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
      if (!selection.cardId) return 'Wähle eine Karte aus dem Pool.';
      if (selection.gapIndex === undefined) return 'Wähle jetzt eine Lücke in der Kette.';
      return 'Passt? Dann bestätigen.';
    }
    if (client.isEliminated) return 'Du bist raus. Schau zu, wie es weitergeht.';
    if (client.isModerator) return 'Du moderierst diese Runde.';
    if (!client.inRound) return 'Du bist ab der nächsten Runde dabei.';
    return '';
  });
</script>

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
      <ol class="space-y-1">
        {#each round.chain as cardId, i (cardId)}
          {@const card = cardsById.get(cardId)}
          {@const status = statusFor(cardId)}
          <li animate:flip={flipOpts}>
            <button
              type="button"
              class="gap group flex w-full items-center justify-center rounded-lg transition
                {selection.gapIndex === i ? 'h-9 bg-indigo-500/30 ring-2 ring-indigo-400' : canAct ? 'h-7 hover:bg-slate-800' : 'h-3'}"
              disabled={!canAct}
              aria-label="Lücke {i + 1}"
              onclick={() => pickGap(i)}
            >
              {#if selection.gapIndex === i}
                <span class="text-xs font-semibold text-indigo-200">hier einsortieren</span>
              {:else if canAct}
                <span class="h-0.5 w-full rounded bg-slate-700 group-hover:bg-indigo-400"></span>
              {/if}
            </button>
            <div in:receive|global={{ key: cardId }} out:send|global={{ key: cardId }} class="relative">
              <Card name={card?.name ?? '?'} {status} isStart={cardId === round.startCardId} disabled large={readonly} />
              {#if status === 'pending'}
                <div class="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded bg-slate-900/60">
                  <div class="h-full bg-amber-300" style="width:{suspense * 100}%"></div>
                </div>
              {/if}
            </div>
          </li>
        {/each}
        <li>
          <button
            type="button"
            class="gap group flex w-full items-center justify-center rounded-lg transition
              {selection.gapIndex === round.chain.length ? 'h-9 bg-indigo-500/30 ring-2 ring-indigo-400' : canAct ? 'h-7 hover:bg-slate-800' : 'h-3'}"
            disabled={!canAct}
            aria-label="Lücke {round.chain.length + 1}"
            onclick={() => pickGap(round.chain.length)}
          >
            {#if selection.gapIndex === round.chain.length}
              <span class="text-xs font-semibold text-indigo-200">hier einsortieren</span>
            {:else if canAct}
              <span class="h-0.5 w-full rounded bg-slate-700 group-hover:bg-indigo-400"></span>
            {/if}
          </button>
        </li>
      </ol>
      <p class="mt-2 text-center text-xs font-semibold uppercase tracking-widest text-sky-300">▼ {category.bottomLabel}</p>
    </div>
  </section>

  <aside class="space-y-4">
    <div class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="font-bold">Offene Karten</h3>
        <span class="text-xs text-slate-500">{round.pool.length} übrig</span>
      </div>
      <div class="grid gap-2 {readonly ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-2'}">
        {#each round.pool as cardId (cardId)}
          {@const card = cardsById.get(cardId)}
          <div animate:flip={flipOpts} in:receive|global={{ key: cardId }} out:send|global={{ key: cardId }}>
            <Card name={card?.name ?? '?'} selected={selection.cardId === cardId} disabled={!canAct} large={readonly} onclick={() => pickCard(cardId)} />
          </div>
        {/each}
      </div>
    </div>

    <div class="card">
      <h3 class="mb-3 font-bold">Spieler</h3>
      <PlayerList {view} showScores large={readonly} />
    </div>
  </aside>
</div>

{#if canAct}
  <div class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <div class="mx-auto flex max-w-5xl items-center gap-3">
      <div class="min-w-0 flex-1 text-sm text-slate-300">
        {#if selection.cardId}
          <span class="font-semibold text-white">{cardsById.get(selection.cardId)?.name}</span>
          {#if selection.gapIndex !== undefined}
            <span class="text-slate-400"> → Lücke {selection.gapIndex + 1} von {round.chain.length + 1}</span>
          {/if}
        {:else}
          <span class="text-slate-500">Noch keine Karte gewählt</span>
        {/if}
      </div>
      <button class="btn-primary" disabled={!selectionComplete} onclick={confirm}>Bestätigen</button>
    </div>
  </div>
{/if}
