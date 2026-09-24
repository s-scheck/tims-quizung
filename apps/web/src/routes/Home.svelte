<script lang="ts">
  import { isValidRoomCode, normalizeRoomCode } from '@quiz/shared';
  import { client } from '../lib/client.svelte.ts';
  import { router } from '../lib/router.svelte.ts';
  import { loadName, saveName } from '../lib/session.ts';
  import Toast from '../components/Toast.svelte';

  let name = $state(loadName());
  let code = $state('');
  let submitting = $state<'create' | 'join' | null>(null);

  const nameOk = $derived(name.trim().length >= 1 && name.trim().length <= 20);
  const codeOk = $derived(isValidRoomCode(normalizeRoomCode(code)));
  const connectedRoom = $derived(client.me?.role === 'player' && client.view ? client.view.code : null);

  $effect(() => {
    if (submitting && client.me?.role === 'player' && client.me.code) {
      const target = client.me.code;
      submitting = null;
      router.navigate(`/room/${target}`);
    }
  });

  $effect(() => {
    if (submitting && (client.lastError || client.status === 'closed')) submitting = null;
  });

  function create() {
    if (!nameOk) return;
    saveName(name.trim());
    submitting = 'create';
    client.create(name.trim());
  }

  function join() {
    if (!nameOk || !codeOk) return;
    saveName(name.trim());
    submitting = 'join';
    client.join(normalizeRoomCode(code), { name: name.trim() });
  }
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
  <header class="space-y-2">
    <p class="text-sm font-semibold uppercase tracking-widest text-indigo-400">Quiz-Suite</p>
    <h1 class="text-5xl font-black tracking-tight">Tims Quizung</h1>
    <p class="text-slate-400">Gemeinsam schätzen, sortieren und ausscheiden. Erstes Spiel: <span class="text-slate-200">Sortieren</span>.</p>
  </header>

  {#if connectedRoom}
    <section class="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-4">
      <p class="text-sm text-indigo-200">Du bist noch im Raum <span class="font-mono font-bold">{connectedRoom}</span>.</p>
      <div class="mt-3 flex gap-2">
        <button class="btn-primary flex-1" onclick={() => router.navigate(`/room/${connectedRoom}`)}>Zurück zum Raum</button>
        <button class="btn-ghost" onclick={() => client.leave()}>Verlassen</button>
      </div>
    </section>
  {/if}

  <section class="space-y-3">
    <label class="block">
      <span class="mb-1 block text-sm text-slate-400">Dein Name</span>
      <input
        class="input"
        type="text"
        maxlength="20"
        placeholder="z. B. Tim"
        autocomplete="nickname"
        bind:value={name}
        onkeydown={(e) => e.key === 'Enter' && create()}
      />
    </label>
  </section>

  <section class="grid gap-4 sm:grid-cols-2">
    <div class="card space-y-3">
      <h2 class="text-lg font-bold">Neuer Raum</h2>
      <p class="text-sm text-slate-400">Du wirst Host, wählst Kategorien und vergibst Punkte.</p>
      <button class="btn-primary w-full" disabled={!nameOk || submitting !== null} onclick={create}>
        {submitting === 'create' ? 'Erstelle…' : 'Raum erstellen'}
      </button>
    </div>
    <div class="card space-y-3">
      <h2 class="text-lg font-bold">Beitreten</h2>
      <input
        class="input font-mono uppercase tracking-[0.3em]"
        type="text"
        maxlength="4"
        placeholder="CODE"
        autocapitalize="characters"
        autocomplete="off"
        bind:value={code}
        onkeydown={(e) => e.key === 'Enter' && join()}
      />
      <button class="btn-secondary w-full" disabled={!nameOk || !codeOk || submitting !== null} onclick={join}>
        {submitting === 'join' ? 'Trete bei…' : 'Beitreten'}
      </button>
    </div>
  </section>

  <p class="text-center text-xs text-slate-500">Für den Fernseher: <span class="font-mono">/screen/CODE</span> öffnen.</p>
</main>
<Toast />
