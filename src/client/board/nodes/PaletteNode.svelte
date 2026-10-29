<script lang="ts">
  /* Палитра проекта: цвета с названиями и HEX. Щелчок по цвету копирует
     HEX. У выделенной палитры у цвета есть меню (поменять, переименовать,
     скопировать RGB/HSL, удалить) и «+» — соседний оттенок. Вся палитра
     как CSS-переменные — в меню объекта. */
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import Plus from "@lucide/svelte/icons/plus";
  import { nanoid } from "nanoid";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { copyText } from "../../lib/util.ts";
  import { pickColor } from "../../ui/colorpick.svelte.ts";
  import { menu } from "../../ui/menu.svelte.ts";
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { Swatch } from "../model.ts";
  import { hexHsl, hexRgb, isLight, nextSwatch, swatchesOf } from "./design.ts";
  import { onTap } from "./tap.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const list = $derived(swatchesOf(p));
  const chips = $derived(p.pm === "chips");
  const live = $derived(!b.readonly && !v.locked);
  const edit = $derived(sel && live);
  const k = $derived(Math.max(0.7, Math.min(1.8, v.w / 420)));
  let renaming = $state<string | null>(null);

  const save = (next: Swatch[]) => b.view.update(v.id, { sw: next });
  const patchSw = (id: string, patch: Partial<Swatch>) => save(list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const rgb = (hex: string) => `rgb(${hexRgb(hex).join(", ")})`;
  function hsl(hex: string) {
    const [h, s, l] = hexHsl(hex);
    return `hsl(${h} ${s}% ${l}%)`;
  }

  async function copy(text: string) {
    if (await copyText(text)) toasts.show(`Скопировано: ${text}`, { kind: "ok", ms: 1600 });
  }

  function recolor(at: HTMLElement, sw: Swatch, title: string) {
    const r = at.getBoundingClientRect();
    pickColor(sw.hex, { x: r.left, y: r.bottom + 6 }, (hex) => patchSw(sw.id, { hex: hex.toLowerCase() }), { title });
  }

  function more(e: MouseEvent, sw: Swatch) {
    e.stopPropagation();
    const at = (e.currentTarget as HTMLElement).closest<HTMLElement>(".pal-sw") ?? (e.currentTarget as HTMLElement);
    const hex = sw.hex.toUpperCase();
    menu.at(e, [
      { label: "Изменить цвет", run: () => recolor(at, sw, sw.t || "Цвет") },
      { label: "Переименовать", run: () => (renaming = sw.id) },
      "-",
      { label: `Копировать ${hex}`, run: () => copy(hex) },
      { label: "Копировать RGB", run: () => copy(rgb(sw.hex)) },
      { label: "Копировать HSL", run: () => copy(hsl(sw.hex)) },
      "-",
      { label: "Удалить цвет", danger: true, run: () => save(list.filter((x) => x.id !== sw.id)) },
    ]);
  }

  function add(e: MouseEvent) {
    e.stopPropagation();
    if (list.length >= 24) return;
    const sw: Swatch = { id: nanoid(6), hex: nextSwatch(list) };
    save([...list, sw]);
    recolor(e.currentTarget as HTMLElement, sw, "Новый цвет");
  }

  function commitName(e: Event, sw: Swatch) {
    if (renaming !== sw.id) return;
    renaming = null;
    const t = (e.currentTarget as HTMLInputElement).value.trim().slice(0, 60);
    if (t !== (sw.t ?? "")) patchSw(sw.id, { t: t || undefined });
  }
  function nameKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") renaming = null;
  }
</script>

<div class="card pal-card" class:chips style:--k={k}>
  {#if p.title || edit}
    <div class="pal-head"><span class="pal-title"><TitleEdit {v} placeholder="Палитра" /></span></div>
  {/if}
  <div class="pal-list">
    {#each list as sw (sw.id)}
      <div class="pal-sw" class:light={isLight(sw.hex)} style:--sw={sw.hex} title="{sw.t ? `${sw.t} · ` : ''}{sw.hex.toUpperCase()} — щелчок копирует" {@attach onTap(() => copy(sw.hex.toUpperCase()))}>
        <span class="pal-chip" aria-hidden="true"></span>
        <span class="pal-meta">
          {#if renaming === sw.id}
            <input class="rename" data-ui value={sw.t ?? ""} placeholder="Название" {@attach focusSelect} onblur={(e) => commitName(e, sw)} onkeydown={nameKey} />
          {:else}
            {#if sw.t}<span class="pal-name">{sw.t}</span>{/if}
            <span class="pal-hex">{sw.hex.toUpperCase()}</span>
          {/if}
        </span>
        {#if edit && renaming !== sw.id}
          <button class="pal-more" data-ui aria-label="Цвет {sw.t || sw.hex}: действия" onclick={(e) => more(e, sw)}><Ellipsis size={Math.round(14 * k)} /></button>
        {/if}
      </div>
    {:else}
      <div class="pal-empty">Пока нет цветов</div>
    {/each}
    {#if edit && list.length < 24}
      <button class="pal-add" data-ui aria-label="Добавить цвет" title="Добавить цвет" onclick={add}><Plus size={Math.round(18 * k)} /></button>
    {/if}
  </div>
</div>
