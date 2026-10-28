<script lang="ts">
  /* Ряд цветов: «как обычно», палитра доски, белый и чёрный, свой цвет. */
  import Plus from "@lucide/svelte/icons/plus";
  import { pickColor } from "../../../ui/colorpick.svelte.ts";
  import { COLOR_ITEMS, isHex } from "../../model.ts";

  let {
    cur,
    apply,
    title,
    none = "Как обычно",
    extra,
    neutral = true,
  }: {
    cur: string | undefined;
    apply: (c: string | undefined) => void;
    title: string;
    none?: string;
    extra?: { value: string; css: string; label: string };
    neutral?: boolean;
  } = $props();

  const PALETTE = COLOR_ITEMS.filter((c) => c.value !== "default");
  const NEUTRAL = [
    { value: "#ffffff", css: "#ffffff", label: "Белый" },
    { value: "#111113", css: "#111113", label: "Чёрный" },
  ];
  const SW = $derived(neutral ? [...PALETTE, ...NEUTRAL] : PALETTE);
  const own = $derived(!!cur && isHex(cur) && !SW.some((x) => x.value === cur));
  const empty = $derived(!cur || cur === "default");

  const under = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: r.left, y: r.bottom + 6 };
  };
</script>

<div class="in-colors" role="radiogroup" aria-label={title}>
  <button type="button" class="in-dot none" class:on={empty} role="radio" aria-checked={empty} aria-label={none} title={none} onclick={() => apply(undefined)}></button>
  {#if extra}
    <button type="button" class="in-dot clear" class:on={cur === extra.value} role="radio" aria-checked={cur === extra.value} aria-label={extra.label} title={extra.label} onclick={() => apply(extra.value)}></button>
  {/if}
  {#each SW as c (c.value)}
    <button type="button" class="in-dot" class:on={cur === c.value} style:--sw={c.css} role="radio" aria-checked={cur === c.value} aria-label={c.label} title={c.label} onclick={() => apply(c.value)}></button>
  {/each}
  <button
    type="button"
    class="in-dot custom"
    class:on={own}
    class:filled={own}
    style:--sw={own ? cur : null}
    aria-label="Свой цвет"
    title="Свой цвет"
    onclick={(e) => pickColor(cur, under(e), (hex) => apply(hex), { title })}
  >
    {#if !own}<Plus size={13} />{/if}
  </button>
</div>
