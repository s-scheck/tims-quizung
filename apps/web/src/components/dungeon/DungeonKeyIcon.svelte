<script lang="ts">
  /** Alter Bartschlüssel als Strichsymbol, in der Textfarbe. */
  let { size = 18, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} class={className} aria-hidden="true">
  <circle cx="7" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.2" />
  <circle cx="7" cy="12" r="1.3" fill="currentColor" />
  <path d="M11 12h11M18 12v3.5M21 12v2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
</svg>
