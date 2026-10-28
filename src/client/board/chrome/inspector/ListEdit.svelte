<script lang="ts">
  /* Список строк: варианты, игроки, пункты, грани. Правка — сразу,
     Enter в последней строке добавляет новую, порядок — перетаскиванием. */
  import GripVertical from "@lucide/svelte/icons/grip-vertical";
  import Plus from "@lucide/svelte/icons/plus";
  import X from "@lucide/svelte/icons/x";
  import { tick } from "svelte";
  import { menu } from "../../../ui/menu.svelte.ts";
  import { COLOR_ITEMS, colorCss } from "../../model.ts";
  import type { Field, Row } from "../../inspect/types.ts";

  let { f }: { f: Extract<Field, { k: "list" }> } = $props();
  const rows = $derived(f.get());
  const min = $derived(f.min ?? 0);
  const max = $derived(f.max ?? 100);
  let box = $state<HTMLDivElement>();

  const rid = () => Math.random().toString(36).slice(2, 8);
  function save(next: Row[]) {
    f.set(next);
  }
  async function add(after?: number) {
    if (rows.length >= max) return;
    const row = f.make?.(rows.length) ?? { id: rid(), t: "" };
    const at = after === undefined ? rows.length : after + 1;
    const next = [...rows];
    next.splice(at, 0, row);
    save(next);
    await tick();
    // строки без своих id (грани, статусы) получают новые — тогда по номеру
    const el = box?.querySelector<HTMLInputElement>(`[data-row="${row.id}"] input.in-row-t`) ?? box?.querySelectorAll<HTMLInputElement>("input.in-row-t")[at];
    el?.focus();
    el?.select();
  }
  function remove(i: number) {
    if (rows.length <= min) return;
    save(rows.filter((_, k) => k !== i));
  }
  function edit(i: number, patch: Partial<Row>) {
    const cur = rows[i];
    if (!cur) return;
    const next = { ...cur, ...patch };
    if (next.t === cur.t && next.v === cur.v && next.c === cur.c) return;
    save(rows.map((r, k) => (k === i ? next : r)));
  }
  function color(e: MouseEvent, i: number) {
    menu.dropdown(
      e.currentTarget as HTMLElement,
      [{ label: "Цвет", custom: "colors", colors: COLOR_ITEMS.filter((c) => c.value !== "default"), allowCustom: true, current: rows[i]?.c, pick: (c: string) => edit(i, { c }) }],
      "bottom-start",
    );
  }
  function key(e: KeyboardEvent, i: number) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") {
      e.preventDefault();
      edit(i, { t: el.value });
      if (i === rows.length - 1 && el.value.trim()) void add(i);
      else el.blur();
    } else if (e.key === "Escape") {
      el.value = rows[i]?.t ?? "";
      el.blur();
    } else if (e.key === "Backspace" && el.value === "" && rows.length > min) {
      e.preventDefault();
      const prev = rows[i - 1]?.id;
      remove(i);
      if (prev) void tick().then(() => box?.querySelector<HTMLInputElement>(`[data-row="${prev}"] input.in-row-t`)?.focus());
    }
  }
  const numIn = (raw: string) => {
    const n = Number(raw.replace(",", ".").trim());
    return Number.isFinite(n) ? n : 0;
  };

  /* перетаскивание за ручку */
  let drag = $state<{ from: number; to: number } | null>(null);
  function grab(e: PointerEvent, i: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { from: i, to: i };
  }
  function slide(e: PointerEvent) {
    if (!drag || !box) return;
    const items = [...box.querySelectorAll<HTMLElement>("[data-row]")];
    let to = items.length - 1;
    for (let k = 0; k < items.length; k++) {
      const r = items[k]!.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        to = k;
        break;
      }
    }
    drag = { ...drag, to };
  }
  function drop() {
    if (!drag) return;
    const { from, to } = drag;
    drag = null;
    if (from === to) return;
    const next = [...rows];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    save(next);
  }
</script>

<div class="in-list" bind:this={box}>
  {#each rows as r, i (r.id)}
    <div class="in-row" data-row={r.id} class:dragging={drag?.from === i} class:drop-above={!!drag && drag.to === i && drag.from > i} class:drop-below={!!drag && drag.to === i && drag.from < i}>
      {#if rows.length > 1}
        <button type="button" class="in-grip" aria-label="Перетащить" tabindex="-1" onpointerdown={(e) => grab(e, i)} onpointermove={slide} onpointerup={drop} onpointercancel={() => (drag = null)}><GripVertical size={14} /></button>
      {/if}
      {#if f.color}
        <button type="button" class="in-row-c" style:--sw={colorCss(r.c ?? "gray")} aria-label="Цвет" onclick={(e) => color(e, i)}></button>
      {/if}
      <input class="input sm in-row-t" value={r.t} placeholder={f.ph ?? ""} maxlength="120" onchange={(e) => edit(i, { t: e.currentTarget.value })} onkeydown={(e) => key(e, i)} />
      {#if f.num}
        <input class="input sm in-row-v" inputmode="decimal" value={r.v ?? 0} aria-label={f.num} onchange={(e) => edit(i, { v: numIn(e.currentTarget.value) })} onkeydown={(e) => e.stopPropagation()} />
      {/if}
      <button type="button" class="in-row-x" aria-label="Убрать" disabled={rows.length <= min} onclick={() => remove(i)}><X size={14} /></button>
    </div>
  {/each}
  {#if rows.length < max}
    <button type="button" class="in-add" onclick={() => add()}><Plus size={14} /> {f.add ?? "Добавить"}</button>
  {/if}
</div>
