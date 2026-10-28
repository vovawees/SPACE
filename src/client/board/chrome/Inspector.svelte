<script lang="ts">
  /* Панель настроек выделенного: на компьютере — справа, на телефоне —
     листом снизу. Вкладки: «Настройки» (всё, что можно поменять у этого
     типа объекта), «Оформление» и «Логика» (связи-стрелки). */
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import CopyPlus from "@lucide/svelte/icons/copy-plus";
  import Layers from "@lucide/svelte/icons/layers";
  import Lock from "@lucide/svelte/icons/lock";
  import LockOpen from "@lucide/svelte/icons/lock-open";
  import Paintbrush from "@lucide/svelte/icons/paintbrush";
  import Settings2 from "@lucide/svelte/icons/settings-2";
  import Trash from "@lucide/svelte/icons/trash";
  import X from "@lucide/svelte/icons/x";
  import Zap from "@lucide/svelte/icons/zap";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { picker } from "../../ui/colorpick.svelte.ts";
  import { menu } from "../../ui/menu.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard, type InspectTab } from "../board.svelte.ts";
  import { inspectFor } from "../inspect/build.ts";
  import type { Field as FieldT, Section } from "../inspect/types.ts";
  import { AUTO_INPUT, actionsFor, canLogic, logicEnds, ruleSummary, triggersFor } from "../logic.svelte.ts";
  import { TYPE_LABELS, colorCss } from "../model.ts";
  import { nodeTitle } from "../nodes/values.ts";
  import { duplicate, removeSelected } from "../ops.ts";
  import type { NodeView } from "../store.svelte.ts";
  import { typeIcon } from "../typeInfo.ts";
  import Field from "./inspector/Field.svelte";
  import LogicTab from "./inspector/LogicTab.svelte";
  import StyleTab from "./inspector/StyleTab.svelte";

  const b = useBoard();
  const s = $derived(b.view);
  const mobile = new MediaQuery("(max-width: 760px)");

  const views = $derived(s.selected().filter((v) => v.type !== "comment"));
  const shown = $derived(!!b.ui.inspect && !b.readonly && views.length > 0);
  const one = $derived(views.length === 1 ? views[0]! : null);
  const type = $derived(views.length && views.every((v) => v.type === views[0]!.type) ? views[0]!.type : null);
  const Icon = $derived(type ? typeIcon(type) : Layers);
  const locked = $derived(views.length > 0 && views.every((v) => v.locked));

  const plural = (n: number) => {
    const a = n % 100;
    const d = n % 10;
    return a > 10 && a < 20 ? "объектов" : d === 1 ? "объект" : d >= 2 && d <= 4 ? "объекта" : "объектов";
  };
  const heading = $derived(type ? TYPE_LABELS[type] : `${views.length} ${plural(views.length)}`);
  const sub = $derived.by(() => {
    if (!one) return type ? `${views.length} ${plural(views.length)}` : "";
    const t = nodeTitle(one);
    return t && t !== TYPE_LABELS[one.type] ? t : "";
  });

  /* ------------------------------ логика ------------------------------ */

  /** Стрелки, привязанные к выделенному объекту обоими концами. */
  const links = $derived.by((): NodeView[] => {
    if (!one || one.type === "path") return [];
    void s.bindRev;
    const out: NodeView[] = [];
    for (const id of s.bindings.get(one.id) ?? []) {
      const p = s.get(id);
      if (p?.type === "path" && logicEnds(s, p)) out.push(p);
    }
    return out;
  });
  const logicOk = $derived(
    !!one && (one.type === "path" ? canLogic(s, one) : links.length > 0 || triggersFor(one.type).length > 0 || actionsFor(one.type).length > 0 || AUTO_INPUT.has(one.type)),
  );
  const tab = $derived<InspectTab>(b.ui.inspect?.tab === "logic" && !logicOk ? "props" : (b.ui.inspect?.tab ?? "props"));
  const arrowId = $derived.by(() => {
    if (one?.type === "path") return one.id;
    const a = b.ui.inspect?.arrow;
    return a && links.some((l) => l.id === a) ? a : null;
  });
  const ruled = $derived(one?.type === "path" ? (one.props.lg ? 1 : 0) : links.filter((l) => l.props.lg).length);

  /* ------------------------------ поля ------------------------------ */

  /** Разделы с уникальными ключами полей (для списков Svelte). */
  const sections = $derived.by((): { sec: Section; keyed: [string, FieldT][] }[] => {
    if (!shown || tab !== "props") return [];
    return inspectFor(b, views).map((sec) => {
      const seen = new Map<string, number>();
      const keyed = sec.fields.map((f): [string, FieldT] => {
        const base = f.key ?? f.label ?? f.k;
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        return [n ? `${base}#${n}` : base, f];
      });
      return { sec, keyed };
    });
  });

  /* ------------------------------ место ------------------------------ */

  let panel = $state<HTMLDivElement>();
  let sheetH = $state(0);
  const side = $derived(!mobile.current && b.ui.history ? 310 : !mobile.current && b.ui.chat ? 330 : 0);
  const W = 320;

  $effect(() => {
    const right = shown && !mobile.current ? W + 10 + side : 0;
    const bottom = shown && mobile.current ? sheetH : 0;
    document.documentElement.style.setProperty("--insp", `${right}px`);
    untrack(() => {
      b.inset.right = right;
      b.inset.bottom = bottom;
    });
  });
  $effect(() => () => {
    document.documentElement.style.removeProperty("--insp");
    b.inset.right = 0;
    b.inset.bottom = 0;
  });

  // на телефоне лист закрывается вместе с выделением; на компьютере панель ждёт следующего
  $effect(() => {
    if (b.ui.inspect && (b.readonly || (mobile.current && !views.length))) untrack(() => (b.ui.inspect = null));
  });

  // выделенное не должно прятаться под панелью: подвинуть доску
  const selKey = $derived(views.map((v) => v.id).join(","));
  $effect(() => {
    void selKey;
    if (!shown || !panel) return;
    const el = panel;
    const raf = requestAnimationFrame(() => {
      const r = untrack(() => s.boundsOfIds(s.selection.ids));
      if (!r) return;
      const cam = b.camera;
      if (mobile.current) {
        cam.revealBand(r, 64, cam.vh - el.getBoundingClientRect().top + 8);
        return;
      }
      const box = el.getBoundingClientRect();
      const a = cam.toScreen(r.x, r.y);
      const c = cam.toScreen(r.x + r.w, r.y + r.h);
      const under = c.x > box.left - 8 && a.x < box.right && c.y > box.top && a.y < box.bottom;
      if (under) cam.revealIn(r, { top: 64, right: cam.vw - box.left + 8, bottom: 80 });
    });
    return () => cancelAnimationFrame(raf);
  });

  /* ------------------------------ действия ------------------------------ */

  const ids = $derived(views.map((v) => v.id));
  const close = () => (b.ui.inspect = null);
  const go = (t: InspectTab) => b.inspect(t);
  function toggleLock() {
    s.updateMany(ids.map((id) => [id, { locked: locked ? undefined : true }]));
  }

  function key(e: KeyboardEvent) {
    if (e.key !== "Escape" || !shown || picker.open || menu.open) return;
    const t = e.target as HTMLElement | null;
    if (!panel?.contains(t)) return;
    e.preventDefault();
    e.stopPropagation();
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) t.blur();
    else close();
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if shown}
  <div
    class="ins panel"
    class:sheet={mobile.current}
    style:--side="{side}px"
    bind:this={panel}
    bind:offsetHeight={sheetH}
    role="dialog"
    aria-label="Настройки: {heading}"
    tabindex="-1"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
    oncontextmenu={(e) => e.stopPropagation()}
  >
    <header class="ins-head">
      <span class="ins-ic" style:--c={one?.props.color ? colorCss(one.props.color) : null}><Icon size={17} /></span>
      <span class="ins-name">
        <b>{heading}</b>
        {#if sub}<small title={sub}>{sub}</small>{/if}
      </span>
      <button type="button" class="chip" aria-label="Дублировать" onclick={() => duplicate(b, ids)} {@attach tip("Дублировать", "Mod+D")}><CopyPlus size={15} /></button>
      <button type="button" class="chip" class:on={locked} aria-label={locked ? "Открепить" : "Закрепить"} onclick={toggleLock} {@attach tip(locked ? "Открепить" : "Закрепить", "Mod+L")}>
        {#if locked}<Lock size={15} />{:else}<LockOpen size={15} />{/if}
      </button>
      <button type="button" class="chip danger" aria-label="Удалить" onclick={() => removeSelected(b)} {@attach tip("Удалить", "Del")}><Trash size={15} /></button>
      <button type="button" class="chip" aria-label="Закрыть" onclick={close} {@attach tip("Закрыть", "Esc")}><X size={16} /></button>
    </header>

    <div class="ins-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "props"} class:on={tab === "props"} onclick={() => go("props")}><Settings2 size={14} /> Настройки</button>
      <button type="button" role="tab" aria-selected={tab === "style"} class:on={tab === "style"} onclick={() => go("style")}><Paintbrush size={14} /> Оформление</button>
      {#if logicOk}
        <button type="button" role="tab" aria-selected={tab === "logic"} class:on={tab === "logic"} onclick={() => go("logic")}>
          <Zap size={14} /> Логика{#if ruled}<span class="ins-badge">{ruled}</span>{/if}
        </button>
      {/if}
    </div>

    <div class="ins-body">
      {#if tab === "props"}
        {#each sections as { sec, keyed } (sec.id)}
          <section class="ins-sec">
            {#if sec.title}<h4>{sec.title}</h4>{/if}
            <div class="ins-grid">
              {#each keyed as [k, f] (k)}
                <Field {f} />
              {/each}
            </div>
          </section>
        {:else}
          <p class="in-info pad">У этого объекта нет своих настроек — загляните в «Оформление».</p>
        {/each}
      {:else if tab === "style"}
        <StyleTab {views} />
      {:else if arrowId}
        {#if one?.type !== "path"}
          <button type="button" class="ins-back" onclick={() => b.inspect("logic")}><ArrowLeft size={14} /> Все связи</button>
        {/if}
        {#key arrowId}
          <LogicTab {arrowId} onclose={() => (one?.type === "path" ? close() : b.inspect("logic"))} />
        {/key}
      {:else if one}
        <div class="ins-links">
          {#each links as l (l.id)}
            {@const e = logicEnds(s, l)}
            {#if e}
              {@const out = e.src.id === one.id}
              {@const other = out ? e.tgt : e.src}
              <button type="button" class="ins-link" class:on={!!l.props.lg} onclick={() => b.inspect("logic", { arrow: l.id })}>
                <span class="ins-dir" title={out ? "Отсюда" : "Сюда"}>{out ? "→" : "←"}</span>
                <span class="ins-who"><small>{TYPE_LABELS[other.type]}</small>{nodeTitle(other)}</span>
                <span class="ins-rule">{l.props.lg ? ruleSummary(s, l).replace("⚡", "").trim() || "правило" : "без правила"}</span>
                <ChevronRight size={15} />
              </button>
            {/if}
          {/each}
          <p class="in-info">
            {links.length ? "Выберите связь, чтобы настроить, что она делает." : "Связей пока нет."}
            Протяните стрелку от этого объекта к другому — и здесь можно будет выбрать, что должно происходить: «нажали кнопку → +1 к счёту», «таймер закончился → салют» и так далее.
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}
