<script lang="ts">
  import { loadTrack } from '../lib/songs.ts';

  let { deezer, size = 64 }: { deezer: number; size?: number } = $props();

  let cover = $state<string | null>(null);
  $effect(() => {
    const id = deezer;
    cover = null;
    loadTrack(id).then((t) => {
      if (id === deezer) cover = t?.cover ?? null;
    });
  });
</script>

{#if cover}
  <img src={cover} alt="" class="shrink-0 rounded-xl object-cover" style="width:{size}px;height:{size}px" />
{:else}
  <div class="flex shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 font-black text-indigo-300" style="width:{size}px;height:{size}px;font-size:{size / 2.5}px" aria-hidden="true">♪</div>
{/if}
