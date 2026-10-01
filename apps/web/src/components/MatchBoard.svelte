<script lang="ts">
  import { crossfade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';
  import type { MatchRoundView, MatchTargetView, PlacementStatus, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import Card from './Card.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import HostDecision from './HostDecision.svelte';
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

  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [send, receive] = crossfade({ duration: reduced ? 0 : 450, easing: cubicOut });
  const flipOpts = { duration: reduced ? 0 : 300 };

  /** Welche Karte liegt (fest oder gerade im Versuch) in diesem Zielfeld? */
  function cardIn(target: MatchTargetView): { id: string; status: PlacementStatus | null } | null {
    if (target.matchedCardId) return { id: target.matchedCardId, status: null };
    if (attempt && attempt.targetId === target.id) return { id: attempt.cardId, status: attempt.status };
    return null;
  }

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
      if (!selection.cardId) return `Wähle eine Karte (${round.category.leftLabel}).`;
      if (!selection.targetId) return `Wähle jetzt das passende Ziel (${round.category.rightLabel}).`;
      return 'Passt? Dann bestätigen.';
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
    </div>

    {#if view.phase === 'host_decision'}
      <HostDecision {view} {readonly} />
    {/if}

    <div class="card">
      <div class="mb-2 flex items-baseline justify-between">
        <p class="text-xs font-semibold uppercase tracking-widest text-sky-300">{round.category.rightLabel}</p>
        <span class="text-xs text-slate-500">{matchedCount} von {round.cards.length} zugeordnet</span>
      </div>
      <ol class="space-y-1.5">
        {#each round.targets as target (target.id)}
          {@const inSlot = cardIn(target)}
          {@const selected = selection.targetId === target.id}
          <li class="flex items-center gap-3 rounded-lg border px-3 py-2
            {target.matchedCardId ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60'}
            {readonly ? 'text-xl' : ''}">
            <span class="min-w-0 flex-1 truncate font-semibold">
              {target.text}
              {#if round.privileged && target.decoy}<span class="badge ml-1 bg-amber-500/20 text-amber-300">Köder</span>{/if}
            </span>
            <div class="w-[46%] shrink-0 sm:w-[40%]">
              {#if inSlot}
                <div in:receive|global={{ key: inSlot.id }} out:send|global={{ key: inSlot.id }}>
                  <Card name={cardsById.get(inSlot.id)?.text ?? '?'} status={inSlot.status} disabled large={readonly} />
                </div>
                {#if target.matchedBy && !readonly}
                  <p class="mt-0.5 text-right text-[10px] text-slate-500">{playerName(view, target.matchedBy)}</p>
                {/if}
              {:else}
                <button
                  type="button"
                  class="flex h-10 w-full items-center justify-center rounded-xl border border-dashed text-xs transition
                    {selected ? 'border-indigo-400 bg-indigo-500/25 text-indigo-100 ring-2 ring-indigo-400/60' : 'border-slate-700 text-slate-500'}
                    {canAct ? 'hover:border-indigo-400 hover:text-indigo-200' : 'cursor-default'}
                    {readonly ? 'h-14 text-base' : ''}"
                  disabled={!canAct}
                  onclick={() => pickTarget(target.id)}
                >
                  {#if selected}
                    hier ablegen
                  {:else if round.privileged && target.solutionCardId}
                    <span class="truncate px-2 text-slate-400">{cardsById.get(target.solutionCardId)?.text} 🔒</span>
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
    <div class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="font-bold">{round.category.leftLabel}</h3>
        <span class="text-xs text-slate-500">{round.pool.length} übrig</span>
      </div>
      <div class="grid gap-2 {readonly ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-2'}">
        {#each round.pool as cardId (cardId)}
          <div animate:flip={flipOpts} in:receive|global={{ key: cardId }} out:send|global={{ key: cardId }}>
            <Card name={cardsById.get(cardId)?.text ?? '?'} selected={selection.cardId === cardId} disabled={!canAct} large={readonly} onclick={() => pickCard(cardId)} />
          </div>
        {/each}
      </div>
    </div>

    <div class="card">
      <h3 class="mb-3 font-bold">Leben</h3>
      <LivesList {view} {round} {readonly} />
    </div>
  </aside>
</div>

{#if canAct}
  <div class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <div class="mx-auto flex max-w-5xl items-center gap-3">
      <div class="min-w-0 flex-1 truncate text-sm text-slate-300">
        {#if selection.cardId}
          <span class="font-semibold text-white">{cardsById.get(selection.cardId)?.text}</span>
          {#if selection.targetId}
            <span class="text-slate-400"> → {round.targets.find((t) => t.id === selection.targetId)?.text}</span>
          {/if}
        {:else}
          <span class="text-slate-500">Noch keine Karte gewählt</span>
        {/if}
      </div>
      <button class="btn-primary" disabled={!selectionComplete} onclick={confirm}>Bestätigen</button>
    </div>
  </div>
{/if}
