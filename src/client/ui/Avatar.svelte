<script lang="ts">
  import { initials } from "../lib/util.ts";

  interface Props {
    name: string;
    color: string;
    size?: number;
    ring?: boolean;
    title?: string;
  }
  let { name, color, size = 28, ring = false, title }: Props = $props();
</script>

<span
  class="avatar"
  class:ring
  style:--c={color}
  style:--s="{size}px"
  title={title ?? name}
  aria-label={title ?? name}
>
  {initials(name)}
</span>

<style>
  .avatar {
    width: var(--s);
    height: var(--s);
    flex: none;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    background: var(--c);
    color: rgb(0 0 0 / 0.78);
    font-size: calc(var(--s) * 0.4);
    font-weight: 680;
    letter-spacing: -0.02em;
    user-select: none;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
  }
  .ring {
    box-shadow:
      0 0 0 2px var(--surface-1),
      0 0 0 3.5px var(--c);
  }
</style>
