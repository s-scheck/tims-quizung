<script lang="ts">
  import { onMount } from 'svelte';
  import type { EditorEntry } from '@quiz/shared';
  import { editorApi } from '../lib/editorApi.ts';
  import { EDITOR_GAMES } from '../lib/editorModel.ts';
  import { router } from '../lib/router.svelte.ts';
  import StatusBadges from '../components/editor/StatusBadges.svelte';

  let entries = $state<EditorEntry[]>([]);
  let editable = $state(true);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let query = $state('');

  onMount(async () => {
    try {
      const res = await editorApi.list();
      entries = res.entries;
      editable = res.editable;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.title.toLowerCase().includes(q) || e.id.includes(q)) : entries;
  });
</script>

<main class="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
  <header class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <button class="btn-ghost -ml-3 text-sm" onclick={() => router.navigate('/')}>← Startseite</button>
      <h1 class="text-3xl font-black">Kategorien bearbeiten</h1>
      <p class="text-slate-400">Eigene Listen anlegen, mitgelieferte ändern oder ausblenden. Änderungen gelten ab der nächsten Runde.</p>
    </div>
    <input class="input max-w-xs" type="search" placeholder="Suchen …" bind:value={query} aria-label="Kategorien durchsuchen" />
  </header>

  {#if !editable}
    <p class="card border-amber-500/60 bg-amber-500/10 text-sm font-semibold text-amber-200">
      Der Server hat keinen Datenordner (DATA_DIR). Du kannst dir alles ansehen, aber nichts speichern.
    </p>
  {/if}

  {#if loading}
    <p class="text-slate-400">Lade Kategorien …</p>
  {:else if error}
    <p class="card border-rose-500/60 text-rose-300">{error}</p>
  {:else}
    {#each EDITOR_GAMES as game (game.id)}
      {@const list = filtered.filter((e) => e.games.includes(game.id))}
      <section class="space-y-3">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 class="text-xl font-black">{game.name} <span class="text-base font-bold text-slate-500">{list.length}</span></h2>
            <p class="text-xs text-slate-500">{game.hint}</p>
          </div>
          {#if editable}
            <button class="btn-secondary px-4 py-2 text-sm" onclick={() => router.navigate(`/editor/neu/${game.id}`)}>+ Neue Liste</button>
          {/if}
        </div>
        {#if list.length === 0}
          <p class="text-sm text-slate-500">{query ? 'Keine Treffer.' : 'Noch keine Listen.'}</p>
        {:else}
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each list as e (e.id)}
              <button class="card flex flex-col items-start gap-1.5 text-left {e.status === 'hidden' ? 'opacity-60' : ''}" onclick={() => router.navigate(`/editor/${e.id}`)}>
                <span class="font-bold">{e.title}</span>
                <span class="text-xs text-slate-500">{e.count} Einträge{e.games.length > 1 ? ` · auch für ${e.games.filter((g) => g !== game.id).map((g) => EDITOR_GAMES.find((x) => x.id === g)?.name).join(', ')}` : ''}</span>
                <StatusBadges entry={e} />
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  {/if}
</main>
