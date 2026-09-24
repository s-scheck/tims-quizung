<script lang="ts">
  import { client } from '../lib/client.svelte.ts';
</script>

{#if client.status === 'reconnecting' || client.status === 'connecting'}
  <div class="bg-amber-500/90 px-4 py-1.5 text-center text-sm font-semibold text-slate-950">
    {client.status === 'connecting' ? 'Verbinde…' : 'Verbindung wird wiederhergestellt…'}
  </div>
{/if}
