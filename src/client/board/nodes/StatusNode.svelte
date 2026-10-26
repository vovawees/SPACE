<script lang="ts">
  /* Статус: «Не начато → В работе → Готово». Щелчок по метке — выбрать
     статус; варианты и их цвета свои (двойной щелчок по объекту). */
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { menu, type MenuEntry } from "../../ui/menu.svelte.ts";
  import { pickColor } from "../../ui/colorpick.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { colorCss } from "../model.ts";
  import type { NodeCompProps } from "./types.ts";
  import { statusesOf } from "./values.ts";
  import { setStatus } from "./widgets.ts";
  import TitleEdit from "./TitleEdit.svelte";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const sts = $derived(statusesOf(p));
  const i = $derived(Math.max(0, Math.min(sts.length - 1, p.st ?? 0)));
  const cur = $derived(sts[i]!);
  const k = $derived(Math.max(0.5, Math.min(v.w / 200, v.h / 56)));
  const renaming = $derived(b.ix.renaming === v.id);

  function open(e: MouseEvent) {
    e.stopPropagation();
    if (b.readonly) return;
    const items: MenuEntry[] = sts.map((x, j) => ({ label: x.t || `Статус ${j + 1}`, checked: j === i, run: () => setStatus(b, [v.id], j) }));
    items.push("-", { label: "Изменить варианты…", run: () => b.ix.edit(v.id) });
    menu.dropdown(e.currentTarget as HTMLElement, items);
  }

  function save(next: { t: string; c: string }[]) {
    b.view.update(v.id, { sts: next, st: Math.max(0, Math.min(next.length - 1, p.st ?? 0)) });
  }
  function edit(j: number, patch: Partial<{ t: string; c: string }>) {
    save(sts.map((x, q) => (q === j ? { ...x, ...patch } : x)));
  }
  function color(e: MouseEvent, j: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pickColor(sts[j]!.c, { x: r.left, y: r.bottom + 6 }, (c) => edit(j, { c }), { title: "Цвет статуса" });
  }
</script>

<div class="card st-card" style:--sc={colorCss(cur.c)} style:--k={k}>
  {#if p.title || renaming}<span class="st-title"><TitleEdit {v} placeholder="Что" /></span>{/if}
  <button class="st-pill" data-ui disabled={b.readonly} onclick={open} aria-haspopup="menu">
    <i></i><span>{cur.t || `Статус ${i + 1}`}</span>{#if !b.readonly}<ChevronDown size={14} />{/if}
  </button>
  {#if sts.length > 1 && v.h >= 70}
    <div class="st-steps">
      {#each sts as x, j (j)}<span class:on={j <= i} style:--sc={colorCss(x.c)}></span>{/each}
    </div>
  {/if}
</div>
{#if editing && !b.readonly}
  <div class="st-edit" data-ui>
    {#each sts as x, j (j)}
      <div class="st-row">
        <button class="st-dot" style:background={colorCss(x.c)} onclick={(e) => color(e, j)} aria-label="Цвет"></button>
        <input
          value={x.t}
          placeholder="Статус {j + 1}"
          onchange={(e) => edit(j, { t: e.currentTarget.value.trim() })}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") b.ix.stopEditing();
          }}
        />
        <button class="icon-btn sm" disabled={sts.length <= 2} onclick={() => save(sts.filter((_, q) => q !== j))} aria-label="Убрать"><X size={13} /></button>
      </div>
    {/each}
    <div class="st-tools">
      <button class="btn ghost sm" disabled={sts.length >= 12} onclick={() => save([...sts, { t: `Статус ${sts.length + 1}`, c: "violet" }])}><Plus size={14} /> Статус</button>
      <button class="btn ghost sm" onclick={() => b.ix.stopEditing()}>Готово</button>
    </div>
  </div>
{/if}
