<script lang="ts">
  import { headHtml, type FigureParts } from '../../lib/avatar.ts';

  /** Kopf mit Kopfbedeckung; `size` ist der Durchmesser des Kopfes in px, die Kopfbedeckung ragt darüber hinaus. */
  let { parts, size = 40 }: { parts: FigureParts; size?: number } = $props();
</script>

<span class="inline-block shrink-0" aria-hidden="true">{@html headHtml(parts, size)}</span>
