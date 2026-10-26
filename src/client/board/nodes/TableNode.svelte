<script lang="ts">
  /* Таблица: двойной щелчок по ячейке — правка; Tab/Shift+Tab и Enter
     ходят по ячейкам (в конце добавляется строка), Esc — выход. Ширина
     столбцов — перетаскиванием границ в шапке. */
  import Plus from "@lucide/svelte/icons/plus";
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { cellOf, colsOf, insertCol, insertRow, rowsOf, setCell, tableCursor, widthsOf } from "./table.svelte.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel, editing }: NodeCompProps = $props();
  const b = useBoard();
  const rows = $derived(rowsOf(v));
  const cols = $derived(colsOf(v));
  let drag = $state<number[] | null>(null);
  const widths = $derived(drag ?? widthsOf(v));
  const head = $derived(v.props.head !== false);
  let cur = $state<{ r: number; c: number } | null>(null);

  const edges = $derived.by(() => {
    const out: number[] = [];
    let acc = 0;
    for (let i = 0; i < widths.length - 1; i++) out.push((acc += widths[i]!) * 100);
    return out;
  });

  // начало правки: ячейка под двойным щелчком (или первая)
  $effect(() => {
    if (!editing) {
      cur = null;
      return;
    }
    untrack(() => {
      if (cur) return;
      const at = b.ix.editAt;
      let r = 0;
      let c = 0;
      if (at && typeof at === "object") {
        const el = document.elementFromPoint(at.x, at.y)?.closest<HTMLElement>(`[data-id="${v.id}"] [data-cell]`);
        if (el) [r, c] = el.dataset.cell!.split(":").map(Number) as [number, number];
      }
      go(r, c);
    });
  });

  $effect(() => {
    if (!cur) return;
    // строку/столбец могли удалить (в том числе чужими руками)
    if (cur.r >= rows.length || cur.c >= cols.length) cur = { r: Math.min(cur.r, rows.length - 1), c: Math.min(cur.c, cols.length - 1) };
  });

  function go(r: number, c: number) {
    cur = { r: Math.max(0, r), c: Math.max(0, c) };
    tableCursor.id = v.id;
    tableCursor.r = cur.r;
    tableCursor.c = cur.c;
  }

  function caret(el: HTMLElement): { at: number; len: number } {
    const len = el.innerText.replace(/\n$/, "").length;
    const s = getSelection();
    if (!s || !s.rangeCount) return { at: len, len };
    const r = s.getRangeAt(0);
    const pre = r.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return { at: pre.toString().length, len };
  }

  /** Редактор ячейки: текст ставится один раз — дальше его ведёт ввод. */
  function editor(el: HTMLDivElement) {
    untrack(() => {
      if (!cur) return;
      el.textContent = cellOf(v, rows[cur.r]!, cols[cur.c]!);
      el.focus({ preventScroll: true });
      const s = getSelection();
      if (s) {
        s.selectAllChildren(el);
        s.collapseToEnd();
      }
    });
  }

  function onInput(e: Event) {
    if (!cur) return;
    const el = e.currentTarget as HTMLDivElement;
    setCell(b, v, rows[cur.r]!, cols[cur.c]!, el.innerText.replace(/\n$/, ""));
  }

  function next(dir: 1 | -1) {
    if (!cur) return;
    let { r, c } = cur;
    c += dir;
    if (c >= cols.length) {
      c = 0;
      r++;
    } else if (c < 0) {
      c = cols.length - 1;
      r--;
    }
    if (r < 0) return;
    if (r >= rows.length && insertRow(b, v, rows.length) < 0) return;
    go(r, c);
  }

  function onKey(e: KeyboardEvent) {
    if (!cur) return;
    const el = e.currentTarget as HTMLDivElement;
    if (e.key === "Escape") {
      e.preventDefault();
      b.ix.stopEditing();
    } else if (e.key === "Tab") {
      e.preventDefault();
      next(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) return b.ix.stopEditing();
      if (cur.r + 1 >= rows.length && insertRow(b, v, rows.length) < 0) return;
      go(cur.r + 1, cur.c);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = caret(el);
      const atStart = k.at === 0;
      const atEnd = k.at >= k.len;
      const text = el.innerText;
      const firstLine = !text.slice(0, k.at).includes("\n");
      const lastLine = !text.slice(k.at).replace(/\n$/, "").includes("\n");
      if (e.key === "ArrowUp" && firstLine && cur.r > 0) go(cur.r - 1, cur.c);
      else if (e.key === "ArrowDown" && lastLine && cur.r + 1 < rows.length) go(cur.r + 1, cur.c);
      else if (e.key === "ArrowLeft" && atStart && (cur.c > 0 || cur.r > 0)) next(-1);
      else if (e.key === "ArrowRight" && atEnd && (cur.c + 1 < cols.length || cur.r + 1 < rows.length)) next(1);
      else return;
      e.preventDefault();
    }
  }

  function cellDown(e: PointerEvent, r: number, c: number) {
    if (!editing || e.button !== 0) return;
    if (cur && cur.r === r && cur.c === c) return;
    e.preventDefault();
    go(r, c);
  }

  function addRow(e: MouseEvent) {
    e.stopPropagation();
    const i = insertRow(b, v, rows.length);
    if (i >= 0 && editing) go(i, cur?.c ?? 0);
  }

  function addCol(e: MouseEvent) {
    e.stopPropagation();
    const i = insertCol(b, v, cols.length);
    if (i >= 0 && editing) go(cur?.r ?? 0, i);
  }

  /* граница между столбцами i и i+1 */
  function grip(e: PointerEvent, i: number) {
    if (e.button !== 0 || b.readonly) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const w0 = widthsOf(v);
    const total = Math.max(1, v.w);
    const z = b.camera.z;
    const x0 = e.clientX;
    const min = Math.min(0.45, 40 / total);
    const move = (ev: PointerEvent) => {
      const pair = w0[i]! + w0[i + 1]!;
      const a = Math.max(min, Math.min(pair - min, w0[i]! + (ev.clientX - x0) / z / total));
      drag = w0.map((x, k) => (k === i ? a : k === i + 1 ? pair - a : x));
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      if (drag) b.view.update(v.id, { cw: drag.map((x) => Math.round(x * 1e4) / 1e4) });
      drag = null;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }
</script>

<div class="card table-card" data-ui={editing ? "" : undefined}>
  <table class="tbl" class:head>
    <colgroup>
      {#each widths as w, i (i)}<col style:width="{w * 100}%" />{/each}
    </colgroup>
    <tbody>
      {#each rows as r, ri (r)}
        <tr>
          {#each cols as c, ci (c)}
            {@const on = !!cur && cur.r === ri && cur.c === ci}
            <td data-cell="{ri}:{ci}" class:cur={on} onpointerdown={(e) => cellDown(e, ri, ci)}>
              {#if on}
                <div class="cell-ed" contenteditable="plaintext-only" spellcheck="false" role="textbox" tabindex="-1" aria-label="Ячейка" oninput={onInput} onkeydown={onKey} {@attach editor}></div>
              {:else}
                {cellOf(v, r, c)}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  {#if sel && !b.readonly}
    {#each edges as x, i (i)}
      <div class="col-grip" class:on={!!drag} style:left="{x}%" data-ui onpointerdown={(e) => grip(e, i)} role="separator" aria-orientation="vertical" aria-label="Ширина столбца"></div>
    {/each}
  {/if}
</div>
{#if editing && !b.readonly}
  <button class="tbl-add col" data-ui onclick={addCol} aria-label="Добавить столбец"><Plus size={14} /></button>
  <button class="tbl-add row" data-ui onclick={addRow} aria-label="Добавить строку"><Plus size={14} /></button>
{/if}
