<script lang="ts">
  import { RIG } from '@quiz/shared';
  import type { FigureParts } from '../../lib/avatar.ts';
  import { HEAD_SHAPE_BOX, hatBounds, union, type Box } from '../../lib/headBounds.ts';

  /**
   * Kleiner Kopf für Listen: zugeschnitten auf Kopf plus tatsächlich gemalte Kopfbedeckung,
   * damit ein hoher Hut die Zeile nicht sprengt. `size` ist der Kopfdurchmesser in px.
   */
  let { parts, size = 22 }: { parts: FigureParts; size?: number } = $props();

  let hat = $state<Box | null>(null);
  $effect(() => {
    const url = parts.hat;
    hat = null;
    if (!url) return;
    let alive = true;
    hatBounds(url).then((b) => alive && (hat = b));
    return () => {
      alive = false;
    };
  });

  const box = $derived(union(HEAD_SHAPE_BOX, hat));
  // Kopf in Originalgröße, außer der Hut würde zu hoch oder zu breit.
  const scale = $derived(Math.min(size / HEAD_SHAPE_BOX.w, (size * 1.8) / box.h, (size * 2.2) / box.w));
  const head = RIG.head;
  const hatRig = RIG.hat;
</script>

<span class="relative inline-block shrink-0 overflow-hidden align-middle" style="width:{box.w * scale}px; height:{box.h * scale}px" aria-hidden="true">
  <span class="absolute" style="left:{-box.x * scale}px; top:{-box.y * scale}px; width:{hatRig.w * scale}px; height:{hatRig.h * scale}px">
    {#if parts.head}
      <img
        src={parts.head}
        alt=""
        draggable="false"
        class="absolute max-w-none"
        style="left:{(head.at.x - hatRig.at.x) * scale}px; top:{(head.at.y - hatRig.at.y) * scale}px; width:{head.w * scale}px; height:{head.h * scale}px"
      />
    {/if}
    {#if parts.hat}<img src={parts.hat} alt="" draggable="false" class="absolute inset-0 h-full w-full max-w-none" />{/if}
  </span>
</span>
