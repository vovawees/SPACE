<script lang="ts">
  /* Дорожная карта: этапы на шкале периодов (недели, спринты, месяцы,
     кварталы). Этап двигают за середину, длину меняют за правый край;
     щелчок по этапу выделенной карты — цвет, готовность, веха. Каждый этап —
     своё поле, поэтому разные люди могут двигать разные этапы одновременно. */
  import Plus from "@lucide/svelte/icons/plus";
  import { menu } from "../../ui/menu.svelte.ts";
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import { COLOR_ITEMS, colorCss } from "../model.ts";
  import { addBar, nowPos, periodCount, periodLabels, removeBar, roadBars, roadShare, setBar, type Bar } from "./design.ts";
  import { localDelta } from "./local.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const n = $derived(periodCount(p));
  const labels = $derived(periodLabels(p));
  const bars = $derived(roadBars(p));
  const share = $derived(roadShare(p));
  const now = $derived(nowPos(p));
  const live = $derived(!b.readonly && !v.locked);
  const k = $derived(Math.max(0.7, Math.min(1.7, v.w / 720)));
  let track = $state<HTMLElement>();

  let drag = $state<{ id: string; mode: "move" | "size"; x0: number; s0: number; d0: number; s: number; d: number; on: boolean } | null>(null);
  let renaming = $state<string | null>(null);

  const shown = (bar: Bar) => (drag?.id === bar.id ? { ...bar, s: drag.s, d: drag.d } : bar);

  function down(e: PointerEvent, bar: Bar, mode: "move" | "size") {
    if (!live || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { id: bar.id, mode, x0: e.clientX, s0: bar.s, d0: bar.d, s: bar.s, d: bar.d, on: false };
  }
  function move(e: PointerEvent) {
    if (!drag || !track) return;
    const dx = localDelta(b, v, e.clientX - drag.x0, 0).x;
    if (!drag.on && Math.abs(e.clientX - drag.x0) < 4) return;
    drag.on = true;
    const col = track.offsetWidth / n;
    const step = Math.round(dx / col);
    if (drag.mode === "move") {
      drag.s = Math.max(0, Math.min(n - (bars.find((x) => x.id === drag!.id)?.m ? 1 : drag.d0), drag.s0 + step));
    } else drag.d = Math.max(1, Math.min(n - drag.s0, drag.d0 + step));
  }
  function up(e: PointerEvent, bar: Bar) {
    const d = drag;
    drag = null;
    if (!d) return;
    if (!d.on) {
      if (sel && live) barMenu(e, bar);
      return;
    }
    if (d.s !== bar.s || d.d !== bar.d) setBar(b, v, bar.id, { s: d.s, d: d.d });
  }

  function barMenu(e: PointerEvent, bar: Bar) {
    menu.at(e, [
      { label: "Переименовать", run: () => (renaming = bar.id) },
      { label: "Цвет", custom: "colors", colors: COLOR_ITEMS, allowCustom: true, current: bar.c ?? "default", pick: (c) => setBar(b, v, bar.id, { c: c === "default" ? undefined : c }) },
      { label: "Готовность", items: [0, 25, 50, 75, 100].map((x) => ({ label: `${x} %`, checked: (bar.pv ?? 0) === x, run: () => setBar(b, v, bar.id, { pv: x || undefined }) })) },
      { label: "Веха (одна точка)", checked: !!bar.m, run: () => setBar(b, v, bar.id, { m: !bar.m || undefined, d: bar.m ? 1 : bar.d }) },
      "-",
      { label: "Удалить этап", danger: true, run: () => removeBar(b, v, bar.id) },
    ]);
  }

  function commitName(e: Event, bar: Bar) {
    const t = (e.currentTarget as HTMLInputElement).value.trim();
    if (renaming !== bar.id) return;
    renaming = null;
    if (t && t !== bar.t) setBar(b, v, bar.id, { t: t.slice(0, 200) });
  }
  function nameKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") renaming = null;
  }
  function add(e: KeyboardEvent) {
    e.stopPropagation();
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Escape") return input.blur();
    if (e.key !== "Enter") return;
    const t = input.value.trim();
    if (!t || !live) return;
    addBar(b, v, t);
    input.value = "";
  }
</script>

<div class="card rm-card" style:--k={k} style:--n={n}>
  <div class="rm-head">
    <span class="rm-title"><TitleEdit {v} placeholder="Дорожная карта" /></span>
    <span class="rm-n">{Math.round(share * 100)} % готово</span>
  </div>
  <div class="rm-grid">
    <div class="rm-row rm-top">
      <span class="rm-name"></span>
      <div class="rm-track rm-periods">
        {#each labels as l, i (i)}<span class="rm-p" class:now={now !== null && Math.floor(now) === i}>{l}</span>{/each}
      </div>
    </div>
    {#each bars as bar (bar.id)}
      {@const sb = shown(bar)}
      <div class="rm-row">
        <span class="rm-name" title={bar.t} ondblclick={(e) => (e.stopPropagation(), live && (renaming = bar.id))} role="rowheader" tabindex="-1">
          {#if renaming === bar.id}
            <input class="rename" data-ui value={bar.t} {@attach focusSelect} onblur={(e) => commitName(e, bar)} onkeydown={nameKey} />
          {:else}{bar.t || "Этап"}{/if}
        </span>
        <div class="rm-track" bind:this={track}>
          {#if bar.m}
            <button
              class="rm-ms"
              class:done={(bar.pv ?? 0) >= 100}
              data-ui={live ? "" : undefined}
              disabled={!live}
              style:left="{((sb.s + 0.5) / n) * 100}%"
              style:--bc={colorCss(bar.c ?? "violet")}
              aria-label="Веха: {bar.t}"
              onpointerdown={(e) => down(e, bar, "move")}
              onpointermove={move}
              onpointerup={(e) => up(e, bar)}
              onpointercancel={() => (drag = null)}
            ><span></span></button>
          {:else}
            <div
              class="rm-bar"
              class:drag={drag?.id === bar.id && drag.on}
              class:done={(bar.pv ?? 0) >= 100}
              data-ui={live ? "" : undefined}
              role="button"
              tabindex="-1"
              style:left="{(sb.s / n) * 100}%"
              style:width="{(sb.d / n) * 100}%"
              style:--bc={colorCss(bar.c ?? "blue")}
              onpointerdown={(e) => down(e, bar, "move")}
              onpointermove={move}
              onpointerup={(e) => up(e, bar)}
              onpointercancel={() => (drag = null)}
            >
              <span class="rm-fill" style:width="{Math.max(0, Math.min(100, bar.pv ?? 0))}%"></span>
              <span class="rm-bt">{bar.pv ? `${bar.pv} %` : ""}</span>
              {#if live}<span class="rm-grip" role="separator" aria-label="Длина этапа" onpointerdown={(e) => down(e, bar, "size")}></span>{/if}
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="rm-empty">Пока нет этапов{live ? " — добавьте первый ниже" : ""}</div>
    {/each}
    {#if now !== null && now >= 0 && now <= n}
      <div class="rm-nowline" style:--at={now / n} title="Сейчас"></div>
    {/if}
  </div>
  {#if sel && live}
    <label class="rm-add" data-ui>
      <Plus size={Math.round(14 * k)} />
      <input placeholder="Добавить этап" maxlength="200" onkeydown={add} />
    </label>
  {/if}
</div>
