<script lang="ts">
  import { onDestroy } from 'svelte';
  import { AVATAR_PARTS, type AvatarPart, type HeadShape } from '@quiz/shared';
  import { client } from '../../lib/client.svelte.ts';
  import { uploadAvatar, type AvatarDraft, type FigureParts, type LocalAvatar, type Pose } from '../../lib/avatar.ts';
  import { composeHead } from '../../lib/avatarCanvas.ts';
  import { saveAvatar } from '../../lib/session.ts';
  import { toasts } from '../../lib/toast.svelte.ts';
  import DrawCanvas, { type Tool } from './DrawCanvas.svelte';
  import Figure from './Figure.svelte';

  /**
   * Figur malen: jedes Teil einzeln auf leerer Fläche, mit Gelenk-Hinweis. Kopf in Kreis oder Quadrat,
   * Kopfbedeckung mit blassem Kopf darunter. Nach der Vorschau nur noch „Fertig“, danach ist die Figur fest.
   */
  let { draft = $bindable(), onclose, ondone }: { draft: AvatarDraft; onclose: () => void; ondone: (avatar: LocalAvatar) => void } = $props();

  const LABELS: Record<AvatarPart, { title: string; hint: string }> = {
    head: { title: 'Kopf & Gesicht', hint: 'Form und Farbe wählen, dann ein Gesicht hineinmalen.' },
    hat: { title: 'Kopfbedeckung', hint: 'Mütze, Haare, Krone … Der blasse Kopf zeigt, wo sie später sitzt.' },
    torso: { title: 'Oberkörper', hint: 'Die Kreise zeigen, wo Kopf, Arme und Beine ansetzen.' },
    armL: { title: 'Arm links', hint: 'Der Arm dreht sich am Kreis oben (Schulter).' },
    armR: { title: 'Arm rechts', hint: 'Der Arm dreht sich am Kreis oben (Schulter).' },
    legL: { title: 'Bein links', hint: 'Das Bein dreht sich am Kreis oben (Hüfte).' },
    legR: { title: 'Bein rechts', hint: 'Das Bein dreht sich am Kreis oben (Hüfte).' },
  };
  const PREVIEW = AVATAR_PARTS.length;
  const PALETTE = ['#1f1f1f', '#ffffff', '#ff4b4b', '#ff9600', '#ffc800', '#58cc02', '#1cb0f6', '#ce82ff', '#f472b6', '#8b5a2b', '#8f8f8f'];
  const HEAD_COLORS = ['#f9dcc4', '#f2c9a0', '#d9a273', '#a86b43', '#6b4226', '#ffd84d', '#9be15d', '#7cc6fe', '#d7b4ff'];
  const BRUSHES = [3, 8, 16];

  let color = $state('#1f1f1f');
  let brush = $state(8);
  let tool = $state<Tool>('pen');
  let undoCount = $state(0);
  let canvas = $state<ReturnType<typeof DrawCanvas> | null>(null);
  let headImage = $state<string | null>(null);
  let busy = $state(false);
  let pose = $state<Pose>('cheer');
  let poseTimer: ReturnType<typeof setTimeout> | null = null;

  const part = $derived<AvatarPart | null>(draft.step < PREVIEW ? AVATAR_PARTS[draft.step]! : null);

  // Kopf für die Kopfbedeckung und die Vorschau aus Form, Farbe und Gesicht zusammensetzen.
  $effect(() => {
    if (draft.step === 0) return;
    const { shape, headColor } = draft;
    const face = draft.drawings.head ?? null;
    composeHead(shape, headColor, face).then((url) => (headImage = url));
  });

  onDestroy(() => {
    if (poseTimer) clearTimeout(poseTimer);
  });

  function saveCurrent(): void {
    if (!part || !canvas) return;
    const snap = canvas.snapshot();
    if (snap) draft.drawings[part] = snap;
    else delete draft.drawings[part];
  }

  function go(step: number): void {
    saveCurrent();
    undoCount = 0;
    tool = 'pen';
    draft.step = step;
    if (step === PREVIEW) {
      // Einmal jubeln, dann ruhig wippen.
      pose = 'cheer';
      if (poseTimer) clearTimeout(poseTimer);
      poseTimer = setTimeout(() => (pose = 'idle'), 2600);
    }
  }

  function close(): void {
    saveCurrent();
    onclose();
  }

  function setShape(shape: HeadShape): void {
    draft.shape = shape;
  }

  const previewParts = $derived<FigureParts>({ ...draft.drawings, head: headImage ?? undefined });

  async function finish(): Promise<void> {
    const token = client.me?.token;
    const code = client.view?.code;
    if (!token || !code || busy) return;
    busy = true;
    const head = await composeHead(draft.shape, draft.headColor, draft.drawings.head ?? null);
    const avatar: LocalAvatar = { shape: draft.shape, color: draft.headColor, parts: { ...draft.drawings, head } };
    const res = await uploadAvatar(code, token, avatar);
    busy = false;
    if (!res.ok) {
      toasts.error(res.message);
      return;
    }
    saveAvatar(avatar);
    ondone(avatar);
  }
</script>

<div class="fixed inset-0 z-[1500] flex flex-col bg-slate-950" role="dialog" aria-modal="true" aria-label="Figur malen">
  <header class="flex shrink-0 items-center gap-3 border-b border-slate-800 px-4 py-2">
    <div class="min-w-0 flex-1">
      <p class="text-xs font-semibold uppercase tracking-widest text-indigo-400">
        {part ? `Schritt ${draft.step + 1} von ${PREVIEW}` : 'Vorschau'}
      </p>
      <h2 class="break-words text-lg font-black">{part ? LABELS[part].title : 'Deine Figur'}</h2>
    </div>
    <button class="btn-ghost px-3 py-1 text-sm" onclick={close}>Schließen</button>
  </header>

  {#if part}
    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-2" style="--draw-h: max(180px, calc(100dvh - 22rem))">
      <p class="text-center text-sm text-slate-400">{LABELS[part].hint}</p>
      {#if part === 'head'}
        <div class="flex flex-wrap items-center justify-center gap-2">
          {#each [['circle', 'Kreis'], ['square', 'Quadrat']] as [s, label] (s)}
            <button
              class="rounded-xl border px-3 py-1 text-sm font-semibold {draft.shape === s ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400'}"
              onclick={() => setShape(s as HeadShape)}>{label}</button
            >
          {/each}
          <span class="mx-1 h-6 w-px bg-slate-800"></span>
          {#each HEAD_COLORS as c (c)}
            <button
              class="h-7 w-7 rounded-full border-2 {draft.headColor === c ? 'border-slate-100 ring-2 ring-indigo-400' : 'border-slate-700'}"
              style="background:{c}"
              aria-label="Kopffarbe {c}"
              onclick={() => (draft.headColor = c)}
            ></button>
          {/each}
          <label class="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border-2 border-slate-700" title="Eigene Kopffarbe">
            <span class="absolute inset-0" style="background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"></span>
            <input type="color" class="absolute inset-0 cursor-pointer opacity-0" bind:value={draft.headColor} />
          </label>
        </div>
      {/if}

      {#key part}
        <DrawCanvas
          bind:this={canvas}
          bind:undoCount
          {part}
          {color}
          {brush}
          {tool}
          initial={draft.drawings[part] ?? null}
          shape={draft.shape}
          headColor={draft.headColor}
          underlay={part === 'hat' ? headImage : null}
        />
      {/key}

      <!-- Werkzeuge -->
      <div class="flex flex-wrap items-center justify-center gap-1.5">
        {#each PALETTE as c (c)}
          <button
            class="h-8 w-8 rounded-full border-2 {color === c && tool !== 'eraser' ? 'border-slate-100 ring-2 ring-indigo-400' : 'border-slate-700'}"
            style="background:{c}"
            aria-label="Farbe {c}"
            onclick={() => {
              color = c;
              if (tool === 'eraser') tool = 'pen';
            }}
          ></button>
        {/each}
        <label class="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border-2 border-slate-700" title="Eigene Farbe">
          <span class="absolute inset-0" style="background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"></span>
          <input type="color" class="absolute inset-0 cursor-pointer opacity-0" bind:value={color} onchange={() => tool === 'eraser' && (tool = 'pen')} />
        </label>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-1.5">
        {#each BRUSHES as b (b)}
          <button
            class="flex h-9 w-9 items-center justify-center rounded-xl border {brush === b ? 'border-indigo-500 bg-indigo-500/15' : 'border-slate-700'}"
            aria-label="Stiftdicke {b}"
            onclick={() => (brush = b)}
          >
            <span class="rounded-full bg-slate-100" style="width:{Math.max(4, b * 1.2)}px; height:{Math.max(4, b * 1.2)}px"></span>
          </button>
        {/each}
        <span class="mx-1 h-6 w-px bg-slate-800"></span>
        {#each [['pen', '✏️', 'Stift'], ['eraser', '🧽', 'Radierer'], ['fill', '🪣', 'Farbeimer']] as [t, icon, label] (t)}
          <button
            class="flex h-9 items-center gap-1 rounded-xl border px-2 text-sm font-semibold {tool === t ? 'border-indigo-500 bg-indigo-500/15 text-indigo-300' : 'border-slate-700 text-slate-400'}"
            onclick={() => (tool = t as Tool)}><span aria-hidden="true">{icon}</span><span class="hidden sm:inline">{label}</span></button
          >
        {/each}
        <span class="mx-1 h-6 w-px bg-slate-800"></span>
        <button class="btn-ghost h-9 px-2 text-sm" disabled={undoCount === 0} onclick={() => canvas?.undoLast()}>↶ Rückgängig</button>
        <button class="btn-ghost h-9 px-2 text-sm" onclick={() => canvas?.clear()}>Teil leeren</button>
      </div>
    </div>

    <footer class="flex shrink-0 gap-2 border-t border-slate-800 px-4 py-3">
      <button class="btn-secondary flex-1" disabled={draft.step === 0} onclick={() => go(draft.step - 1)}>Zurück</button>
      <button class="btn-primary flex-[2]" onclick={() => go(draft.step + 1)}>
        {draft.step === PREVIEW - 1 ? 'Zur Vorschau' : 'Weiter'}
      </button>
    </footer>
    {#if draft.step === PREVIEW - 1}
      <p class="shrink-0 pb-3 text-center text-xs text-slate-500">In der Vorschau siehst du deine ganze Figur. Ändern geht danach nicht mehr.</p>
    {/if}
  {:else}
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
      <div class="flex items-end justify-center">
        <Figure parts={previewParts} size={Math.min(360, typeof window === 'undefined' ? 300 : window.innerHeight * 0.55)} {pose} />
      </div>
      <p class="max-w-sm text-center text-sm text-slate-400">So sehen dich die anderen ab dem Spielstart. Leere Teile bleiben leer.</p>
    </div>
    <footer class="shrink-0 border-t border-slate-800 px-4 py-3">
      <button class="btn-primary w-full text-lg" disabled={busy} onclick={finish}>{busy ? 'Speichere…' : 'Fertig'}</button>
    </footer>
  {/if}
</div>
