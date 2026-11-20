<script lang="ts">
  import type { DungeonDoorView, DungeonQuestionView, RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { figureById } from '../../lib/avatar.ts';
  import { formatYear } from '../../lib/format.ts';
  import WorldMap from '../WorldMap.svelte';
  import Timeline from '../Timeline.svelte';
  import { doorFormat, doorHint, doorIcon } from './doorLabel.ts';
  import { dungeonTapFeedback } from './dungeonFeedback.ts';

  /**
   * Die Frage hinter der eigenen Tür, füllt die Höhe des Elternelements ohne Scrollen: oben die Karte mit der
   * Frage, in der Mitte die Eingabe je Format (a/b/c/d als 2×2, Karte und Zeitstrahl so groß wie möglich), unten im
   * Daumenbereich „Antwort festlegen“. Bei freier Antwort schrumpft der Elternrahmen mit der iOS-Tastatur.
   */
  let { view, question, door }: { view: RoomView; question: DungeonQuestionView; door: DungeonDoorView } = $props();

  const LETTERS = ['A', 'B', 'C', 'D'];
  let choice = $state<number | null>(null);
  let text = $state('');
  let pin = $state<{ lat: number; lng: number } | null>(null);
  let year = $state<number | null>(null);
  let sent = $state(false);

  const ready = $derived(
    !sent && (question.kind === 'choice' ? choice !== null : question.kind === 'map' ? pin !== null : question.kind === 'timeline' ? year !== null : text.trim().length > 0),
  );
  const long = $derived(question.prompt.length > 110);

  function submit() {
    if (!ready) return;
    sent = true;
    dungeonTapFeedback('answer');
    if (question.kind === 'choice' && choice !== null) client.send({ type: 'dungeon_answer', choice });
    else if (question.kind === 'map' && pin) client.send({ type: 'dungeon_answer', pin });
    else if (question.kind === 'timeline' && year !== null) client.send({ type: 'dungeon_answer', year });
    else client.send({ type: 'dungeon_answer', text: text.trim() });
    // Kommt keine Bestätigung (Fehler, Verbindung), darf man es noch einmal versuchen.
    setTimeout(() => (sent = false), 2500);
  }
</script>

<div class="flex h-full flex-col gap-2">
  <div class="card relative shrink-0 overflow-hidden rounded-2xl px-3.5 py-3">
    <p class="flex items-center gap-1.5 text-[0.65rem] font-extrabold uppercase tracking-wider text-amber-300/80">
      <span class="opacity-80">{doorIcon(door)}</span>
      <span class="truncate">{door.title}</span>
      <span class="shrink-0 text-amber-50/40">· {doorFormat(door)}</span>
    </p>
    {#if question.kind === 'map' || question.kind === 'timeline'}
      <h2 class="mt-1 text-[1.15rem] font-black leading-snug text-amber-50">{question.prompt} <span class="text-amber-200">{question.name}</span></h2>
    {:else}
      <h2 class="prompt mt-1 hyphens-auto break-words font-black leading-snug text-amber-50 {long ? 'text-[0.98rem]' : 'text-[1.15rem]'}" lang="de">{question.prompt}</h2>
    {/if}
    {#if question.kind !== 'choice'}
      <p class="mt-0.5 text-[0.72rem] text-amber-50/50">{doorHint(door)}</p>
    {/if}
  </div>

  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    {#if question.kind === 'choice'}
      <div class="mt-auto grid h-full max-h-[22rem] grid-cols-2 grid-rows-2 gap-2">
        {#each question.choices as c, i (i)}
          <button
            class="opt relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl px-3 pb-2.5 pt-7 text-center {choice === i ? 'opt-on' : ''}"
            onclick={() => (choice = i)}
          >
            <span class="letter absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full text-[0.75rem] font-black">{LETTERS[i]}</span>
            <span class="min-w-0 hyphens-auto break-words font-bold leading-snug {c.length > 40 ? 'text-[0.85rem]' : c.length > 18 ? 'text-[1rem]' : 'text-[1.15rem]'}" lang="de">{c}</span>
          </button>
        {/each}
      </div>
    {:else if question.kind === 'map'}
      <WorldMap
        class="min-h-0 flex-1 overflow-hidden rounded-2xl border border-amber-100/10"
        bounds={question.bounds}
        interactive
        {pin}
        pinHead={client.myId ? figureById(view, client.myId) : null}
        onPick={(p) => (pin = p)}
      />
      <p class="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-max max-w-[90%] rounded-full bg-black/60 px-3 py-1 text-center text-[0.7rem] font-semibold text-amber-50/80">
        {pin ? 'Pin ziehen oder neu antippen' : 'Tippe auf die Karte'}
      </p>
    {:else if question.kind === 'timeline'}
      <div class="flex flex-1 flex-col justify-center gap-2">
        <Timeline guess={year} interactive onPick={(y) => (year = y)} />
        <p class="text-center text-[1.1rem] font-black text-amber-200">{year === null ? 'Tippe auf den Zeitstrahl' : formatYear(year)}</p>
      </div>
    {:else}
      <div class="mt-auto"></div>
      <input
        class="field w-full rounded-2xl px-4 py-3 text-[1rem] font-semibold"
        type="text"
        maxlength="80"
        autocomplete="off"
        autocapitalize="sentences"
        enterkeyhint="send"
        placeholder={question.kind === 'topx' ? `Ein Eintrag aus den Top ${question.n}` : 'Deine Antwort'}
        bind:value={text}
        onkeydown={(e) => e.key === 'Enter' && submit()}
      />
    {/if}
  </div>

  <button class="go shrink-0 rounded-2xl px-4 py-3.5 text-[1rem] font-extrabold" disabled={!ready} onclick={submit}>Antwort festlegen</button>
</div>

<style>
  .card {
    background:
      radial-gradient(120% 90% at 0% 0%, rgba(246, 196, 83, 0.1), transparent 60%),
      linear-gradient(180deg, rgba(38, 30, 22, 0.95), rgba(22, 17, 12, 0.95));
    box-shadow:
      inset 0 0 0 1px rgba(246, 196, 83, 0.22),
      0 10px 30px -18px rgba(246, 170, 60, 0.4);
  }
  .prompt {
    display: -webkit-box;
    -webkit-line-clamp: 6;
    line-clamp: 6;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .opt {
    background: rgba(30, 24, 18, 0.9);
    color: rgba(255, 244, 225, 0.92);
    box-shadow:
      inset 0 0 0 1.5px rgba(255, 226, 170, 0.12),
      0 3px 0 rgba(0, 0, 0, 0.45);
    -webkit-tap-highlight-color: transparent;
    transition: transform 90ms ease, box-shadow 120ms ease, background-color 120ms ease;
  }
  .opt:active {
    transform: translateY(2px);
  }
  .letter {
    background: rgba(255, 236, 200, 0.1);
    color: rgba(255, 236, 200, 0.75);
  }
  .opt-on {
    background: rgba(246, 196, 83, 0.16);
    color: #fff4d6;
    box-shadow:
      inset 0 0 0 2px #f6c453,
      0 0 18px -4px rgba(246, 196, 83, 0.55);
  }
  .opt-on .letter {
    background: #f6c453;
    color: #2a1904;
  }
  .field {
    background: rgba(30, 24, 18, 0.95);
    color: #fff4e1;
    box-shadow: inset 0 0 0 1.5px rgba(255, 226, 170, 0.18);
    outline: none;
  }
  .field::placeholder {
    color: rgba(255, 236, 200, 0.35);
  }
  .field:focus {
    box-shadow: inset 0 0 0 2px #f6c453;
  }
  .go {
    background: linear-gradient(180deg, #f7cd6a, #e09a2e);
    color: #2a1904;
    box-shadow:
      0 3px 0 #8a5512,
      inset 0 1px 0 rgba(255, 255, 255, 0.45);
    -webkit-tap-highlight-color: transparent;
    transition: transform 90ms ease, box-shadow 90ms ease;
  }
  .go:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
  }
  .go:disabled {
    background: rgba(255, 236, 200, 0.08);
    color: rgba(255, 236, 200, 0.4);
    box-shadow: 0 3px 0 rgba(0, 0, 0, 0.35);
  }
</style>
