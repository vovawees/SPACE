<script lang="ts">
  /* Логика стрелки: «когда у источника случилось … — с целью сделать …».
     Правка применяется сразу; новое правило сначала показывается
     предложением и включается кнопкой. На телефоне — листом снизу. */
  import { computePosition, flip, offset, shift, size } from "@floating-ui/dom";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Trash from "@lucide/svelte/icons/trash";
  import X from "@lucide/svelte/icons/x";
  import Zap from "@lucide/svelte/icons/zap";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { picker } from "../../ui/colorpick.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { AUTO_INPUT, actDef, actionsFor, logicEnds, suggestRule, trigDef, triggersFor } from "../logic.svelte.ts";
  import { COLOR_ITEMS, TYPE_LABELS, type LogicRule, type NodeType } from "../model.ts";
  import { nodeTitle, statusesOf } from "../nodes/values.ts";
  import { FX_KINDS, wheelOptions } from "../nodes/widgets.ts";

  const b = useBoard();
  const s = $derived(b.view);
  const sheet = new MediaQuery("(max-width: 640px)");

  const arrow = $derived(b.ui.logic ? s.get(b.ui.logic.id) : undefined);
  const ends = $derived(arrow ? logicEnds(s, arrow) : null);
  const trs = $derived(ends ? triggersFor(ends.src.type) : []);
  const acts = $derived(ends ? actionsFor(ends.tgt.type) : []);
  const auto = $derived(!!ends && AUTO_INPUT.has(ends.tgt.type));
  const saved = $derived(arrow?.props.lg ?? null);

  let draft = $state<LogicRule | null>(null);
  $effect(() => {
    const e = ends;
    untrack(() => (draft = e && !saved ? suggestRule(e.src.type, e.tgt.type) : null));
  });
  const rule = $derived(saved ?? draft);

  // стрелку удалили или отвязали — закрыть
  $effect(() => {
    if (b.ui.logic && (!arrow || b.readonly)) untrack(() => (b.ui.logic = null));
  });

  const trig = $derived(rule && ends ? trigDef(ends.src.type, rule.on) : undefined);
  const act = $derived(rule && ends ? actDef(ends.tgt.type, rule.do) : undefined);
  /** Итог считается сам — событие не нужно. */
  const derivedAct = $derived(!!rule && (rule.do === "share" || rule.do === "count" || rule.do === "all"));
  const mirror = $derived(rule?.do === "mirror");
  const GOAL_TYPES = new Set<NodeType>(["counter", "dice", "calc", "poll", "button", "note", "text", "shape"]);
  const needGoal = $derived(derivedAct && !!ends && GOAL_TYPES.has(ends.src.type));
  const invTrig = $derived(trig?.inv && ends ? trigDef(ends.src.type, trig.inv) : undefined);
  const canRev = $derived(!!invTrig && !!act?.inv && !derivedAct && !mirror);

  const srcName = $derived(ends ? nodeTitle(ends.src) : "");
  const tgtName = $derived(ends ? nodeTitle(ends.tgt) : "");

  /* ------------------------------ правка ------------------------------ */

  function clean(r: LogicRule): LogicRule {
    const out: LogicRule = { on: r.on, do: r.do };
    if (typeof r.n === "number" && Number.isFinite(r.n)) out.n = r.n;
    if (r.x !== undefined && r.x !== "") out.x = r.x;
    if (typeof r.tn === "number" && Number.isFinite(r.tn)) out.tn = r.tn;
    if (r.tx !== undefined && r.tx !== "") out.tx = r.tx;
    if (r.rev === false || r.rev === true) out.rev = r.rev;
    return out;
  }

  function put(p: Partial<LogicRule>) {
    const base = rule;
    if (!base || !arrow) return;
    const next = clean({ ...base, ...p });
    if (saved) s.update(arrow.id, { lg: next });
    else draft = next;
  }

  function setTrigger(id: string) {
    if (!ends) return;
    const d = trigDef(ends.src.type, id);
    const p: Partial<LogicRule> = { on: id, tn: undefined, tx: undefined };
    if (d?.n) p.tn = ends.src.type === "rating" ? 4 : ends.src.type === "progress" ? 50 : 10;
    if (d?.x === "state") p.tx = String(Math.max(0, statusesOf(ends.src.props).length - 1));
    if (d?.x === "option") p.tx = wheelOptions(ends.src)[0]?.t;
    put(p);
  }

  function setAction(id: string) {
    if (!ends) return;
    const d = actDef(ends.tgt.type, id);
    const p: Partial<LogicRule> = { do: id, n: d?.n?.def, x: undefined };
    if (d?.x === "color") p.x = "green";
    if (d?.x === "fx") p.x = "confetti";
    if (d?.x === "state") p.x = String(Math.max(0, statusesOf(ends.tgt.props).length - 1));
    if (id === "share" || id === "count" || id === "all") p.n = needGoalFor(ends.src.type) ? 10 : undefined;
    // эффекты и сообщения не «отматываются»
    if (d?.x === "fx" || d?.x === "text" || id === "go") p.rev = false;
    else if (rule?.rev === false && d?.inv) p.rev = undefined;
    put(p);
  }
  const needGoalFor = (t: NodeType) => GOAL_TYPES.has(t);

  const numIn = (raw: string): number | undefined => {
    const n = Number(raw.replace(",", ".").trim());
    return raw.trim() && Number.isFinite(n) ? n : undefined;
  };

  function enable() {
    if (draft && arrow) s.update(arrow.id, { lg: clean(draft) });
  }
  function remove() {
    if (arrow) s.update(arrow.id, { lg: undefined });
    b.ui.logic = null;
  }

  /* ------------------------------ место ------------------------------ */

  const PAD = { top: 64, bottom: 76, left: 8, right: 8 };
  let panel = $state<HTMLDivElement>();
  $effect(() => {
    const at = b.ui.logic;
    const el = panel;
    if (!at || !el) return;
    if (sheet.current) {
      el.style.left = "";
      el.style.top = "";
      el.style.maxHeight = "";
      el.dataset.shown = "";
      return;
    }
    const anchor = { getBoundingClientRect: () => ({ x: at.x, y: at.y, left: at.x, top: at.y, right: at.x, bottom: at.y, width: 0, height: 0 }) };
    void computePosition(anchor, el, { placement: "bottom-start", strategy: "fixed", middleware: [
        offset(8),
        flip({ padding: PAD }),
        // Не выше свободного места: длинная панель прокручивается и не заезжает под нижнюю панель инструментов.
        size({ padding: PAD, apply: ({ availableHeight, elements }) => void (elements.floating.style.maxHeight = `${Math.round(Math.max(260, Math.min(640, availableHeight)))}px`) }),
        shift({ padding: PAD, crossAxis: true }),
      ] }).then(({ x, y }) => {
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.dataset.shown = "";
    });
  });

  function key(e: KeyboardEvent) {
    if (e.key !== "Escape" || picker.open || !b.ui.logic) return;
    e.preventDefault();
    e.stopPropagation();
    b.ui.logic = null;
  }

  const stop = (e: KeyboardEvent) => e.stopPropagation();
</script>

<svelte:window onkeydowncapture={key} />

{#if b.ui.logic && arrow}
  <div
    class="lp panel"
    class:sheet={sheet.current}
    bind:this={panel}
    role="dialog"
    aria-label="Логика стрелки"
    tabindex="-1"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
  >
    <header class="lp-head">
      <span class="lp-title"><Zap size={14} /> Логика</span>
      <button type="button" class="chip" aria-label="Закрыть" onclick={() => (b.ui.logic = null)}><X size={15} /></button>
    </header>

    {#if !ends}
      <p class="lp-hint">Привяжите оба конца стрелки к объектам — тогда стрелка сможет передавать события.</p>
    {:else}
      <div class="lp-ends">
        <span class="lp-node" title={srcName}><small>{TYPE_LABELS[ends.src.type]}</small>{srcName}</span>
        <ArrowRight size={16} />
        <span class="lp-node" title={tgtName}><small>{TYPE_LABELS[ends.tgt.type]}</small>{tgtName}</span>
      </div>

      {#if auto}
        <p class="lp-hint">
          {ends.tgt.type === "gate" ? "Логический блок" : ends.tgt.type === "calc" ? "Вычисление" : "Диаграмма"} сам берёт значения из всех входящих стрелок — правило не нужно.
        </p>
      {:else if !trs.length || !acts.length || !rule}
        <p class="lp-hint">
          {!trs.length ? `У объекта «${TYPE_LABELS[ends.src.type]}» нет событий.` : `С объектом «${TYPE_LABELS[ends.tgt.type]}» логика ничего не делает.`}
          Попробуйте задачу, кнопку, переключатель, счётчик, прогресс или колесо.
        </p>
      {:else}
        <div class="lp-form">
          {#if derivedAct}
            <p class="lp-note">Значение цели всегда считается по источникам — само, без событий.</p>
          {:else if mirror}
            <p class="lp-note">Цель повторяет состояние источника: включён — включена, выключен — выключена.</p>
          {:else}
            <label class="field">
              <span class="label">Когда источник</span>
              <select class="input sm" value={rule.on} onchange={(e) => setTrigger(e.currentTarget.value)}>
                {#each trs as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
              </select>
            </label>
            {#if trig?.n}
              <label class="field">
                <span class="label">{trig.n}</span>
                <input class="input sm" inputmode="decimal" value={rule.tn ?? ""} onchange={(e) => put({ tn: numIn(e.currentTarget.value) })} onkeydown={stop} />
              </label>
            {/if}
            {#if trig?.x === "state"}
              <label class="field">
                <span class="label">Статус</span>
                <select class="input sm" value={rule.tx ?? ""} onchange={(e) => put({ tx: e.currentTarget.value })}>
                  {#each statusesOf(ends.src.props) as st, i (i)}<option value={String(i)}>{st.t}</option>{/each}
                </select>
              </label>
            {/if}
            {#if trig?.x === "option"}
              <label class="field">
                <span class="label">Вариант</span>
                <select class="input sm" value={rule.tx ?? ""} onchange={(e) => put({ tx: e.currentTarget.value })}>
                  {#each wheelOptions(ends.src) as o (o.id)}<option value={o.t}>{o.t}</option>{/each}
                </select>
              </label>
            {/if}
          {/if}

          <label class="field">
            <span class="label">{derivedAct || mirror ? "Цель" : "Тогда с целью"}</span>
            <select class="input sm" value={rule.do} onchange={(e) => setAction(e.currentTarget.value)}>
              {#each acts as a (a.id)}<option value={a.id}>{a.label}</option>{/each}
            </select>
          </label>

          {#if act?.n && !derivedAct}
            <label class="field">
              <span class="label">{act.n.label}{act.n.unit ? `, ${act.n.unit}` : ""}</span>
              <input class="input sm" inputmode="decimal" value={rule.n ?? act.n.def} onchange={(e) => put({ n: numIn(e.currentTarget.value) })} onkeydown={stop} />
            </label>
          {/if}
          {#if needGoal}
            <label class="field">
              <span class="label">Сколько считать за 100 %</span>
              <input class="input sm" inputmode="decimal" placeholder="любое больше нуля" value={rule.n ?? ""} onchange={(e) => put({ n: numIn(e.currentTarget.value) })} onkeydown={stop} />
            </label>
          {/if}
          {#if act?.x === "fx"}
            <div class="lp-chips" role="radiogroup" aria-label="Эффект">
              {#each FX_KINDS as [k, label] (k)}
                <button type="button" class="lp-chip" class:on={(rule.x ?? "confetti") === k} role="radio" aria-checked={(rule.x ?? "confetti") === k} onclick={() => put({ x: k })}>{label}</button>
              {/each}
            </div>
          {/if}
          {#if act?.x === "color"}
            <div class="lp-colors" role="radiogroup" aria-label="Цвет">
              {#each COLOR_ITEMS as c (c.value)}
                <button type="button" class="lp-dot" class:on={rule.x === c.value} style:--sw={c.css} role="radio" aria-checked={rule.x === c.value} aria-label={c.label} title={c.label} onclick={() => put({ x: c.value })}></button>
              {/each}
            </div>
          {/if}
          {#if act?.x === "text"}
            <label class="field">
              <span class="label">Сообщение</span>
              <input class="input sm" maxlength="200" placeholder="Например: «Готово! 🎉»" value={rule.x ?? ""} onchange={(e) => put({ x: e.currentTarget.value })} onkeydown={stop} />
            </label>
          {/if}
          {#if act?.x === "state"}
            <label class="field">
              <span class="label">Статус</span>
              <select class="input sm" value={rule.x ?? "0"} onchange={(e) => put({ x: e.currentTarget.value })}>
                {#each statusesOf(ends.tgt.props) as st, i (i)}<option value={String(i)}>{st.t}</option>{/each}
              </select>
            </label>
          {/if}

          {#if canRev && invTrig}
            <label class="lp-rev">
              <input type="checkbox" checked={rule.rev !== false} onchange={(e) => put({ rev: e.currentTarget.checked ? undefined : false })} />
              <span>Отменять, когда источник {invTrig.label}</span>
            </label>
          {/if}
        </div>

        <footer class="lp-foot">
          {#if saved}
            <button type="button" class="btn ghost sm danger-text" onclick={remove}><Trash size={14} /> Убрать правило</button>
            <span class="lp-sp"></span>
            <button type="button" class="btn primary sm" onclick={() => (b.ui.logic = null)}>Готово</button>
          {:else}
            <span class="lp-sp"></span>
            <button type="button" class="btn ghost sm" onclick={() => (b.ui.logic = null)}>Отмена</button>
            <button type="button" class="btn primary sm" onclick={enable}><Zap size={14} /> Включить</button>
          {/if}
        </footer>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .lp {
    position: fixed;
    left: 0;
    top: 0;
    width: 320px;
    max-height: min(calc(100dvh - 150px), 620px);
    overflow-y: auto;
    overscroll-behavior: contain;
    visibility: hidden;
    z-index: 2;
    padding-bottom: 4px;
  }
  .lp:global([data-shown]) {
    visibility: visible;
    animation: lp-in 150ms var(--ease-out);
  }
  @keyframes lp-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }
  .lp.sheet {
    left: 8px !important;
    right: 8px;
    top: auto !important;
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    width: auto;
    max-height: 66dvh;
  }
  .lp-head {
    display: flex;
    align-items: center;
    padding: 8px 8px 4px 14px;
  }
  .lp-title {
    flex: 1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 640;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--c-yellow);
  }
  .lp-ends {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 4px 14px 10px;
    color: var(--ink-3);
  }
  .lp-node {
    min-width: 0;
    padding: 6px 9px;
    border-radius: var(--r-2);
    background: var(--surface-2);
    border: 1px solid var(--line);
    font-size: 13px;
    font-weight: 560;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lp-node small {
    display: block;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .lp-form {
    display: grid;
    gap: 10px;
    padding: 0 14px 8px;
  }
  .lp-form select.input {
    padding-right: 6px;
  }
  .lp-hint,
  .lp-note {
    margin: 0;
    padding: 0 14px 12px;
    font-size: 13px;
    line-height: 1.45;
    color: var(--ink-2);
  }
  .lp-note {
    padding: 8px 10px;
    border-radius: var(--r-2);
    background: var(--accent-soft);
    color: var(--ink);
  }
  .lp-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .lp-chip {
    height: 28px;
    padding: 0 10px;
    border-radius: 99px;
    background: var(--surface-2);
    border: 1px solid var(--line);
    color: var(--ink-2);
    font-size: 12.5px;
    white-space: nowrap;
  }
  .lp-chip.on {
    background: var(--accent-soft);
    border-color: var(--accent-line);
    color: var(--accent);
  }
  .lp-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .lp-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--sw);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.2);
  }
  .lp-dot.on {
    box-shadow:
      0 0 0 2px var(--panel),
      0 0 0 4px var(--accent);
  }
  .lp-rev {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ink-2);
  }
  .lp-rev input {
    accent-color: var(--accent);
    width: 16px;
    height: 16px;
  }
  .lp-foot {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px 6px;
    border-top: 1px solid var(--line);
  }
  .lp-foot .btn {
    gap: 5px;
  }
  .lp-sp {
    flex: 1;
  }
  .danger-text {
    color: var(--danger);
  }
  @media (pointer: coarse) {
    .lp-chip {
      height: 34px;
    }
    .lp-dot {
      width: 30px;
      height: 30px;
    }
    .lp-form .input.sm {
      height: 38px;
      font-size: 15px;
    }
  }
</style>
