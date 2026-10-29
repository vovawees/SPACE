<script lang="ts">
  /* Канбан: колонки и карточки. Карточку перетаскивает любой участник —
     в другую колонку, выше или ниже; у каждой карточки своё поле, так что
     одновременные перестановки не мешают друг другу. Двойной щелчок по
     карточке — правка текста, «+» у колонки — новая карточка. */
  import Plus from "@lucide/svelte/icons/plus";
  import Ellipsis from "@lucide/svelte/icons/ellipsis";
  import { focusSelect } from "../../ui/portal.ts";
  import { menu } from "../../ui/menu.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { COLOR_ITEMS, colorCss } from "../model.ts";
  import { addCard, cardsByCol, kanbanCols, kanbanDone, moveCard, removeCard, setCard, type Card } from "./design.ts";
  import { localDelta, nodeLocal, offsetIn } from "./local.ts";
  import { playSound } from "./sound.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const cols = $derived(kanbanCols(p));
  const by = $derived(cardsByCol(p));
  const done = $derived(kanbanDone(p));
  const live = $derived(!b.readonly && !v.locked);
  const k = $derived(Math.max(0.7, Math.min(1.7, (v.w - 16) / cols.length / 170)));
  let root = $state<HTMLElement>();

  let drag = $state<{ id: string; x0: number; y0: number; dx: number; dy: number; on: boolean } | null>(null);
  let target = $state<{ col: string; i: number } | null>(null);
  let editing = $state<string | null>(null);
  let adding = $state<string | null>(null);

  function hit(cx: number, cy: number, id: string): { col: string; i: number } | null {
    if (!root) return null;
    const pt = nodeLocal(b, v, cx, cy);
    if (pt.y < -40 || pt.y > v.H + 40) return null;
    for (const el of root.querySelectorAll<HTMLElement>(".kb-col")) {
      const o = offsetIn(el);
      if (pt.x < o.x - 4 || pt.x > o.x + el.offsetWidth + 4) continue;
      const items = [...el.querySelectorAll<HTMLElement>(".kb-item")].filter((c) => c.dataset.card !== id);
      let i = items.length;
      for (let n = 0; n < items.length; n++) {
        const oc = offsetIn(items[n]!);
        if (pt.y < oc.y + items[n]!.offsetHeight / 2) {
          i = n;
          break;
        }
      }
      return { col: el.dataset.col!, i };
    }
    return null;
  }

  function down(e: PointerEvent, card: Card) {
    if (!live || e.button !== 0 || editing === card.id) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { id: card.id, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, on: false };
  }
  function move(e: PointerEvent) {
    if (!drag) return;
    const ddx = e.clientX - drag.x0;
    const ddy = e.clientY - drag.y0;
    if (!drag.on && Math.hypot(ddx, ddy) < 5) return;
    drag.on = true;
    const d = localDelta(b, v, ddx, ddy);
    drag.dx = d.x;
    drag.dy = d.y;
    target = hit(e.clientX, e.clientY, drag.id);
  }
  function up() {
    const d = drag;
    const t = target;
    drag = null;
    target = null;
    if (!d?.on || !t) return;
    moveCard(b, v, d.id, t.col, t.i);
    if (t.col === cols.at(-1)?.id && cols.length > 1) playSound("click");
  }

  function startEdit(e: MouseEvent, card: Card) {
    e.stopPropagation();
    if (live) editing = card.id;
  }
  function commitEdit(e: Event, card: Card) {
    const t = (e.currentTarget as HTMLTextAreaElement).value.trim();
    if (editing !== card.id) return;
    editing = null;
    if (!t) removeCard(b, v, card.id);
    else if (t !== card.t) setCard(b, v, card.id, { t: t.slice(0, 500) });
  }
  function editKey(e: KeyboardEvent) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLTextAreaElement;
    if (e.key === "Escape") {
      el.value = by.get(cols[0]!.id)?.find((c) => c.id === editing)?.t ?? el.value;
      editing = null;
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el.blur();
    }
  }

  function addKey(e: KeyboardEvent, col: string) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLTextAreaElement;
    if (e.key === "Escape") adding = null;
    else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const t = el.value.trim();
      if (t) addCard(b, v, col, t);
      el.value = "";
    }
  }
  function addBlur(e: Event, col: string) {
    const t = (e.currentTarget as HTMLTextAreaElement).value.trim();
    if (t) addCard(b, v, col, t);
    if (adding === col) adding = null;
  }

  function more(e: MouseEvent, card: Card) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    menu.dropdown(el, [
      { label: "Цвет", custom: "colors", colors: COLOR_ITEMS, allowCustom: true, current: card.c ?? "default", pick: (c) => setCard(b, v, card.id, { c: c === "default" ? undefined : c }) },
      { label: "Изменить текст", run: () => (editing = card.id) },
      {
        label: "Переложить",
        items: cols.map((c) => ({ label: c.t || "Без названия", checked: c.id === card.col, run: () => moveCard(b, v, card.id, c.id, 1e9) })),
      },
      "-",
      { label: "Удалить карточку", danger: true, run: () => removeCard(b, v, card.id) },
    ]);
  }
</script>

<div class="card kb-card" class:dragging={!!drag?.on} bind:this={root} style:--k={k}>
  <div class="kb-head">
    <span class="kb-title"><TitleEdit {v} placeholder="Канбан" /></span>
    <span class="kb-n" title="В последней колонке / всего">{done[0]} / {done[1]}</span>
  </div>
  <div class="kb-cols" style:grid-template-columns="repeat({cols.length}, minmax(0, 1fr))">
    {#each cols as col (col.id)}
      {@const list = by.get(col.id) ?? []}
      {@const over = !!col.lim && list.length > col.lim}
      <section class="kb-col" data-col={col.id} class:over={target?.col === col.id} class:full={over} style:--cc={colorCss(col.c ?? "gray")}>
        <header class="kb-ch">
          <span class="kb-dot"></span>
          <span class="kb-ct">{col.t || "Без названия"}</span>
          <span class="kb-cn" title={col.lim ? `Лимит: ${col.lim}` : undefined}>{list.length}{col.lim ? `/${col.lim}` : ""}</span>
          {#if sel && live}
            <button class="kb-add" data-ui aria-label="Добавить карточку" title="Добавить карточку" onclick={(e) => (e.stopPropagation(), (adding = col.id))}><Plus size={Math.round(13 * k)} /></button>
          {/if}
        </header>
        <div class="kb-list">
          {#each list as card, i (card.id)}
            {#if drag?.on && target?.col === col.id && target.i === i - (list.slice(0, i).some((c) => c.id === drag?.id) ? 1 : 0) && card.id !== drag.id}<div class="kb-drop"></div>{/if}
            <div
              class="kb-item"
              class:drag={drag?.on && drag.id === card.id}
              class:tinted={!!card.c}
              data-card={card.id}
              data-ui={live ? "" : undefined}
              role="listitem"
              style:--ic={card.c ? colorCss(card.c) : null}
              style:transform={drag?.on && drag.id === card.id ? `translate(${drag.dx}px, ${drag.dy}px) rotate(1.5deg)` : null}
              onpointerdown={(e) => down(e, card)}
              onpointermove={move}
              onpointerup={up}
              onpointercancel={up}
              ondblclick={(e) => startEdit(e, card)}
            >
              {#if editing === card.id}
                <textarea class="kb-edit" data-ui value={card.t} rows="2" maxlength="500" {@attach focusSelect} onblur={(e) => commitEdit(e, card)} onkeydown={editKey}></textarea>
              {:else}
                <span class="kb-text">{card.t}</span>
                {#if sel && live}
                  <button class="kb-more" data-ui aria-label="Действия с карточкой" onpointerdown={(e) => e.stopPropagation()} onclick={(e) => more(e, card)}><Ellipsis size={Math.round(13 * k)} /></button>
                {/if}
              {/if}
            </div>
          {/each}
          {#if drag?.on && target?.col === col.id && target.i >= list.filter((c) => c.id !== drag?.id).length}<div class="kb-drop"></div>{/if}
          {#if adding === col.id}
            <textarea class="kb-edit kb-new" data-ui rows="2" maxlength="500" placeholder="Текст карточки, Enter — добавить" {@attach focusSelect} onblur={(e) => addBlur(e, col.id)} onkeydown={(e) => addKey(e, col.id)}></textarea>
          {:else if !list.length}
            <div class="kb-empty">{live ? "Перетащите сюда" : "Пусто"}</div>
          {/if}
        </div>
      </section>
    {/each}
  </div>
</div>
