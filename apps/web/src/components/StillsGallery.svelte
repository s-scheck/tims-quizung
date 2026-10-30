<script lang="ts">
  /** Großes Foto mit Leiste der Vorschaubilder darunter. Antippen zeigt ein anderes Foto groß. */
  let {
    images,
    stagePoints,
    shownIndex,
    onPick,
    large = false,
    overlay = false,
    thumbPoints = false,
  }: {
    images: string[];
    stagePoints: number[];
    shownIndex: number;
    onPick: (index: number) => void;
    large?: boolean;
    /** Nummer und Punkte als Abzeichen auf dem großen Foto. */
    overlay?: boolean;
    /** Punkte auch in den Vorschaubildern. */
    thumbPoints?: boolean;
  } = $props();
</script>

<figure class="space-y-2">
  <div class="relative">
    <img
      src={images[shownIndex]}
      alt="Foto {shownIndex + 1}"
      class="mx-auto block w-auto max-w-full rounded-2xl border border-slate-800 bg-slate-900 object-contain {large ? 'max-h-[70vh]' : 'max-h-[60vh]'}"
      draggable="false"
    />
    {#if overlay}
      <span class="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-sm font-bold">Foto {shownIndex + 1} · {stagePoints[shownIndex]} P</span>
    {/if}
  </div>
  {#if images.length > 1}
    <div class="flex flex-wrap justify-center gap-2">
      {#each images as src, i (i)}
        <button
          class="relative overflow-hidden rounded-lg border-2 transition {shownIndex === i ? 'border-indigo-500' : 'border-slate-800 hover:border-slate-600'}"
          aria-label="Foto {i + 1} zeigen"
          onclick={() => onPick(i)}
        >
          <img {src} alt="" class="block h-14 w-20 object-cover sm:h-16 sm:w-24" draggable="false" />
          <span class="absolute bottom-0 right-0 rounded-tl-md bg-slate-950/80 px-1.5 text-xs font-bold">{i + 1}{#if thumbPoints} · {stagePoints[i]} P{/if}</span>
        </button>
      {/each}
    </div>
  {/if}
</figure>
