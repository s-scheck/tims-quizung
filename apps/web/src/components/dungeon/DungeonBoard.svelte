<script lang="ts">
  import type { DungeonRoundView, RoomView } from '@quiz/shared';
  import DungeonPhone from './DungeonPhone.svelte';
  import DungeonTv from './DungeonTv.svelte';

  /** Dungeon: Fernseher (`readonly`) oder Handy (Mitspieler, moderierender Host, Zuschauer). */
  let { view, round, readonly = false }: { view: RoomView; round: DungeonRoundView; readonly?: boolean } = $props();
</script>

{#if readonly}
  <DungeonTv {view} {round} />
{:else}
  <DungeonPhone {view} {round} />
{/if}
