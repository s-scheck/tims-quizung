<script lang="ts">
  import { onDestroy } from 'svelte';
  import { GUESS_MAX_LENGTH, SONG_PREVIEW_SECONDS, type RoomView, type SongSearchHit, type SongsRoundView } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { playerName } from '../lib/format.ts';
  import { searchSongs, SnippetPlayer } from '../lib/songs.ts';
  import { toasts } from '../lib/toast.svelte.ts';
  import SongCover from './SongCover.svelte';
  import TurnTimer from './TurnTimer.svelte';

  let { view, round, readonly = false }: { view: RoomView; round: SongsRoundView; readonly?: boolean } = $props();

  const isHost = $derived(!readonly && client.isHost);
  const participants = $derived(view.players.filter((p) => round.turnOrder.includes(p.id)));
  const isParticipant = $derived(!readonly && !!client.myId && round.turnOrder.includes(client.myId));
  const cur = $derived(round.current);
  const guessing = $derived(cur?.stage === 'guessing');
  const canGuess = $derived(isParticipant && view.phase === 'playing' && guessing && !cur?.myGuess);
  const lastSong = $derived(round.history[round.history.length - 1]);

  // ------------------------------------------------------------ Ton

  /** Dieses Gerät spielt den Ton: der Host, solange kein Bildschirm übernimmt, sonst der Bildschirm. */
  const audioHere = $derived(readonly ? round.audio === 'screen' : isHost && round.audio === 'host');
  const player = new SnippetPlayer();
  let sounding = $state(false);
  let loaded = $state<boolean | null>(null);
  let unlocked = $state(false);
  player.onState = (p) => (sounding = p);
  onDestroy(() => player.dispose());

  // Ausschnitt vorladen, sobald ein Song feststeht, damit der Klick auf Abspielen sofort klingt.
  const deezerId = $derived(cur?.deezer);
  $effect(() => {
    const id = deezerId;
    if (!audioHere || id === undefined) return;
    loaded = null;
    player.load(id).then((ok) => {
      if (cur?.deezer === id) loaded = ok;
    });
  });

  // Bildschirm: jeden neuen Abspielbefehl des Hosts selbst spielen.
  let lastNonce = 0;
  $effect(() => {
    const play = cur?.play;
    if (!readonly || !audioHere || !play || play.nonce === lastNonce) return;
    lastNonce = play.nonce;
    if (cur?.deezer !== undefined) player.load(cur.deezer).then(() => player.play(play.offset, play.seconds));
  });

  $effect(() => {
    if (!audioHere) player.stop();
  });

  // ------------------------------------------------------------ Host

  let offset = $state(0);
  let seconds = $state(10);
  const LENGTHS = [3, 5, 10, 20, 30];

  async function play(len = seconds) {
    if (!cur) return;
    const end = Math.min(SONG_PREVIEW_SECONDS - offset, len);
    client.send({ type: 'song_play', offset, seconds: end });
    if (!audioHere || cur.deezer === undefined) return;
    if (!(await player.load(cur.deezer))) {
      toasts.error('Zu diesem Song hat Deezer gerade keinen Ausschnitt.');
      return;
    }
    if (!(await player.play(offset, end))) toasts.error('Der Browser hat das Abspielen blockiert. Nochmal tippen.');
  }

  let query = $state('');
  let hits = $state<SongSearchHit[]>([]);
  let searching = $state(false);

  async function search() {
    const q = query.trim();
    if (q.length < 2) return;
    searching = true;
    try {
      hits = await searchSongs(q);
      if (hits.length === 0) toasts.info('Nichts gefunden.');
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      searching = false;
    }
  }

  function pick(h: SongSearchHit) {
    client.send({ type: 'song_pick', deezer: h.deezer, title: h.title, artist: h.artist });
    hits = [];
    query = '';
    offset = 0;
  }

  function nextFromList() {
    client.send({ type: 'song_next' });
    offset = 0;
  }

  let confirmingEnd = $state(false);
  function endPlaylist() {
    if (guessing && !confirmingEnd) {
      confirmingEnd = true;
      setTimeout(() => (confirmingEnd = false), 3500);
      return;
    }
    confirmingEnd = false;
    client.send({ type: 'end_round' });
  }

  // ------------------------------------------------------------ Spieler

  let title = $state('');
  let artist = $state('');
  let barHeight = $state(0);

  function logIn() {
    if (!title.trim() && !artist.trim()) return;
    client.send({ type: 'song_guess', title: title.trim(), artist: artist.trim() });
  }

  // Nur bei einem neuen Song leeren, nicht bei jedem Update der Sicht.
  const passNo = $derived(cur?.passNo ?? 0);
  $effect(() => {
    void passNo;
    title = '';
    artist = '';
  });

  const myResult = $derived(cur?.results?.find((r) => r.playerId === client.myId));

  const hint = $derived.by(() => {
    if (readonly) return '';
    if (isHost) {
      if (!cur) return 'Wähle den ersten Song: zufällig aus der Playlist oder über die Suche.';
      if (guessing) return cur.play ? 'Spiel den Ausschnitt so oft du willst. Aufgelöst wird, sobald alle eingeloggt haben.' : 'Spiel den Ausschnitt ab. Startsekunde und Länge kannst du wählen.';
      return 'Prüfe die Tipps und korrigiere bei Bedarf. Dann geht es zum nächsten Song.';
    }
    if (!isParticipant) return 'Du bist ab der nächsten Runde dabei.';
    if (!cur) return 'Gleich geht es los, der Host wählt den ersten Song.';
    if (guessing) return cur.myGuess ? 'Eingeloggt. Warte auf die anderen.' : 'Hör hin: Wie heißt der Song, und von wem ist er? Ein Feld reicht auch.';
    return '';
  });
</script>

<div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <section class="space-y-4">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <p class="text-sm text-slate-400">Songs erraten · {round.category.title}{cur ? ` · Song ${cur.passNo}` : ''}</p>
        <h2 class="text-2xl font-black sm:text-3xl {readonly ? 'text-5xl' : ''}">{round.category.question}</h2>
      </div>
      <TurnTimer deadline={round.turnDeadline} totalSeconds={view.settings.timerSeconds} size={readonly ? 64 : 48} />
    </header>

    {#if hint}<p class="text-sm text-slate-400">{hint}</p>{/if}

    {#if readonly && audioHere && !unlocked}
      <button class="btn-primary w-full py-6 text-2xl" onclick={() => player.unlock().then(() => (unlocked = true))}>Ton einschalten</button>
      <p class="text-center text-slate-400">Einmal antippen, dann spielt dieser Bildschirm die Ausschnitte ab.</p>
    {/if}

    {#if cur && guessing}
      <div class="card flex items-center gap-4 {sounding ? 'border-indigo-500' : ''}">
        <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-3xl font-black text-white {sounding ? 'animate-pulse' : ''}" aria-hidden="true">♪</div>
        <div class="min-w-0 flex-1">
          <p class="text-lg font-extrabold {readonly ? 'text-3xl' : ''}">{sounding ? 'Läuft …' : cur.play ? 'Gleich nochmal?' : 'Gleich geht es los'}</p>
          <p class="text-sm text-slate-400">{cur.loggedIn.length} von {participants.length} eingeloggt</p>
        </div>
      </div>
      <ul class="flex flex-wrap gap-2 {readonly ? 'text-lg' : 'text-sm'}">
        {#each participants as p (p.id)}
          {@const done = cur.loggedIn.includes(p.id)}
          <li class="rounded-full border px-3 py-1 font-semibold {done ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-400'}">{done ? '✓ ' : ''}{p.name}</li>
        {/each}
      </ul>
    {/if}

    {#if cur && cur.stage === 'resolved' && cur.song}
      <div class="card flex items-center gap-4 border-emerald-500/50 bg-emerald-500/10">
        <SongCover deezer={cur.song.deezer} size={readonly ? 120 : 80} />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-emerald-300">Song {cur.passNo}</p>
          <p class="break-words text-2xl font-black {readonly ? 'text-4xl' : ''}">{cur.song.title}</p>
          <p class="break-words text-lg font-bold text-slate-300 {readonly ? 'text-2xl' : ''}">{cur.song.artist}</p>
        </div>
        {#if myResult}
          <span class="text-3xl font-black {myResult.points > 0 ? 'text-emerald-300' : 'text-slate-500'}">+{myResult.points}</span>
        {/if}
      </div>

      <ul class="card divide-y divide-slate-800 p-0">
        {#each cur.results ?? [] as res (res.playerId)}
          <li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 {readonly ? 'text-xl' : ''} {res.playerId === client.myId ? 'bg-indigo-500/10' : ''}">
            <span class="w-24 shrink-0 truncate font-bold">{playerName(view, res.playerId)}</span>
            {#if res.title === null}
              <span class="flex-1 italic text-slate-500">kein Tipp</span>
            {:else}
              <span class="min-w-0 flex-1 break-words text-sm">
                <span class={res.titleOk ? 'font-bold text-emerald-300' : 'text-slate-400 line-through'}>{res.title || '–'}</span>
                <span class="text-slate-500"> · </span>
                <span class={res.artistOk ? 'font-bold text-emerald-300' : 'text-slate-400 line-through'}>{res.artist || '–'}</span>
              </span>
              {#if isHost}
                <span class="flex gap-1">
                  <button class="rounded-full px-2 py-0.5 text-[11px] font-extrabold {res.titleOk ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-slate-400'}" disabled={!res.title} onclick={() => client.send({ type: 'song_correct', playerId: res.playerId, part: 'title', ok: !res.titleOk })}>Titel</button>
                  <button class="rounded-full px-2 py-0.5 text-[11px] font-extrabold {res.artistOk ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-slate-400'}" disabled={!res.artist} onclick={() => client.send({ type: 'song_correct', playerId: res.playerId, part: 'artist', ok: !res.artistOk })}>Interpret</button>
                </span>
              {/if}
            {/if}
            <span class="w-8 text-right font-mono text-lg font-black {res.points > 0 ? 'text-emerald-300' : 'text-slate-500'}">+{res.points}</span>
          </li>
        {/each}
      </ul>
      {#if isHost}<p class="text-xs text-slate-500">Tippfehler oder anders geschrieben? Tippe auf Titel oder Interpret, um den Punkt zu geben oder zu nehmen.</p>{/if}
    {/if}

    {#if isHost && view.phase === 'playing'}
      <div class="card space-y-4">
        {#if cur && guessing}
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="font-black">Abspielen</h3>
            {#if cur.song}<span class="truncate text-sm text-amber-300/90">Nur du siehst: <b class="text-slate-200">{cur.song.title} – {cur.song.artist}</b></span>{/if}
          </div>
          <label class="block">
            <span class="mb-1 flex justify-between text-sm font-bold text-slate-400"><span>Startsekunde im Ausschnitt</span><span class="font-mono text-slate-200">{offset} s</span></span>
            <input type="range" min="0" max={SONG_PREVIEW_SECONDS - 1} step="1" class="w-full accent-[var(--color-indigo-500)]" bind:value={offset} />
          </label>
          <div>
            <span class="mb-1 block text-sm font-bold text-slate-400">Länge</span>
            <div class="flex flex-wrap gap-2">
              {#each LENGTHS as len (len)}
                <button class="rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition {seconds === len ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-800 text-slate-400'}" onclick={() => (seconds = len)}>{len} s</button>
              {/each}
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn-primary flex-1 py-4 text-lg" disabled={audioHere && loaded === false} onclick={() => play()}>{cur.play ? 'Nochmal abspielen' : 'Abspielen'}</button>
            {#if audioHere && sounding}<button class="btn-secondary" onclick={() => player.stop()}>Stopp</button>{/if}
          </div>
          {#if audioHere && loaded === false}<p class="text-sm text-rose-300">Zu diesem Song liefert Deezer gerade keinen Ausschnitt. Wähle einen anderen.</p>{/if}
          <button class="btn-secondary w-full" onclick={() => client.send({ type: 'song_resolve' })}>Jetzt auflösen ({cur.loggedIn.length} von {participants.length})</button>
        {:else}
          <h3 class="font-black">{cur ? 'Nächster Song' : 'Erster Song'}</h3>
          <button class="btn-primary w-full" disabled={round.remaining === 0} onclick={nextFromList}>
            {round.remaining === 0 ? 'Playlist ist durch' : `Zufällig aus „${round.category.title}“ (${round.remaining} übrig)`}
          </button>
          <form class="flex gap-2" onsubmit={(e) => { e.preventDefault(); search(); }}>
            <input class="input flex-1" type="search" placeholder="Oder suchen: Titel oder Interpret" bind:value={query} autocomplete="off" />
            <button class="btn-secondary" type="submit" disabled={searching || query.trim().length < 2}>{searching ? '…' : 'Suchen'}</button>
          </form>
          {#if hits.length > 0}
            <ul class="max-h-80 space-y-1 overflow-y-auto">
              {#each hits as h (h.deezer)}
                <li>
                  <button class="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-slate-900" onclick={() => pick(h)}>
                    {#if h.cover}<img src={h.cover} alt="" class="h-10 w-10 shrink-0 rounded-lg" />{/if}
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-bold">{h.title}</span>
                      <span class="block truncate text-sm text-slate-400">{h.artist}</span>
                    </span>
                    <span class="text-sm font-extrabold text-indigo-300">Wählen</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}

        <div class="flex flex-wrap items-center justify-between gap-2 border-t-2 border-slate-800 pt-3">
          {#if round.screenConnected}
            <div class="flex items-center gap-2 text-sm">
              <span class="font-bold text-slate-400">Ton:</span>
              {#each [['host', 'Mein Gerät'], ['screen', 'TV']] as [target, label] (target)}
                <button class="rounded-xl border-2 px-3 py-1 font-bold {round.audio === target ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-800 text-slate-400'}" onclick={() => client.send({ type: 'song_audio', target: target as 'host' | 'screen' })}>{label}</button>
              {/each}
            </div>
          {:else}
            <span class="text-xs text-slate-500">Ton kommt von deinem Gerät.</span>
          {/if}
          <button class="{confirmingEnd ? 'btn-danger' : 'btn-ghost'} px-3 py-1.5 text-sm" onclick={endPlaylist}>{confirmingEnd ? 'Wirklich beenden?' : 'Playlist beenden'}</button>
        </div>
      </div>
    {/if}
  </section>

  <aside class="space-y-4">
    {#if round.history.length > 0}
      <div class="card space-y-2">
        <div class="flex flex-wrap items-baseline justify-between gap-x-2">
          <h3 class="font-bold">Punkte in dieser Playlist</h3>
          <span class="text-xs text-slate-500">zählen nicht für die Gesamtwertung</span>
        </div>
        <ul class="space-y-1">
          {#each [...round.turnOrder].sort((a, b) => (round.totals[b] ?? 0) - (round.totals[a] ?? 0)) as id (id)}
            <li class="flex items-center gap-3 {readonly ? 'text-xl' : ''} {id === client.myId ? 'text-indigo-200' : ''}">
              <span class="min-w-0 flex-1 truncate font-semibold">{playerName(view, id)}</span>
              <span class="font-mono font-bold">{round.totals[id] ?? 0}</span>
            </li>
          {/each}
        </ul>
      </div>
      <div class="card space-y-2">
        <h3 class="font-bold">Bisher gespielt</h3>
        <ul class="space-y-2">
          {#each [...round.history].reverse() as p (p.passNo)}
            <li class="flex items-center gap-3 {p === lastSong ? '' : 'opacity-80'}">
              <SongCover deezer={p.song.deezer} size={40} />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold">{p.song.title}</span>
                <span class="block truncate text-sm text-slate-400">{p.song.artist}</span>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </aside>
</div>

{#if canGuess}
  <div aria-hidden="true" style="height:{barHeight}px"></div>
  <div bind:clientHeight={barHeight} class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <form class="mx-auto grid max-w-5xl gap-2 sm:grid-cols-[1fr_1fr_auto]" onsubmit={(e) => { e.preventDefault(); logIn(); }}>
      <input class="input" type="text" maxlength={GUESS_MAX_LENGTH} placeholder="Titel" autocomplete="off" autocapitalize="words" aria-label="Titel" bind:value={title} />
      <input class="input" type="text" maxlength={GUESS_MAX_LENGTH} placeholder="Interpret" autocomplete="off" autocapitalize="words" aria-label="Interpret" bind:value={artist} />
      <button class="btn-primary" type="submit" disabled={!title.trim() && !artist.trim()}>Einloggen</button>
    </form>
  </div>
{/if}
