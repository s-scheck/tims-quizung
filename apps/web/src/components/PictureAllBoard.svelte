<script lang="ts">
  import { untrack } from 'svelte';
  import { GUESS_MAX_LENGTH, type PictureRoundView, type RoomView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import PictureView from './PictureView.svelte';
  import TurnTimer from './TurnTimer.svelte';
  import EndCategoryButton from './EndCategoryButton.svelte';

  /** Bilderrätsel „Alle gleichzeitig“: jeder füllt jedes Feld aus, nur der Fortschritt ist öffentlich. */
  let { view, round, readonly = false }: { view: RoomView; round: PictureRoundView; readonly?: boolean } = $props();

  /** Pause zwischen Tippen und Senden, damit nicht jeder Buchstabe eine Nachricht wird. */
  const SEND_DELAY_MS = 400;

  const me = $derived(client.myId);
  const participant = $derived(!readonly && me !== null && round.turnOrder.includes(me));
  const myDoneAt = $derived(me !== null ? (round.progress?.[me]?.doneAt ?? null) : null);
  const canFill = $derived(participant && view.phase === 'playing' && myDoneAt === null);
  const total = $derived(round.fields.length);
  const doneCount = $derived(round.turnOrder.filter((id) => (round.progress?.[id]?.doneAt ?? null) !== null).length);
  const startedAt = $derived(round.startedAt ?? 0);
  const seconds = (at: number) => ((at - startedAt) / 1000).toFixed(1);
  const players = $derived(
    round.turnOrder.map((id) => ({
      id,
      name: playerName(view, id),
      connected: view.players.find((p) => p.id === id)?.connected ?? true,
      ...(round.progress?.[id] ?? { filled: 0, doneAt: null }),
    })),
  );

  // Eigene Texte je Feld. Der Serverstand füllt nur Felder, die weder bearbeitet noch gerade gesendet werden,
  // damit nach einem Wiederverbinden nichts verloren geht und beim Tippen nichts zurückspringt.
  let texts = $state<Record<string, string>>(untrack(() => ({ ...(round.myAnswers ?? {}) })));
  let focused = $state<string | null>(null);
  let pending = $state<Record<string, boolean>>({});
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  const lastSent: Record<string, string> = untrack(() => ({ ...(round.myAnswers ?? {}) }));

  $effect(() => {
    const mine = round.myAnswers ?? {};
    const fields = round.fields;
    untrack(() => {
      for (const f of fields) {
        const server = mine[f.id] ?? '';
        if (pending[f.id]) {
          if (server === (texts[f.id] ?? '').trim()) delete pending[f.id];
          continue;
        }
        if (focused !== f.id && (texts[f.id] ?? '') !== server) texts[f.id] = server;
      }
    });
  });

  $effect(() => () => {
    for (const t of Object.values(timers)) clearTimeout(t);
  });

  function send(id: string) {
    delete timers[id];
    const text = (texts[id] ?? '').trim().slice(0, GUESS_MAX_LENGTH);
    if (lastSent[id] === text) return;
    lastSent[id] = text;
    client.send({ type: 'picture_fill', fieldId: id, text });
  }

  function changed(id: string) {
    pending[id] = true;
    if (timers[id]) clearTimeout(timers[id]);
    timers[id] = setTimeout(() => send(id), SEND_DELAY_MS);
  }

  function flush(id: string) {
    if (timers[id]) clearTimeout(timers[id]);
    send(id);
  }

  function flushAll() {
    for (const f of round.fields) flush(f.id);
  }

  const emptyCount = $derived(round.fields.filter((f) => !(texts[f.id] ?? '').trim()).length);
  let confirming = $state(false);
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  /** Fertig ist endgültig. Sind Felder leer, fragt der Knopf einmal nach. */
  function finish() {
    if (!canFill) return;
    flushAll();
    if (emptyCount > 0 && !confirming) {
      confirming = true;
      confirmTimer = setTimeout(() => (confirming = false), 4000);
      return;
    }
    if (confirmTimer) clearTimeout(confirmTimer);
    confirming = false;
    client.send({ type: 'picture_done' });
  }

  /** Antippen eines Felds im Bild springt zum passenden Textfeld. */
  function pick(id: string) {
    if (!canFill) return;
    const el = document.getElementById(`picture-field-${id}`);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  const statusText = $derived.by(() => {
    if (participant && myDoneAt !== null) return `Fertig nach ${seconds(myDoneAt)} s`;
    if (participant) return 'Alle füllen gleichzeitig aus';
    return `${doneCount} von ${round.turnOrder.length} fertig`;
  });

  const hint = $derived.by(() => {
    if (readonly || view.phase !== 'playing') return '';
    if (client.isHost) return 'Du siehst nur den Fortschritt. Die Texte kommen bei der Prüfung am Ende.';
    if (participant && myDoneAt !== null) return 'Warte, bis alle fertig sind oder der Host auflöst.';
    if (participant) return 'Schreib zu jedem Feld, was dort fehlt, und tippe dann auf Fertig.';
    if (!client.inRound) return 'Du bist ab der nächsten Runde dabei.';
    return '';
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="space-y-1">
      <p class="text-sm text-slate-400">{round.category.title} · Alle gleichzeitig</p>
      <h2 class="text-xl font-bold sm:text-2xl {readonly ? 'text-3xl' : ''}">{round.category.question}</h2>
    </header>

    <div class="card flex items-center gap-4">
      <div class="min-w-0 flex-1">
        <p class="text-lg font-bold {myDoneAt !== null && participant ? 'text-emerald-300' : ''}">{statusText}</p>
        {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}
      </div>
      <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
      <EndCategoryButton {view} {readonly} label="Auflösen" title="Beendet die Runde, auch wenn noch nicht alle fertig sind. Danach prüfst du Feld für Feld." />
    </div>

    <PictureView
      image={round.image}
      original={round.original ?? null}
      fields={round.fields}
      selectedId={focused}
      interactive={canFill}
      large={readonly}
      peek={!!round.privileged}
      onPick={pick}
    />

    {#if participant}
      <form
        class="card space-y-3"
        onsubmit={(e) => {
          e.preventDefault();
          flushAll();
        }}
      >
        <div class="flex items-baseline justify-between">
          <p class="text-xs font-semibold uppercase tracking-widest text-sky-300">Deine Antworten</p>
          <span class="text-xs text-slate-500">{total - emptyCount} von {total} ausgefüllt</span>
        </div>
        {#each round.fields as f (f.id)}
          <label class="flex items-center gap-3">
            <span
              class="w-10 shrink-0 rounded-xl border-2 py-1 text-center font-mono text-sm font-bold {focused === f.id
                ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                : 'border-slate-700 text-slate-300'}"
            >
              {f.number}
            </span>
            <input
              id="picture-field-{f.id}"
              class="input min-w-0 flex-1"
              type="text"
              maxlength={GUESS_MAX_LENGTH}
              placeholder="Was fehlt bei Nr. {f.number}?"
              autocomplete="off"
              autocapitalize="sentences"
              disabled={!canFill}
              bind:value={texts[f.id]}
              oninput={() => changed(f.id)}
              onfocus={() => (focused = f.id)}
              onblur={() => {
                focused = null;
                flush(f.id);
              }}
            />
          </label>
        {/each}
        {#if canFill}
          <button type="button" class="{confirming ? 'btn-danger' : 'btn-primary'} w-full text-lg" onclick={finish}>
            {confirming ? `${emptyCount} ${emptyCount === 1 ? 'Feld ist' : 'Felder sind'} leer. Trotzdem fertig?` : 'Fertig'}
          </button>
        {:else if myDoneAt !== null}
          <p class="text-center text-sm text-emerald-300">Abgegeben nach {seconds(myDoneAt)} s. Deine Antworten sind gesperrt.</p>
        {/if}
      </form>
    {:else if round.privileged}
      <div class="card">
        <p class="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-300">Lösungen</p>
        <div class="flex flex-wrap gap-2">
          {#each round.fields as f (f.id)}
            <span class="rounded-xl border-2 border-slate-700 px-3 py-1 font-mono text-sm font-bold text-slate-300">
              {f.number}<span class="ml-1 font-sans text-xs font-medium text-amber-300/80">{f.answer} 🔒</span>
            </span>
          {/each}
        </div>
        <p class="mt-2 text-xs text-amber-300/80">Die Lösungen siehst nur du als Moderator.</p>
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    <div class="card">
      <div class="mb-3 flex items-baseline justify-between">
        <h3 class="font-bold">Fortschritt</h3>
        <span class="text-xs text-slate-500">{doneCount} von {round.turnOrder.length} fertig</span>
      </div>
      <ul class="space-y-2">
        {#each players as p (p.id)}
          <li class="flex items-center gap-3 {readonly ? 'text-xl' : ''} {p.id === me ? 'text-indigo-200' : ''}">
            <span class="min-w-0 flex-1 break-words font-semibold">
              {p.name}
              {#if !p.connected}<span class="ml-2 text-xs font-normal text-amber-300">nicht verbunden</span>{/if}
            </span>
            <span class="shrink-0 text-sm text-slate-400">{p.filled} von {total}</span>
            {#if p.doneAt !== null}
              <span class="badge shrink-0 bg-emerald-500/20 text-emerald-300">fertig · {seconds(p.doneAt)} s</span>
            {:else}
              <span class="badge shrink-0 bg-slate-800 text-slate-400">tippt…</span>
            {/if}
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-xs text-slate-500">Texte bleiben geheim, bis der Host am Ende Feld für Feld prüft.</p>
    </div>
  </aside>
</div>
