<script lang="ts">
  import type { DungeonRoundView, RoomView } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { playerName } from '../../lib/format.ts';
  import EndCategoryButton from '../EndCategoryButton.svelte';
  import PlayerHead from '../PlayerHead.svelte';
  import DungeonScene from './DungeonScene.svelte';
  import DungeonQuestion from './DungeonQuestion.svelte';
  import { doorFormat, doorHint } from './doorLabel.ts';

  let { view, round, readonly = false }: { view: RoomView; round: DungeonRoundView; readonly?: boolean } = $props();

  const me = $derived(readonly ? null : client.myId);
  const isHost = $derived(!readonly && client.isHost);
  const mine = $derived(me ? round.players[me] : undefined);
  const playing = $derived(view.phase === 'playing');
  const rooms = $derived(round.rooms.length);
  const iSkip = $derived(!!me && round.skipped.includes(me));
  const active = $derived(round.turnOrder.filter((id) => round.players[id]?.status === 'in' && !round.skipped.includes(id)));
  const waiting = $derived(
    round.stage === 'choosing' ? active.filter((id) => !round.walk[id]?.confirmed) : round.stage === 'answering' ? active.filter((id) => !round.answered.includes(id)) : [],
  );
  const anyoneIn = $derived(round.turnOrder.some((id) => round.players[id]?.status === 'in'));

  // ------------------------------------------------------------ eigene Wahl

  const myWalk = $derived(me ? round.walk[me] : undefined);
  const myRoom = $derived(round.stage === 'result' && me && round.results?.[me] ? round.results[me]!.room : (mine?.room ?? 0));
  const myDoors = $derived(round.rooms[myRoom] ?? []);
  const selectedDoor = $derived(myDoors.find((d) => d.id === myWalk?.doorId) ?? null);
  const canChoose = $derived(playing && round.stage === 'choosing' && mine?.status === 'in' && !iSkip && !myWalk?.confirmed);
  const myResult = $derived(me ? round.results?.[me] : undefined);
  const myQuestionDoor = $derived(round.myQuestion ? myDoors.find((d) => d.id === round.myQuestion!.doorId) : undefined);

  // Bestätigen erst, wenn die Figur angekommen ist.
  let pickedAt = $state(0);
  let now = $state(Date.now());
  $effect(() => {
    if (!pickedAt) return;
    const t = setTimeout(() => (now = Date.now()), 950);
    return () => clearTimeout(t);
  });
  const arrived = $derived(now - pickedAt >= 900);

  function pick(doorId: string) {
    if (!canChoose || myWalk?.doorId === doorId) return;
    pickedAt = Date.now();
    now = pickedAt;
    client.send({ type: 'dungeon_walk', doorId });
  }

  // ------------------------------------------------------------ Status

  function statusOf(id: string): { text: string; tone: string } {
    const p = round.players[id];
    if (!p) return { text: 'weg', tone: 'text-slate-500' };
    if (p.status === 'out' && !(round.stage === 'result' && round.results?.[id])) return { text: `draußen nach ${p.exitRound} Runden`, tone: 'text-amber-200' };
    if (round.stage === 'result') {
      const r = round.results?.[id];
      if (r) return r.correct ? { text: p.status === 'out' ? 'richtig, draußen!' : 'richtig', tone: 'text-emerald-300' } : { text: p.status === 'eliminated' ? 'falsch, raus' : 'falsch', tone: 'text-rose-300' };
    }
    if (p.status === 'eliminated') return { text: 'ausgeschieden', tone: 'text-slate-500' };
    if (round.skipped.includes(id)) return { text: 'setzt aus', tone: 'text-slate-500' };
    if (round.stage === 'choosing') {
      const w = round.walk[id];
      return w?.confirmed ? { text: '✓ in der Tür', tone: 'text-emerald-300' } : w?.doorId ? { text: 'geht zu einer Tür', tone: 'text-slate-300' } : { text: 'wählt …', tone: 'text-slate-400' };
    }
    if (round.stage === 'answering') return round.answered.includes(id) ? { text: '✓ geantwortet', tone: 'text-emerald-300' } : { text: 'antwortet …', tone: 'text-slate-400' };
    return { text: '', tone: '' };
  }

  const stageText = $derived(
    round.stage === 'choosing'
      ? waiting.length === 0
        ? 'Alle stehen bereit.'
        : `Türwahl · noch ${waiting.length} ${waiting.length === 1 ? 'Spieler' : 'Spieler'}`
      : round.stage === 'answering'
        ? `Alle antworten · noch ${waiting.length}`
        : 'Ergebnis der Fragerunde',
  );
  const out = $derived(round.ranking.filter((x) => x.status === 'out'));
</script>

{#snippet overview(large: boolean)}
  <div class="grid gap-2" style="grid-template-columns: repeat({rooms + 1}, minmax(0, 1fr))">
    {#each round.rooms as _, i (i)}
      <div class="min-w-0">
        <p class="mb-1 text-center font-bold text-slate-400 {large ? 'text-base' : 'text-xs'}">Raum {i + 1}</p>
        <DungeonScene {view} {round} roomIndex={i} compact />
      </div>
    {/each}
    <div class="min-w-0">
      <p class="mb-1 text-center font-bold text-amber-300 {large ? 'text-base' : 'text-xs'}">Ausgang</p>
      <div class="exit flex aspect-square flex-col items-center justify-center gap-1 rounded-xl p-1">
        {#each out as x (x.playerId)}
          <span class="flex items-center gap-1 {large ? 'text-sm' : 'text-[10px]'} font-bold text-amber-950">
            {x.place === 1 ? '👑' : `${x.place}.`}<PlayerHead {view} id={x.playerId} size={large ? 20 : 14} />
          </span>
        {:else}
          <span class="text-center {large ? 'text-sm' : 'text-[10px]'} font-semibold text-amber-950/60">noch niemand</span>
        {/each}
      </div>
    </div>
  </div>
{/snippet}

{#snippet playerList(large: boolean)}
  <ul class="grid gap-1.5 {large ? 'grid-cols-3 text-lg' : 'grid-cols-1 text-sm sm:grid-cols-2'}">
    {#each round.turnOrder as id (id)}
      {@const p = round.players[id]}
      {@const st = statusOf(id)}
      {#if p}
        <li class="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 {id === me ? 'border-indigo-500/50' : ''}">
          <PlayerHead {view} {id} size={large ? 26 : 20} />
          <span class="min-w-0 flex-1 truncate font-semibold">{playerName(view, id)}</span>
          <span class="text-xs text-slate-400">{p.status === 'out' ? '🏆' : `R${p.room + 1}`}</span>
          {#if p.wrong > 0}<span class="text-xs font-bold text-rose-400">{'✗'.repeat(Math.min(p.wrong, 6))}</span>{/if}
          <span class="shrink-0 text-xs font-semibold {st.tone}">{st.text}</span>
        </li>
      {/if}
    {/each}
  </ul>
{/snippet}

{#if readonly}
  <!-- Fernseher: der ganze Dungeon auf einen Blick -->
  <div class="space-y-4">
    <div class="flex items-baseline justify-between">
      <h2 class="text-3xl font-black">Dungeon <span class="text-slate-500">· Fragerunde {round.roundNo}</span></h2>
      <p class="text-xl font-semibold text-slate-300">{stageText}</p>
    </div>
    {@render overview(true)}
    {@render playerList(true)}
  </div>
{:else if mine}
  <!-- Handy eines Mitspielers -->
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div>
        <p class="text-sm text-slate-400">Dungeon · Fragerunde {round.roundNo}</p>
        <h2 class="text-2xl font-black">{mine.status === 'out' ? 'Draußen!' : `Raum ${myRoom + 1} von ${rooms}`}</h2>
      </div>
      <div class="text-right text-sm">
        <p class="text-slate-400">Fehlversuche</p>
        <p class="font-black text-rose-300">{mine.wrong === 0 ? '–' : '✗'.repeat(Math.min(mine.wrong, 8))}</p>
      </div>
    </div>

    {#if round.stage === 'answering' && round.myQuestion && myQuestionDoor && !round.myAnswer}
      <DungeonQuestion {view} question={round.myQuestion} door={myQuestionDoor} />
    {:else if mine.status === 'in' || round.stage === 'result'}
      <DungeonScene {view} {round} roomIndex={myRoom} meId={me} interactive={canChoose} selected={myWalk?.doorId ?? null} onPick={pick} />

      {#if round.stage === 'choosing' && canChoose}
        {#if selectedDoor}
          <div class="card space-y-1 border-amber-700/40">
            <p class="text-xs font-semibold uppercase tracking-wider text-amber-300/80">{doorFormat(selectedDoor)}</p>
            <p class="text-lg font-black">{selectedDoor.title}</p>
            <p class="text-sm text-slate-400">{doorHint(selectedDoor)}</p>
          </div>
          <button class="btn-primary w-full py-4 text-xl" disabled={!arrived} onclick={() => client.send({ type: 'dungeon_enter' })}>
            {arrived ? 'Durch die Tür gehen' : 'Unterwegs …'}
          </button>
        {:else}
          <p class="text-center text-slate-300">Tippe eine Tür an. {mine.locked.length > 0 ? `${mine.locked.length} von ${myDoors.length} sind für dich zu.` : ''}</p>
        {/if}
      {:else if round.stage === 'choosing' && iSkip}
        <p class="card text-center text-slate-300">Der Host hat dich übersprungen, du setzt diese Runde aus.</p>
      {:else if round.stage === 'choosing'}
        <p class="card text-center text-slate-300">Du stehst in der Tür. Es geht los, sobald alle gewählt haben.</p>
      {:else if round.stage === 'answering'}
        <p class="card text-center text-slate-300">
          {iSkip ? 'Du setzt diese Runde aus.' : `Deine Antwort: ${round.myAnswer ?? '–'}.`} Warte auf die anderen …
        </p>
      {:else if myResult}
        <div class="card text-center {myResult.correct ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-rose-500/50 bg-rose-500/10'}">
          {#if myResult.correct}
            <p class="text-2xl font-black text-emerald-300">{mine.status === 'out' ? 'Richtig! Du bist draußen!' : `Richtig! Weiter in Raum ${mine.room + 1}`}</p>
          {:else}
            <p class="text-2xl font-black text-rose-300">{mine.status === 'eliminated' ? 'Falsch. Alle Türen zu, du bist raus.' : 'Falsch. Diese Tür ist für dich zu.'}</p>
          {/if}
          <p class="mt-1 text-sm text-slate-400">Die Lösungen gibt es am Ende.</p>
        </div>
      {:else}
        <p class="card text-center text-slate-400">Du hast diese Runde ausgesetzt.</p>
      {/if}
    {:else}
      <div class="card text-center">
        <p class="text-xl font-black {mine.status === 'out' ? 'text-amber-200' : 'text-slate-300'}">
          {mine.status === 'out' ? `Du bist draußen, nach ${mine.exitRound} Fragerunden.` : 'Du bist ausgeschieden.'}
        </p>
        <p class="text-sm text-slate-400">Schau den anderen zu.</p>
      </div>
      {@render overview(false)}
    {/if}

    {@render playerList(false)}
  </div>
{:else}
  <!-- Moderierender Host oder Zuschauer -->
  <div class="space-y-3">
    <div>
      <p class="text-sm text-slate-400">Dungeon · Fragerunde {round.roundNo}</p>
      <h2 class="text-2xl font-black">{stageText}</h2>
    </div>
    {@render overview(false)}
    {@render playerList(false)}
  </div>
{/if}

{#if isHost && playing}
  <div class="mt-3 space-y-2">
    {#if waiting.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each waiting as id (id)}
          <button class="btn-secondary text-sm" onclick={() => client.send({ type: 'dungeon_skip', playerId: id })}>Ohne {playerName(view, id)} weiter</button>
        {/each}
      </div>
    {/if}
    {#if round.stage === 'result'}
      <button class="btn-primary w-full text-lg" onclick={() => client.send({ type: 'dungeon_next' })}>{anyoneIn ? 'Nächste Türwahl' : 'Zur Auswertung'}</button>
    {/if}
    <EndCategoryButton {view} label="Dungeon beenden" title="Alle bleiben, wo sie sind, und es geht zur Auswertung." />
  </div>
{/if}

<style>
  .exit {
    background:
      radial-gradient(circle at 50% 40%, rgb(255 236 170 / 0.95), rgb(255 190 80 / 0.85) 55%, rgb(180 110 30 / 0.9));
    box-shadow:
      0 0 30px rgb(255 200 90 / 0.35),
      inset 0 0 0 2px rgb(255 255 255 / 0.35);
  }
</style>
