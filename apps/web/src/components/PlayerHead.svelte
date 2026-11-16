<script lang="ts">
  import type { RoomView } from '@quiz/shared';
  import { figureById } from '../lib/avatar.ts';
  import MiniHead from './avatar/MiniHead.svelte';

  /** Kleiner Kopf vor einem Namen. In der Lobby nichts, dort sind die Figuren noch geheim. */
  let { view, id, size }: { view: RoomView; id: string | null | undefined; size?: number } = $props();

  const parts = $derived(view.phase === 'lobby' || !id ? null : figureById(view, id));
</script>

{#if parts}<MiniHead {parts} size={size ?? 22} />{/if}
