<script lang="ts">
  import type { PlacementStatus } from '@quiz/shared';
  import Burst from './Burst.svelte';

  let {
    name,
    sub = '',
    selected = false,
    status = null,
    isStart = false,
    disabled = false,
    large = false,
    onclick,
  }: {
    name: string;
    sub?: string;
    selected?: boolean;
    status?: PlacementStatus | null;
    isStart?: boolean;
    disabled?: boolean;
    large?: boolean;
    onclick?: () => void;
  } = $props();

  const statusClass = $derived.by(() => {
    switch (status) {
      case 'pending':
        return 'border-amber-500 bg-amber-500/15 text-amber-100 animate-pulse';
      case 'correct':
        return 'border-emerald-500 bg-emerald-500/20 text-emerald-100 animate-flash';
      case 'wrong':
        return 'border-rose-500 bg-rose-500/15 text-rose-100 animate-shake';
      default:
        return selected
          ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
          : 'border-slate-800 bg-slate-950 text-slate-100';
    }
  });
</script>

<button
  type="button"
  class="relative w-full rounded-2xl border-2 border-b-4 px-3 py-2 text-left font-bold leading-tight transition
    {statusClass}
    {large ? 'text-xl px-4 py-3' : 'text-sm sm:text-base'}
    {disabled ? 'cursor-default' : 'hover:bg-slate-900 active:translate-y-0.5 active:border-b-2'}"
  {disabled}
  {onclick}
>
  <span class="block truncate">{name}</span>
  {#if sub}<span class="block text-xs font-medium text-slate-400">{sub}</span>{/if}
  {#if status === 'correct'}<Burst />{/if}
  {#if isStart}
    <span class="absolute -top-2 right-2 rounded-full bg-indigo-500 px-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white">Start</span>
  {/if}
</button>
