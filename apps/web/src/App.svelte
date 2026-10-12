<script lang="ts">
  import { router } from './lib/router.svelte.ts';
  import Home from './routes/Home.svelte';
  import Room from './routes/Room.svelte';
  import Screen from './routes/Screen.svelte';
  import Editor from './routes/Editor.svelte';
  import EditorCategory from './routes/EditorCategory.svelte';
</script>

{#if router.route.name === 'home'}
  <Home />
{:else if router.route.name === 'room'}
  <Room code={router.route.code} />
{:else if router.route.name === 'screen'}
  <Screen code={router.route.code} />
{:else if router.route.name === 'editor'}
  <Editor />
{:else if router.route.name === 'editor-new'}
  {#key router.route.game}<EditorCategory game={router.route.game} />{/key}
{:else if router.route.name === 'editor-edit'}
  {#key router.route.id}<EditorCategory id={router.route.id} />{/key}
{:else}
  <main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
    <h1 class="text-3xl font-bold">Seite nicht gefunden</h1>
    <button class="btn-primary" onclick={() => router.navigate('/')}>
      Zur Startseite
    </button>
  </main>
{/if}
