<script lang="ts">
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { BLUFF_TEXT_MAX, type BluffEntryView, type BluffRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';

  let { view, round, readonly = false }: { view: RoomView; round: BluffRoundView; readonly?: boolean } = $props();

  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const stage = $derived(round.stage);
  const playing = $derived(view.phase === 'playing');
  const canWrite = $derived(isParticipant && playing && stage === 'writing');
  const canVote = $derived(isParticipant && playing && stage === 'voting');
  const canAdvance = $derived(!readonly && client.isHost && playing);
  const entries = $derived(round.entries ?? []);
  const privileged = $derived(round.privileged === true);
  const doneIds = $derived(stage === 'writing' ? round.submitted : round.voted);
  const allDone = $derived(participants.length > 0 && participants.every((p) => doneIds.includes(p.id)));
  const submitted = $derived(round.myText !== undefined);

  // Entwurf nur einmal aus dem eigenen Text übernehmen, danach tippt der Spieler selbst.
  let draft = $state(untrack(() => round.myText ?? ''));
  let confirmingAdvance = $state(false);
  const changed = $derived(draft.trim() !== (round.myText ?? ''));
  const remaining = $derived(BLUFF_TEXT_MAX - draft.length);

  function submitText() {
    const text = draft.trim();
    if (!text || !canWrite) return;
    client.send({ type: 'submit_text', text });
  }

  function vote(entry: BluffEntryView) {
    if (!canVote || entry.mine) return;
    client.send({ type: 'vote', entryId: entry.id });
  }

  const advanceLabel = $derived(stage === 'writing' ? 'Zur Abstimmung' : stage === 'voting' ? 'Stimmen zeigen' : 'Auflösen');

  function advance() {
    if (!canAdvance) return;
    if (stage !== 'votes_shown' && !allDone && !confirmingAdvance) {
      confirmingAdvance = true;
      setTimeout(() => (confirmingAdvance = false), 3500);
      return;
    }
    confirmingAdvance = false;
    client.send({ type: 'advance' });
  }

  const stageTitle = $derived(
    stage === 'writing' ? `Schreibt eine ${round.category.answerLabel}` : stage === 'voting' ? `Welche ${round.category.answerLabel} ist echt?` : 'So wurde abgestimmt',
  );

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (client.isModerator) return 'Du moderierst: Du siehst Wahrheit, Texte und Stimmen. Die anderen sehen nur ihre eigenen.';
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (stage === 'writing') return submitted && !changed ? 'Abgeschickt. Du kannst den Text noch ändern, bis der Host weiterschaltet.' : round.category.instruction;
    if (stage === 'voting') return round.myVote ? 'Stimme abgegeben. Du kannst noch wechseln, bis der Host weiterschaltet.' : 'Tippe auf den Text, den du für echt hältst. Dein eigener ist gesperrt.';
    return 'Gleich zeigt der Host, wer was geschrieben hat.';
  });
</script>

<div class="flex flex-col gap-4">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div class="min-w-0">
      <p class="text-sm text-slate-400">{round.category.title} · {round.category.promptLabel}</p>
      <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.prompt}</h2>
      <p class="mt-1 text-sm text-slate-300 {readonly ? 'text-xl' : ''}">{stageTitle}</p>
    </div>
    {#if canAdvance}
      <button class="{confirmingAdvance ? 'btn-danger' : 'btn-primary'}" onclick={advance}>
        {confirmingAdvance ? `Wirklich? ${doneIds.length} von ${participants.length} fertig` : advanceLabel}
      </button>
    {/if}
  </header>

  {#if stage !== 'votes_shown'}
    <div class="card flex flex-wrap items-center gap-2 py-2">
      <span class="mr-1 text-sm text-slate-400">{doneIds.length} von {participants.length} {stage === 'writing' ? 'geschrieben' : 'abgestimmt'}</span>
      {#each participants as p (p.id)}
        {@const done = doneIds.includes(p.id)}
        <span class="rounded-full border px-2.5 py-0.5 text-xs font-semibold {done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'} {readonly ? 'text-base' : ''}">
          {done ? '✓ ' : ''}{p.name}{p.id === client.myId ? ' (du)' : ''}
        </span>
      {/each}
    </div>
  {/if}

  {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}

  {#if privileged && round.truth}
    <div class="card border-amber-400/40 bg-amber-400/10">
      <p class="text-xs font-semibold uppercase tracking-widest text-amber-300">Echte {round.category.answerLabel} · nur du siehst das</p>
      <p class="mt-1 text-lg font-semibold">{round.truth}</p>
    </div>
  {/if}

  {#if stage === 'writing'}
    {#if canWrite}
      <div class="card space-y-3">
        <label class="block">
          <span class="mb-1 block text-sm text-slate-400">Deine {round.category.answerLabel}</span>
          <textarea
            class="input min-h-24 resize-y"
            maxlength={BLUFF_TEXT_MAX}
            placeholder={round.category.instruction}
            bind:value={draft}
            onkeydown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitText();
              }
            }}
          ></textarea>
        </label>
        <div class="flex items-center justify-between gap-3">
          <span class="text-xs {remaining < 15 ? 'text-amber-300' : 'text-slate-500'}">{remaining} Zeichen übrig</span>
          <button class="btn-primary" disabled={draft.trim().length === 0 || (submitted && !changed)} onclick={submitText}>
            {submitted ? (changed ? 'Aktualisieren' : 'Abgeschickt ✓') : 'Abschicken'}
          </button>
        </div>
      </div>
    {:else if isParticipant && submitted}
      <div class="card">
        <p class="text-xs text-slate-500">Dein Text</p>
        <p class="font-semibold">{round.myText}</p>
      </div>
    {/if}
    {#if privileged}
      <div class="card space-y-2">
        <p class="text-xs font-semibold uppercase tracking-widest text-slate-400">Eingegangene Texte</p>
        {#if entries.length === 0}
          <p class="text-sm text-slate-500">Noch nichts.</p>
        {:else}
          <ul class="space-y-1.5">
            {#each entries as e (e.id)}
              <li class="flex items-baseline justify-between gap-3 rounded-lg bg-slate-900/60 px-3 py-2" in:fly={{ y: 6, duration: 200 }}>
                <span class="font-semibold">{e.text}</span>
                <span class="shrink-0 text-xs text-slate-400">{playerName(view, e.authorId)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  {:else}
    <ol class="space-y-2">
      {#each entries as e, i (e.id)}
        {@const selected = round.myVote === e.id}
        {@const voters = e.votes ?? []}
        <li in:fly={{ y: 8, delay: i * 40, duration: 200 }}>
          <button
            type="button"
            class="flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition
              {e.mine ? 'border-slate-700 bg-slate-900/40 opacity-70' : selected ? 'border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-400/60' : 'border-slate-800 bg-slate-900/60'}
              {canVote && !e.mine ? 'hover:border-indigo-400/60 hover:bg-slate-800/60 active:scale-[0.99]' : 'cursor-default'}"
            disabled={!canVote || e.mine}
            onclick={() => vote(e)}
          >
            <span class="flex w-full items-start justify-between gap-3">
              <span class="font-semibold leading-snug {readonly ? 'text-2xl' : 'text-base sm:text-lg'}">{e.text}</span>
              <span class="flex shrink-0 items-center gap-1">
                {#if e.mine}<span class="badge">deiner</span>{/if}
                {#if selected && stage === 'voting'}<span class="badge bg-indigo-500/20 text-indigo-200">deine Stimme</span>{/if}
                {#if privileged && e.authorId !== undefined}
                  <span class="badge {e.isTruth ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-200'}">{e.isTruth ? 'Wahrheit' : playerName(view, e.authorId)}</span>
                {/if}
              </span>
            </span>
            {#if stage === 'votes_shown' || privileged}
              <span class="flex flex-wrap items-center gap-1 text-xs text-slate-400">
                <span class="font-mono font-bold text-slate-200">{voters.length}</span> {voters.length === 1 ? 'Stimme' : 'Stimmen'}
                {#each voters as v (v)}
                  <span class="rounded-full bg-slate-800 px-2 py-0.5 text-slate-300">{playerName(view, v)}</span>
                {/each}
              </span>
            {/if}
          </button>
        </li>
      {/each}
    </ol>
  {/if}
</div>
