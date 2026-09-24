<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts } from '../lib/toast.svelte.ts';
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
  {#each toasts.items as t (t.id)}
    <button
      type="button"
      class="pointer-events-auto max-w-sm rounded-xl px-4 py-2 text-sm font-medium shadow-lg
        {t.kind === 'error' ? 'bg-rose-600 text-white' : t.kind === 'success' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-white'}"
      transition:fly={{ y: 20, duration: 200 }}
      onclick={() => toasts.dismiss(t.id)}
    >
      {t.text}
    </button>
  {/each}
</div>
