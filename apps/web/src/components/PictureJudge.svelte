<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { PictureFieldView, PictureRoundView, RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import PictureView from './PictureView.svelte';

  /** Auflösung im Modus „Alle gleichzeitig“: Der Host ruft Feld für Feld auf und setzt die Urteile, alle sehen zu. */
  let { view, round, readonly = false }: { view: RoomView; round: PictureRoundView; readonly?: boolean } = $props();

  const judge = $derived(round.judge ?? { index: 0, shown: 0, complete: false });
  const host = $derived(!readonly && client.isHost && view.phase === 'reveal');
  const fields = $derived(round.fields);
  const current = $derived(fields[judge.index] ?? null);
  /** Aufgerufene Felder gelten im Bild als gelöst, die anderen bleiben verdeckt. */
  const shown = $derived(fields.map((f, i) => ({ ...f, solved: i < judge.shown })));
  const earlier = $derived(fields.slice(0, judge.shown).filter((f) => f.id !== current?.id));
  const results = $derived(round.results ?? []);
  const startedAt = $derived(round.startedAt ?? 0);
  const seconds = (at: number) => ((at - startedAt) / 1000).toFixed(1);
  const remaining = $derived(fields.length - judge.shown);

  const answerOf = (pid: string, fieldId: string) => round.answers?.[pid]?.[fieldId] ?? '';
  const verdictOf = (pid: string, fieldId: string) => round.verdicts?.[pid]?.[fieldId] === true;

  function setVerdict(pid: string, fieldId: string, correct: boolean) {
    if (!host) return;
    client.send({ type: 'picture_verdict', playerId: pid, fieldId, correct });
  }

  function step(index: number) {
    if (!host) return;
    client.send({ type: 'picture_step', index });
  }
</script>

{#snippet earlierRow(f: PictureFieldView)}
  <span class="w-6 shrink-0 text-right font-mono text-sm text-slate-500">{f.number}</span>
  <span class="font-semibold">{f.answer}</span>
  {#each round.turnOrder as pid (pid)}
    <span class="text-sm {verdictOf(pid, f.id) ? 'text-emerald-300' : 'text-slate-500'}">{playerName(view, pid)} {verdictOf(pid, f.id) ? '✓' : '✗'}</span>
  {/each}
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header>
      <p class="text-sm text-slate-400">Prüfung · {round.category.title}</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
      {#if round.category.source}<p class="mt-1 text-xs text-slate-500">Quelle: {round.category.source}</p>{/if}
    </header>

    <PictureView image={round.image} original={round.original ?? null} fields={shown} selectedId={current?.id ?? null} large={readonly} />

    {#if current}
      {#key current.id}
        <div class="card space-y-3 border-indigo-500/40" in:fly={{ y: 8, duration: 250 }}>
          <div class="flex items-baseline justify-between gap-3">
            <p class="text-xs font-semibold uppercase tracking-widest text-sky-300">Feld {current.number} von {fields.length}</p>
            <p class="break-words text-right text-lg font-bold text-emerald-300 {readonly ? 'text-2xl' : ''}">{current.answer ?? '?'}</p>
          </div>
          <ul class="divide-y divide-slate-800">
            {#each round.turnOrder as pid (pid)}
              {@const text = answerOf(pid, current.id)}
              {@const ok = verdictOf(pid, current.id)}
              <li class="flex items-center gap-3 py-2 {readonly ? 'text-xl' : ''}">
                <span class="min-w-0 flex-1">
                  <span class="block break-words font-semibold">{playerName(view, pid)}</span>
                  <span class="block break-words {text ? (ok ? 'text-emerald-200' : 'text-rose-200') : 'italic text-slate-500'}">{text || 'keine Antwort'}</span>
                </span>
                {#if host}
                  <div class="flex shrink-0 gap-1">
                    <button
                      type="button"
                      class="rounded-xl border px-3 py-1.5 text-sm font-semibold transition {ok
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                        : 'border-slate-700 text-slate-400 hover:border-emerald-500/60'}"
                      onclick={() => setVerdict(pid, current.id, true)}
                    >
                      Richtig
                    </button>
                    <button
                      type="button"
                      class="rounded-xl border px-3 py-1.5 text-sm font-semibold transition {!ok
                        ? 'border-rose-500 bg-rose-500/20 text-rose-200'
                        : 'border-slate-700 text-slate-400 hover:border-rose-500/60'}"
                      onclick={() => setVerdict(pid, current.id, false)}
                    >
                      Falsch
                    </button>
                  </div>
                {:else}
                  <span class="shrink-0 text-xl {ok ? 'text-emerald-400' : 'text-rose-400'}" aria-label={ok ? 'richtig' : 'falsch'}>{ok ? '✓' : '✗'}</span>
                {/if}
              </li>
            {/each}
          </ul>
          {#if host}
            <div class="flex flex-wrap gap-2">
              <button class="btn-secondary" disabled={judge.index === 0} onclick={() => step(judge.index - 1)}>Zurück</button>
              {#if judge.index + 1 < fields.length}
                <button class="btn-primary flex-1" onclick={() => step(judge.index + 1)}>Weiter zu Feld {judge.index + 2}</button>
              {:else}
                <button class="btn-primary flex-1" disabled={!judge.complete} onclick={() => client.send({ type: 'to_scoring' })}>Prüfung abschließen</button>
              {/if}
            </div>
            <p class="text-xs text-slate-500">Passende Antworten sind schon als richtig markiert. Alle sehen deine Urteile sofort.</p>
          {/if}
        </div>
      {/key}
    {/if}

    {#if earlier.length > 0}
      <div class="card space-y-1">
        <p class="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">Schon geprüft</p>
        {#each earlier as f (f.id)}
          {#if host}
            <button type="button" class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-800/60" onclick={() => step(f.number - 1)}>
              {@render earlierRow(f)}
            </button>
          {:else}
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 {readonly ? 'text-lg' : ''}">
              {@render earlierRow(f)}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    <div class="card">
      <h3 class="mb-3 font-bold">Rangfolge</h3>
      <ol class="divide-y divide-slate-800">
        {#each results as r, i (r.playerId)}
          <li class="flex items-center gap-3 py-2 {readonly ? 'text-xl' : ''} {r.playerId === client.myId ? 'text-indigo-200' : ''}">
            <span class="w-6 text-right font-mono text-slate-500">{i + 1}.</span>
            <span class="min-w-0 flex-1 break-words font-semibold">{playerName(view, r.playerId)}</span>
            <span class="shrink-0 text-sm text-slate-300">{r.hits} von {judge.shown}</span>
            <span class="shrink-0 text-xs text-slate-500">{r.doneAt === null ? 'nicht fertig' : `${seconds(r.doneAt)} s`}</span>
          </li>
        {/each}
      </ol>
      <p class="mt-2 text-xs text-slate-500">Treffer unter den aufgerufenen Feldern, bei Gleichstand die frühere Fertig-Zeit. Die Punkte trägt der Host ein.</p>
    </div>

    {#if !readonly}
      {#if client.isHost && view.phase === 'reveal'}
        <p class="card text-center text-sm text-slate-400">
          {judge.complete ? 'Alle Felder aufgerufen. Schließe die Prüfung ab, um Punkte einzutragen.' : `Noch ${remaining} ${remaining === 1 ? 'Feld' : 'Felder'} aufrufen.`}
        </p>
      {:else if view.phase === 'scoring'}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} trägt gerade die Punkte ein…</p>
      {:else}
        <p class="card text-center text-sm text-slate-400">{playerName(view, view.hostId)} prüft gerade…</p>
      {/if}
    {/if}
  </aside>
</div>
