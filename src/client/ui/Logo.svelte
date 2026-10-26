<script lang="ts">
  let { size = 28 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" class="logo">
  <rect width="64" height="64" rx="16" fill="var(--surface-3)" />
  <rect x="13" y="15" width="22" height="16" rx="4" fill="var(--ink)" />
  <rect x="29" y="35" width="22" height="14" rx="4" fill="var(--accent)" />
  <path d="M24 31v6a4 4 0 0 0 4 4h1" fill="none" stroke="var(--ink)" stroke-width="3" stroke-linecap="round" />
  <circle cx="47" cy="20" r="4" fill="var(--c-violet)" />
</svg>

<style>
  .logo {
    flex: none;
  }
</style>
