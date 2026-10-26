<script lang="ts">
  import type { VirtualElement } from "@floating-ui/dom";
  import { menu } from "./menu.svelte.ts";
  import MenuPanel from "./MenuPanel.svelte";

  const anchor = $derived.by((): Element | VirtualElement | null => {
    const o = menu.open;
    if (!o) return null;
    if (o.anchor) return o.anchor;
    const { x, y } = o;
    return { getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0 }) };
  });

  function outside(e: PointerEvent) {
    if (!menu.open) return;
    const t = e.target as Element | null;
    if (t?.closest(".menu")) return;
    if (menu.open.anchor && menu.open.anchor.contains(t)) return;
    menu.close();
  }
</script>

<svelte:window
  onpointerdowncapture={outside}
  onresize={() => menu.close()}
  onblur={() => menu.close()}
/>

{#if menu.open && anchor}
  {#key menu.open}
    <MenuPanel
      entries={menu.open.items}
      {anchor}
      placement={menu.open.placement ?? (menu.open.anchor ? "bottom-start" : "right-start")}
      onclose={() => menu.close()}
      focusFirst={!!menu.open.anchor}
    />
  {/key}
{/if}
