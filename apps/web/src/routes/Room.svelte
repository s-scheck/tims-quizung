<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { CLOSE_CODES } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { router } from '../lib/router.svelte.ts';
  import { loadName, loadSession, saveName } from '../lib/session.ts';
  import Header from '../components/Header.svelte';
  import Lobby from '../components/Lobby.svelte';
  import CategoryPicker from '../components/CategoryPicker.svelte';
  import Board from '../components/Board.svelte';
  import TopXBoard from '../components/TopXBoard.svelte';
  import Reveal from '../components/Reveal.svelte';
  import TopXReveal from '../components/TopXReveal.svelte';
  import MatchBoard from '../components/MatchBoard.svelte';
  import MatchReveal from '../components/MatchReveal.svelte';
  import MapBoard from '../components/MapBoard.svelte';
  import MapReveal from '../components/MapReveal.svelte';
  import TimelineBoard from '../components/TimelineBoard.svelte';
  import TimelineReveal from '../components/TimelineReveal.svelte';
  import RiskBoard from '../components/RiskBoard.svelte';
  import RiskReveal from '../components/RiskReveal.svelte';
  import BluffBoard from '../components/BluffBoard.svelte';
  import BluffReveal from '../components/BluffReveal.svelte';
  import MorseBoard from '../components/MorseBoard.svelte';
  import MorseReveal from '../components/MorseReveal.svelte';
  import PictureBoard from '../components/PictureBoard.svelte';
  import PictureReveal from '../components/PictureReveal.svelte';
  import PictureAllBoard from '../components/PictureAllBoard.svelte';
  import PictureJudge from '../components/PictureJudge.svelte';
  import FacesBoard from '../components/FacesBoard.svelte';
  import FacesReveal from '../components/FacesReveal.svelte';
  import KidsBoard from '../components/KidsBoard.svelte';
  import KidsReveal from '../components/KidsReveal.svelte';
  import StillsBoard from '../components/StillsBoard.svelte';
  import StillsReveal from '../components/StillsReveal.svelte';
  import Scoring from '../components/Scoring.svelte';
  import Scoreboard from '../components/Scoreboard.svelte';
  import FinalStandings from '../components/FinalStandings.svelte';
  import Toast from '../components/Toast.svelte';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';

  let { code }: { code: string } = $props();

  let name = $state(loadName());
  const nameOk = $derived(name.trim().length >= 1 && name.trim().length <= 20);
  const view = $derived(client.view);
  const showNameForm = $derived(!client.me && (client.needsName || client.status === 'idle' || client.status === 'closed') && !client.terminal);

  onMount(() => {
    if (client.intentCode === code && client.status !== 'idle' && client.status !== 'closed') return;
    const session = loadSession(code);
    if (session) client.join(code, { token: session.token, name: loadName() || undefined });
    else client.needsName = true;
  });

  onDestroy(() => {
    if (client.me?.role === 'player') client.disconnect();
  });

  function joinWithName() {
    if (!nameOk) return;
    saveName(name.trim());
    client.join(code, { name: name.trim() });
  }

  function goHome() {
    client.disconnect();
    router.navigate('/');
  }

  const terminalText = $derived.by(() => {
    const t = client.terminal;
    if (!t) return null;
    if (t.code === CLOSE_CODES.KICKED) return 'Du wurdest aus dem Raum entfernt.';
    if (t.code === CLOSE_CODES.REPLACED) return 'Dieser Raum wurde in einem anderen Tab geöffnet.';
    if (t.code === CLOSE_CODES.ROOM_CLOSED) return 'Der Raum wurde geschlossen.';
    return t.reason || 'Verbindung beendet.';
  });
</script>

{#if terminalText}
  <main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
    <h1 class="text-2xl font-bold">{terminalText}</h1>
    <div class="flex gap-2">
      {#if client.terminal?.code === CLOSE_CODES.REPLACED}
        <button class="btn-primary" onclick={() => location.reload()}>Hier weiterspielen</button>
      {/if}
      <button class="btn-ghost" onclick={goHome}>Zur Startseite</button>
    </div>
  </main>
{:else if showNameForm}
  <main class="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
    <div>
      <p class="text-sm font-semibold uppercase tracking-widest text-indigo-400">Raum</p>
      <h1 class="font-mono text-5xl font-black tracking-[0.2em]">{code}</h1>
    </div>
    <label class="block">
      <span class="mb-1 block text-sm text-slate-400">Wie heißt du?</span>
      <input class="input" type="text" maxlength="20" placeholder="Dein Name" bind:value={name} onkeydown={(e) => e.key === 'Enter' && joinWithName()} />
    </label>
    {#if client.lastError}
      <p class="text-sm text-rose-400">{client.lastError.message}</p>
    {/if}
    <button class="btn-primary" disabled={!nameOk || client.status === 'connecting'} onclick={joinWithName}>Beitreten</button>
    <button class="btn-ghost" onclick={goHome}>Zur Startseite</button>
  </main>
{:else if !view}
  <main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-slate-400">
    <div class="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400"></div>
    <p>Verbinde mit Raum {code}…</p>
    <button class="btn-ghost mt-4" onclick={goHome}>Abbrechen</button>
  </main>
{:else}
  <div class="flex min-h-dvh flex-col">
    <Header {view} onLeave={() => { client.leave(); router.navigate('/'); }} />
    <ConnectionBanner />
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-4 {view.round?.game === 'map' && (view.phase === 'playing' || view.phase === 'host_decision') ? 'flex flex-col' : ''}">
      {#if view.phase === 'lobby'}
        <Lobby {view} />
      {:else if view.phase === 'choosing_category'}
        <CategoryPicker {view} />
      {:else if view.phase === 'playing' || view.phase === 'host_decision'}
        {#if view.round?.game === 'topx'}
          <TopXBoard {view} round={view.round} />
        {:else if view.round?.game === 'match'}
          <MatchBoard {view} round={view.round} />
        {:else if view.round?.game === 'map'}
          <MapBoard {view} round={view.round} />
        {:else if view.round?.game === 'timeline'}
          <TimelineBoard {view} round={view.round} />
        {:else if view.round?.game === 'risk'}
          <RiskBoard {view} round={view.round} />
        {:else if view.round?.game === 'bluff'}
          <BluffBoard {view} round={view.round} />
        {:else if view.round?.game === 'morse'}
          <MorseBoard {view} round={view.round} />
        {:else if view.round?.game === 'picture'}
          {#if view.round.mode === 'all'}
            <PictureAllBoard {view} round={view.round} />
          {:else}
            <PictureBoard {view} round={view.round} />
          {/if}
        {:else if view.round?.game === 'faces'}
          <FacesBoard {view} round={view.round} />
        {:else if view.round?.game === 'kids'}
          <KidsBoard {view} round={view.round} />
        {:else if view.round?.game === 'stills'}
          <StillsBoard {view} round={view.round} />
        {:else if view.round?.game === 'sort'}
          <Board {view} round={view.round} />
        {/if}
      {:else if view.phase === 'reveal' || view.phase === 'scoring'}
        {#if view.phase === 'scoring' && client.isHost}
          <Scoring {view} />
        {:else if view.round?.game === 'topx'}
          <TopXReveal {view} round={view.round} />
        {:else if view.round?.game === 'match'}
          <MatchReveal {view} round={view.round} />
        {:else if view.round?.game === 'map'}
          <MapReveal {view} round={view.round} />
        {:else if view.round?.game === 'timeline'}
          <TimelineReveal {view} round={view.round} />
        {:else if view.round?.game === 'risk'}
          <RiskReveal {view} round={view.round} />
        {:else if view.round?.game === 'bluff'}
          <BluffReveal {view} round={view.round} />
        {:else if view.round?.game === 'morse'}
          <MorseReveal {view} round={view.round} />
        {:else if view.round?.game === 'picture'}
          {#if view.round.mode === 'all'}
            <PictureJudge {view} round={view.round} />
          {:else}
            <PictureReveal {view} round={view.round} />
          {/if}
        {:else if view.round?.game === 'faces'}
          <FacesReveal {view} round={view.round} />
        {:else if view.round?.game === 'kids'}
          <KidsReveal {view} round={view.round} />
        {:else if view.round?.game === 'stills'}
          <StillsReveal {view} round={view.round} />
        {:else if view.round?.game === 'sort'}
          <Reveal {view} round={view.round} />
        {/if}
      {:else if view.phase === 'scoreboard'}
        <Scoreboard {view} />
      {:else if view.phase === 'finished'}
        <FinalStandings {view} />
      {/if}
    </main>
  </div>
{/if}
<Toast />
