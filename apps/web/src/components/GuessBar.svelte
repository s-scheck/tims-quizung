<script lang="ts">
  import { GUESS_MAX_LENGTH } from '@quiz/shared';

  /** Feste Tippleiste am unteren Rand. Ein Platzhalter gleicher Höhe hält den Inhalt darüber frei. */
  let { placeholder, submitLabel, onSubmit }: { placeholder: string; submitLabel: string; onSubmit: (text: string) => void } = $props();

  let text = $state('');
  let barHeight = $state(0);

  function submit() {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    text = '';
  }
</script>

<div aria-hidden="true" style="height:{barHeight}px"></div>
<div bind:clientHeight={barHeight} class="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur" style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
  <form class="mx-auto flex max-w-5xl items-center gap-3" onsubmit={(e) => { e.preventDefault(); submit(); }}>
    <input class="input flex-1" type="text" maxlength={GUESS_MAX_LENGTH} {placeholder} autocomplete="off" autocapitalize="words" bind:value={text} />
    <button class="btn-primary" type="submit" disabled={text.trim().length === 0}>{submitLabel}</button>
  </form>
</div>
