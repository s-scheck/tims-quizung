<script lang="ts">
  import type { DungeonDoorView, DungeonQuestionView, RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { figureById } from '../../lib/avatar.ts';
  import { formatYear } from '../../lib/format.ts';
  import WorldMap from '../WorldMap.svelte';
  import Timeline from '../Timeline.svelte';
  import { doorFormat, doorHint } from './doorLabel.ts';

  /** Die Frage hinter der eigenen Tür: Eingabe je Format, immer mit einer Bestätigung vor dem Absenden. */
  let { view, question, door }: { view: RoomView; question: DungeonQuestionView; door: DungeonDoorView } = $props();

  const LETTERS = ['A', 'B', 'C', 'D'];
  let choice = $state<number | null>(null);
  let text = $state('');
  let pin = $state<{ lat: number; lng: number } | null>(null);
  let year = $state<number | null>(null);

  const ready = $derived(
    question.kind === 'choice' ? choice !== null : question.kind === 'map' ? pin !== null : question.kind === 'timeline' ? year !== null : text.trim().length > 0,
  );

  function submit() {
    if (!ready) return;
    if (question.kind === 'choice' && choice !== null) client.send({ type: 'dungeon_answer', choice });
    else if (question.kind === 'map' && pin) client.send({ type: 'dungeon_answer', pin });
    else if (question.kind === 'timeline' && year !== null) client.send({ type: 'dungeon_answer', year });
    else client.send({ type: 'dungeon_answer', text: text.trim() });
  }
</script>

<div class="space-y-3">
  <div class="rounded-2xl border border-amber-700/40 bg-gradient-to-b from-stone-900 to-slate-950 p-4 shadow-[0_0_30px_rgb(180_120_40/0.15)]">
    <p class="text-xs font-semibold uppercase tracking-wider text-amber-300/80">{door.title} · {doorFormat(door)}</p>
    {#if question.kind === 'map'}
      <h2 class="mt-1 text-2xl font-black">{question.prompt} <span class="text-amber-200">{question.name}</span></h2>
    {:else if question.kind === 'timeline'}
      <h2 class="mt-1 text-2xl font-black">{question.prompt} <span class="text-amber-200">{question.name}</span></h2>
    {:else}
      <h2 class="mt-1 break-words text-2xl font-black">{question.prompt}</h2>
    {/if}
    <p class="mt-1 text-sm text-slate-400">{doorHint(door)}</p>
  </div>

  {#if question.kind === 'choice'}
    <div class="grid grid-cols-2 gap-2">
      {#each question.choices as c, i (i)}
        <button
          class="flex min-h-14 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left font-bold transition {choice === i ? 'border-amber-400 bg-amber-400/15 text-amber-100' : 'border-slate-700 hover:border-slate-500'}"
          onclick={() => (choice = i)}
        >
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 font-black">{LETTERS[i]}</span>
          <span class="min-w-0 break-words">{c}</span>
        </button>
      {/each}
    </div>
  {:else if question.kind === 'map'}
    <WorldMap
      class="h-[46dvh] min-h-[260px] overflow-hidden rounded-2xl border border-slate-800"
      bounds={question.bounds}
      interactive
      {pin}
      pinHead={client.myId ? figureById(view, client.myId) : null}
      onPick={(p) => (pin = p)}
    />
    <p class="text-xs text-slate-500">{pin ? 'Pin ziehen oder neu antippen, dann bestätigen.' : 'Tippe auf die Karte, um deinen Pin zu setzen.'}</p>
  {:else if question.kind === 'timeline'}
    <Timeline guess={year} interactive onPick={(y) => (year = y)} />
    <p class="text-center text-lg font-black text-amber-200">{year === null ? 'Tippe auf den Zeitstrahl' : formatYear(year)}</p>
  {:else}
    <input
      class="input text-lg"
      type="text"
      maxlength="80"
      autocomplete="off"
      placeholder={question.kind === 'topx' ? `Ein Eintrag aus den Top ${question.n}` : 'Deine Antwort'}
      bind:value={text}
      onkeydown={(e) => e.key === 'Enter' && submit()}
    />
  {/if}

  <button class="btn-primary w-full py-4 text-xl" disabled={!ready} onclick={submit}>Antwort festlegen</button>
</div>
