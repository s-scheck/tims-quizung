<script lang="ts">
  import { onMount } from 'svelte';
  import type { EditorEntry, GameId } from '@quiz/shared';
  import { editorApi } from '../lib/editorApi.ts';
  import {
    cellIssues,
    COLUMNS,
    DECOY_COLUMNS,
    draftFromRaw,
    draftToRaw,
    EDITOR_GAMES,
    emptyRow,
    FIELDS,
    makeId,
    newDraft,
    parseCoord,
    parseLatLng,
    sortRowsByValue,
    validate,
    type Draft,
    type Raw,
  } from '../lib/editorModel.ts';
  import { router } from '../lib/router.svelte.ts';
  import { toasts } from '../lib/toast.svelte.ts';
  import EditTable from '../components/editor/EditTable.svelte';
  import StatusBadges from '../components/editor/StatusBadges.svelte';
  import Toast from '../components/Toast.svelte';
  import WorldMap, { type MapMarker } from '../components/WorldMap.svelte';
  import PictureEditor from '../components/editor/PictureEditor.svelte';

  const ORDER_OPTIONS: [string, string][] = [
    ['desc', 'Größter Wert zuerst'],
    ['asc', 'Kleinster Wert zuerst'],
  ];

  let { id = null, game = null }: { id?: string | null; game?: GameId | null } = $props();

  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let editable = $state(true);
  let entry = $state<EditorEntry | null>(null);
  let base = $state<Raw>({});
  let draft = $state<Draft>(newDraft('sort'));
  let currentId = $state<string | null>(null);
  let taken = $state(new Set<string>());
  let savedJson = $state('');
  let saving = $state(false);
  let selected = $state<number | null>(null);

  onMount(async () => {
    try {
      const list = await editorApi.list();
      editable = list.editable;
      taken = new Set(list.entries.map((e) => e.id));
      if (id) {
        const doc = await editorApi.get(id);
        entry = doc.entry;
        base = doc.raw;
        draft = draftFromRaw(doc.raw);
        currentId = id;
        savedJson = JSON.stringify(draftToRaw(draft, id, base));
      } else {
        draft = newDraft(game ?? 'sort');
        savedJson = JSON.stringify(draftToRaw(draft, makeId('', game ?? 'sort', taken)));
      }
    } catch (e) {
      loadError = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  const mainGame = $derived<GameId>(game ?? draft.games[0] ?? EDITOR_GAMES.find((g) => g.kind === draft.kind)?.id ?? 'sort');
  const previewId = $derived(currentId ?? makeId(draft.meta.title ?? '', mainGame, taken));
  const raw = $derived(draftToRaw(draft, previewId, base));
  const problem = $derived(validate(raw, previewId));
  const issues = $derived(cellIssues(draft.kind, draft.rows));
  const dirty = $derived(JSON.stringify(raw) !== savedJson);
  const isNew = $derived(currentId === null);
  const needsSorting = $derived(draft.kind === 'ranked' && (draft.games.includes('topx') || draft.games.includes('risk')));
  const filledRows = $derived(draft.rows.filter((r) => Object.values(r).some((v) => v.trim())).length);

  // ------------------------------------------------------------ Aktionen

  async function save() {
    if (!editable || saving) return;
    saving = true;
    try {
      const saveId = previewId;
      const doc = await editorApi.save(saveId, raw);
      entry = doc.entry;
      base = doc.raw;
      savedJson = JSON.stringify(draftToRaw(draft, saveId, base));
      if (doc.entry.draft) toasts.info('Als Entwurf gespeichert. Im Spiel erscheint die Liste, sobald alles passt.');
      else toasts.success('Gespeichert. Ab der nächsten Runde im Spiel.');
      if (currentId === null) {
        currentId = saveId;
        router.navigate(`/editor/${saveId}`, true);
      }
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      saving = false;
    }
  }

  async function removeOrHide() {
    if (!currentId || !entry) return;
    const builtin = entry.status === 'builtin' || entry.status === 'modified';
    const ok = confirm(builtin ? 'Liste ausblenden? Sie taucht dann nicht mehr in der Spielauswahl auf. Einblenden geht jederzeit wieder.' : 'Liste endgültig löschen?');
    if (!ok) return;
    try {
      const res = await editorApi.remove(currentId);
      if (!res.entry) {
        savedJson = JSON.stringify(raw);
        toasts.success('Gelöscht.');
        router.navigate('/editor');
        return;
      }
      entry = res.entry;
      toasts.success('Ausgeblendet.');
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function reset() {
    if (!currentId || !entry) return;
    const unhide = entry.status === 'hidden';
    if (!unhide && !confirm('Alle Änderungen verwerfen und das Original wiederherstellen?')) return;
    try {
      await editorApi.reset(currentId);
      const doc = await editorApi.get(currentId);
      entry = doc.entry;
      base = doc.raw;
      draft = draftFromRaw(doc.raw);
      savedJson = JSON.stringify(draftToRaw(draft, currentId, base));
      toasts.success(unhide ? 'Wieder eingeblendet.' : 'Original wiederhergestellt.');
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    }
  }

  function back() {
    if (dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
    savedJson = JSON.stringify(raw);
    router.navigate('/editor');
  }

  function toggleGame(g: GameId) {
    draft.games = draft.games.includes(g) ? draft.games.filter((x) => x !== g) : [...draft.games, g];
  }

  // -------------------------------------------------------------- Karte

  /** „48.8584, 2.2945“ in Breite oder Länge einfügen füllt beide Felder. */
  function pasteCoords(rowIndex: number, key: string, text: string): boolean {
    if (draft.kind !== 'places' || (key !== 'lat' && key !== 'lng')) return false;
    const p = parseLatLng(text);
    if (!p) return false;
    draft.rows[rowIndex]!.lat = String(p.lat);
    draft.rows[rowIndex]!.lng = String(p.lng);
    return true;
  }

  function pickOnMap(p: { lat: number; lng: number }) {
    let i = selected ?? draft.rows.findIndex((r) => !r.lat?.trim() && !r.lng?.trim());
    if (i === -1 || i === null) {
      draft.rows.push(emptyRow(COLUMNS.places));
      i = draft.rows.length - 1;
    }
    selected = i;
    draft.rows[i]!.lat = p.lat.toFixed(4);
    draft.rows[i]!.lng = p.lng.toFixed(4);
  }

  const coordsOf = (i: number) => {
    const r = draft.rows[i];
    if (!r) return null;
    const lat = parseCoord(r.lat ?? '');
    const lng = parseCoord(r.lng ?? '');
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  };

  // --------------------------------------------------------------- Bild

  let uploading = $state<'image' | 'original' | null>(null);

  const imageUrl = (name: string) => (/^https?:\/\//.test(name) ? name : `/images/${name}`);

  function imageRatio(url: string): Promise<number | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  async function uploadPicture(kind: 'image' | 'original', input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file || uploading) return;
    uploading = kind;
    try {
      const res = await editorApi.uploadImage(file);
      draft.meta[kind] = res.name;
      toasts.success(kind === 'image' ? 'Bild hochgeladen. Jetzt Felder zeichnen.' : 'Original hochgeladen.');
      const other = draft.meta[kind === 'image' ? 'original' : 'image'];
      if (other) {
        const [a, b] = await Promise.all([imageRatio(imageUrl(res.name)), imageRatio(imageUrl(other))]);
        if (a && b && Math.abs(a - b) / b > 0.02) toasts.error('Achtung: Bild und Original haben unterschiedliche Proportionen, die Ausschnitte passen dann nicht.');
      }
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    } finally {
      uploading = null;
    }
  }

  // ------------------------------------------------------------ Promis

  let bulkUploading = $state(0);

  async function uploadRowImage(rowIndex: number, file: File) {
    try {
      const res = await editorApi.uploadImage(file);
      const row = draft.rows[rowIndex];
      if (row) row.image = res.name;
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : String(e));
    }
  }

  /** „Angela_Merkel.jpg“ → „Angela Merkel“. */
  function nameFromFile(file: File): string {
    return file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  async function uploadMany(input: HTMLInputElement) {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0 || bulkUploading) return;
    bulkUploading = files.length;
    let failed = 0;
    for (const file of files) {
      try {
        const res = await editorApi.uploadImage(file);
        const name = nameFromFile(file);
        const empty = draft.rows.findIndex((r) => !(r.name ?? '').trim() && !(r.image ?? '').trim());
        const row = { name, aliases: '', image: res.name };
        if (empty === -1) draft.rows.push(row);
        else draft.rows[empty] = row;
      } catch {
        failed++;
      } finally {
        bulkUploading--;
      }
    }
    if (failed) toasts.error(`${failed} ${failed === 1 ? 'Bild' : 'Bilder'} konnten nicht hochgeladen werden.`);
    else toasts.success(`${files.length} ${files.length === 1 ? 'Bild' : 'Bilder'} hochgeladen. Namen prüfen, dann speichern.`);
  }

  const markers = $derived<MapMarker[]>(
    draft.kind !== 'places'
      ? []
      : draft.rows.flatMap((r, i) => {
          const c = i === selected ? null : coordsOf(i);
          return c ? [{ id: String(i), ...c, label: String(i + 1), color: '#1cb0f6' }] : [];
        }),
  );
</script>

<svelte:window
  onbeforeunload={(e) => {
    if (dirty) e.preventDefault();
  }}
/>

<Toast />

<main class="mx-auto w-full max-w-6xl space-y-5 px-4 pb-28 pt-6">
  {#if loading}
    <p class="text-slate-400">Lade …</p>
  {:else if loadError}
    <button class="btn-ghost -ml-3 text-sm" onclick={() => router.navigate('/editor')}>← Alle Kategorien</button>
    <p class="card border-rose-500/60 text-rose-300">{loadError}</p>
  {:else}
    <header class="space-y-2">
      <button class="btn-ghost -ml-3 text-sm" onclick={back}>← Alle Kategorien</button>
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-3xl font-black">{draft.meta.title?.trim() || (isNew ? 'Neue Liste' : previewId)}</h1>
        {#if entry}<StatusBadges entry={entry} />{/if}
      </div>
      <p class="font-mono text-xs text-slate-500">
        {isNew ? 'Wird gespeichert als' : 'Datei'} {previewId}.json · {EDITOR_GAMES.filter((g) => (draft.kind === 'ranked' ? draft.games.includes(g.id) : g.kind === draft.kind)).map((g) => g.name).join(', ') || 'kein Spiel gewählt'}
      </p>
    </header>

    {#if entry?.status === 'hidden'}
      <div class="card flex flex-wrap items-center justify-between gap-3 border-slate-700 bg-slate-900">
        <p class="font-semibold">Diese Liste ist ausgeblendet und taucht nicht in der Spielauswahl auf.</p>
        <button class="btn-secondary px-4 py-2 text-sm" onclick={reset}>Wieder einblenden</button>
      </div>
    {/if}

    <div class="card flex items-start gap-3 {problem ? 'border-amber-500/70 bg-amber-500/10' : 'border-emerald-500/70 bg-emerald-500/10'}">
      <span class="mt-1 h-3 w-3 shrink-0 rounded-full {problem ? 'bg-amber-500' : 'bg-emerald-500'}"></span>
      <div>
        <p class="font-extrabold {problem ? 'text-amber-200' : 'text-emerald-200'}">{problem ? 'Noch nicht spielbar' : 'Spielbereit'}</p>
        <p class="text-sm {problem ? 'text-amber-100' : 'text-emerald-100'}">
          {problem ? `${problem}. Speichern geht trotzdem, als Entwurf.` : `${filledRows} Einträge, alle Regeln erfüllt.`}
        </p>
      </div>
    </div>

    <section class="card space-y-4">
      <h2 class="text-lg font-black">Angaben</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        {#each FIELDS[draft.kind] as f (f.key)}
          {#if f.type === 'text'}
            <label class="block {f.key === 'question' ? 'sm:col-span-2' : ''}">
              <span class="mb-1 block text-sm font-bold text-slate-400">{f.label}{#if f.optional}<span class="font-semibold text-slate-500">{' (optional)'}</span>{/if}</span>
              <input class="input" type="text" placeholder={f.placeholder ?? ''} bind:value={draft.meta[f.key]} />
            </label>
          {:else if f.type === 'order'}
            <div>
              <span class="mb-1 block text-sm font-bold text-slate-400">{f.label}</span>
              <div class="flex gap-2">
                {#each ORDER_OPTIONS as [value, text] (value)}
                  <button
                    type="button"
                    class="flex-1 rounded-xl border-2 px-3 py-2 text-sm font-bold transition {draft.meta.order === value ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-800 text-slate-400 hover:border-slate-700'}"
                    onclick={() => (draft.meta.order = value)}>{text}</button
                  >
                {/each}
              </div>
            </div>
          {:else if f.type === 'plain'}
            <label class="flex items-center gap-2 self-end pb-2 text-sm font-semibold">
              <input type="checkbox" class="h-4 w-4 accent-[var(--color-indigo-500)]" checked={draft.meta.valueFormat === 'plain'} onchange={(e) => (draft.meta.valueFormat = e.currentTarget.checked ? 'plain' : '')} />
              {f.label}
            </label>
          {/if}
        {/each}
      </div>

      {#if draft.kind === 'ranked'}
        <div>
          <span class="mb-1 block text-sm font-bold text-slate-400">Spiele</span>
          <div class="flex flex-wrap gap-2">
            {#each EDITOR_GAMES.filter((g) => g.kind === 'ranked') as g (g.id)}
              <button
                type="button"
                class="rounded-xl border-2 px-3 py-2 text-sm font-bold transition {draft.games.includes(g.id) ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-800 text-slate-400 hover:border-slate-700'}"
                aria-pressed={draft.games.includes(g.id)}
                onclick={() => toggleGame(g.id)}>{g.name}</button
              >
            {/each}
          </div>
          <p class="mt-1 text-xs text-slate-500">{EDITOR_GAMES.filter((g) => draft.games.includes(g.id)).map((g) => `${g.name}: ${g.hint}`).join(' ')}</p>
        </div>
      {/if}
    </section>

    <section class="space-y-3">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="text-lg font-black">
            {draft.kind === 'pairs' ? 'Paare' : draft.kind === 'places' ? 'Orte' : draft.kind === 'events' ? 'Ereignisse' : draft.kind === 'prompts' ? 'Aufgaben' : draft.kind === 'picture' ? 'Felder' : draft.kind === 'faces' ? 'Personen' : 'Einträge'}
            <span class="text-slate-500">{filledRows}</span>
          </h2>
          <p class="text-xs text-slate-500">
            {#if draft.kind === 'places'}Zeile anklicken, dann auf die Karte tippen. Koordinaten aus Google Maps ("48.8584, 2.2945") lassen sich direkt einfügen.
            {:else if draft.kind === 'events'}Ein Jahr oder eine Spanne. Vor Christus als negative Zahl oder "44 v. Chr.".
            {:else if draft.kind === 'pairs'}Jede Karte gehört zu genau einem Ziel. Ziele müssen eindeutig sein.
            {:else if draft.kind === 'prompts'}Jede Aufgabe mit ihrer echten Antwort. Die Spieler erfinden später eigene Antworten dazu, also muss die echte wirklich stimmen.
            {:else if draft.kind === 'picture'}Bild hochladen, dann Felder im Bild aufziehen und zu jedem die Antwort eintragen. Die Nummer folgt der Reihenfolge der Liste.
            {:else if draft.kind === 'faces'}Je Person ein Foto. Aliasse (mit Komma) helfen dem Host beim Prüfen der Tipps. Bilder vorher verkleinern, höchstens 8 MB.
            {:else if needsSorting}Die Reihenfolge ist der Platz: Platz 1 zuerst. Zahlen wie "17.098.246" oder "1.450,9" gehen.
            {:else}Reihenfolge egal, Werte müssen eindeutig sein. Zahlen wie "17.098.246" oder "1.450,9" gehen.{/if}
          </p>
        </div>
        {#if needsSorting}
          <button type="button" class="btn-secondary px-4 py-2 text-sm" onclick={() => (draft.rows = sortRowsByValue(draft.rows, draft.meta.order ?? 'desc'))}>Nach Wert sortieren</button>
        {/if}
        {#if draft.kind === 'faces'}
          <label class="btn-secondary cursor-pointer px-4 py-2 text-sm {bulkUploading ? 'opacity-60' : ''}">
            {bulkUploading ? `Lade hoch … (${bulkUploading})` : 'Viele Bilder hochladen'}
            <input type="file" class="hidden" multiple accept="image/jpeg,image/png,image/webp,image/svg+xml" disabled={!editable || !!bulkUploading} onchange={(e) => uploadMany(e.currentTarget)} />
          </label>
        {/if}
      </div>

      {#if draft.kind === 'places'}
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <EditTable columns={COLUMNS.places} bind:rows={draft.rows} {issues} bind:selected noun="Ort" onCellPaste={pasteCoords} />
          <div class="lg:sticky lg:top-4 lg:self-start">
            <WorldMap
              class="h-[420px] overflow-hidden rounded-2xl border-2 border-slate-800"
              interactive
              pin={selected !== null ? coordsOf(selected) : null}
              onPick={pickOnMap}
              {markers}
            />
            <p class="mt-1 text-xs text-slate-500">
              {selected !== null ? `Zeile ${selected + 1}: ${draft.rows[selected]?.name || 'ohne Namen'}. Tippen setzt die Koordinaten.` : 'Tippen auf die Karte füllt die nächste Zeile ohne Koordinaten.'}
            </p>
          </div>
        </div>
      {:else if draft.kind === 'picture'}
        <div class="card space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <label class="btn-secondary cursor-pointer px-4 py-2 text-sm {uploading ? 'opacity-60' : ''}">
              {uploading === 'image' ? 'Lade hoch …' : draft.meta.image ? 'Bild ersetzen' : 'Bild hochladen'}
              <input type="file" class="hidden" accept="image/jpeg,image/png,image/webp,image/svg+xml" disabled={!editable || !!uploading} onchange={(e) => uploadPicture('image', e.currentTarget)} />
            </label>
            {#if draft.meta.image}<span class="font-mono text-xs text-slate-500">{draft.meta.image}</span>{/if}
            <label class="btn-ghost cursor-pointer text-sm {uploading ? 'opacity-60' : ''}">
              {uploading === 'original' ? 'Lade hoch …' : draft.meta.original ? 'Original ersetzen' : 'Originalbild dazu (optional)'}
              <input type="file" class="hidden" accept="image/jpeg,image/png,image/webp,image/svg+xml" disabled={!editable || !!uploading} onchange={(e) => uploadPicture('original', e.currentTarget)} />
            </label>
            {#if draft.meta.original}
              <span class="font-mono text-xs text-slate-500">{draft.meta.original}</span>
              <button type="button" class="btn-ghost text-xs text-rose-300" onclick={() => (draft.meta.original = '')}>Original entfernen</button>
            {/if}
          </div>
          <p class="text-xs text-slate-500">
            Ohne Original legt die App undurchsichtige Kästchen über die Felder. Mit Original zeigst du ein bearbeitetes Bild, in dem die Dinge fehlen, und beim Aufdecken erscheint der Originalausschnitt.
            Beide Bilder brauchen dieselben Proportionen. Bilder vorher verkleinern, höchstens 8 MB.
          </p>
        </div>
        {#if draft.meta.image}
          <div class="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PictureEditor image={imageUrl(draft.meta.image)} original={draft.meta.original ? imageUrl(draft.meta.original) : ''} bind:rows={draft.rows} bind:selected />
            <ol class="space-y-2 lg:sticky lg:top-4 lg:self-start">
              {#each draft.rows as row, i (i)}
                <li class="flex items-center gap-2 rounded-xl border-2 px-3 py-2 {selected === i ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800'}">
                  <button type="button" class="w-7 shrink-0 rounded-md bg-slate-800 py-0.5 text-center font-mono text-sm font-bold" aria-label="Feld {i + 1} wählen" onclick={() => (selected = selected === i ? null : i)}>{i + 1}</button>
                  <input class="input flex-1 px-3 py-2 text-sm {issues[i]?.answer ? 'border-rose-500' : ''}" type="text" placeholder="Antwort" bind:value={row.answer} onfocus={() => (selected = i)} />
                  <button type="button" class="btn-ghost px-2 text-xs text-rose-300" aria-label="Feld {i + 1} löschen" onclick={() => { draft.rows.splice(i, 1); selected = null; }}>×</button>
                </li>
              {/each}
              {#if draft.rows.length === 0}
                <li class="text-sm text-slate-500">Noch kein Feld. Zieh im Bild ein Rechteck auf.</li>
              {/if}
            </ol>
          </div>
        {:else}
          <p class="text-sm text-slate-500">Lade zuerst ein Bild hoch.</p>
        {/if}
      {:else}
        <EditTable
          columns={COLUMNS[draft.kind]}
          bind:rows={draft.rows}
          {issues}
          bind:selected
          noun={draft.kind === 'pairs' ? 'Paar' : draft.kind === 'events' ? 'Ereignis' : draft.kind === 'prompts' ? 'Aufgabe' : draft.kind === 'faces' ? 'Person' : 'Eintrag'}
          onImageUpload={draft.kind === 'faces' ? uploadRowImage : undefined}
        />
      {/if}
    </section>

    {#if draft.kind === 'pairs'}
      <section class="space-y-3">
        <div>
          <h2 class="text-lg font-black">Köder</h2>
          <p class="text-xs text-slate-500">Ziele ohne passende Karte. Bis zu 5, keiner darf fachlich zu einer Karte passen.</p>
        </div>
        <EditTable columns={DECOY_COLUMNS} bind:rows={draft.decoys} noun="Köder" />
      </section>
    {/if}
  {/if}
</main>

{#if !loading && !loadError}
  <div class="fixed inset-x-0 bottom-0 z-30 border-t-2 border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
    <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
      <div class="flex flex-wrap gap-2">
        {#if entry && editable && entry.status === 'modified'}
          <button class="btn-ghost text-sm" onclick={reset}>Auf Original zurücksetzen</button>
        {/if}
        {#if entry && editable && entry.status !== 'hidden'}
          <button class="btn-ghost text-sm text-rose-300" onclick={removeOrHide}>{entry.status === 'custom' ? 'Löschen' : 'Ausblenden'}</button>
        {/if}
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm font-semibold text-slate-500">{dirty ? 'Ungespeicherte Änderungen' : 'Alles gespeichert'}</span>
        <button class="btn-primary" disabled={!editable || saving || (!dirty && !isNew)} onclick={save}>
          {saving ? 'Speichere …' : problem ? 'Als Entwurf speichern' : 'Speichern'}
        </button>
      </div>
    </div>
  </div>
{/if}
