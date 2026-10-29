<script lang="ts">
  /* Логика стрелки: «когда у источника случилось … — с целью сделать …».
     Правка применяется сразу; новое правило сначала показывается
     предложением и включается кнопкой. */
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Trash from "@lucide/svelte/icons/trash";
  import Zap from "@lucide/svelte/icons/zap";
  import { untrack } from "svelte";
  import { useBoard } from "../../board.svelte.ts";
  import { AUTO_INPUT, actDef, actionsFor, logicEnds, optionsOf, suggestRule, trigDef, triggersFor } from "../../logic.svelte.ts";
  import { COLOR_ITEMS, TYPE_LABELS, type LogicRule, type NodeType } from "../../model.ts";
  import { nodeTitle, statusesOf } from "../../nodes/values.ts";
  import { playersOf } from "../../nodes/play.ts";
  import { statsOf } from "../../nodes/design.ts";
  import { FX_KINDS } from "../../nodes/widgets.ts";
  import type { NodeView } from "../../store.svelte.ts";

  let { arrowId, onclose }: { arrowId: string; onclose: () => void } = $props();
  const b = useBoard();
  const s = $derived(b.view);

  const arrow = $derived(s.get(arrowId));
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

  const trig = $derived(rule && ends ? trigDef(ends.src.type, rule.on) : undefined);
  const act = $derived(rule && ends ? actDef(ends.tgt.type, rule.do) : undefined);
  /** Итог считается сам — событие не нужно. */
  const derivedAct = $derived(!!rule && (rule.do === "share" || rule.do === "count" || rule.do === "all"));
  const mirror = $derived(rule?.do === "mirror");
  const GOAL_TYPES = new Set<NodeType>(["counter", "dice", "calc", "poll", "button", "note", "text", "shape", "score", "buzzer", "input", "calendar", "words", "random", "coin", "loot", "curve"]);
  /** Игроки счёта или шкалы карточки персонажа. */
  const whoOf = (v: NodeView) => (v.type === "stats" ? statsOf(v.props) : playersOf(v.props));
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
    if (d?.n) p.tn = ends.src.type === "rating" ? 4 : ends.src.type === "progress" || ends.src.type === "roadmap" ? 50 : 10;
    if (d?.x === "state") p.tx = String(Math.max(0, statusesOf(ends.src.props).length - 1));
    if (d?.x === "option") p.tx = optionsOf(ends.src)[0];
    if (d?.x === "player") p.tx = rule?.tx && whoOf(ends.src).some((x) => x.id === rule?.tx) ? rule.tx : whoOf(ends.src)[0]?.id;
    put(p);
  }

  function setAction(id: string) {
    if (!ends) return;
    const d = actDef(ends.tgt.type, id);
    const p: Partial<LogicRule> = { do: id, n: d?.n?.def, x: undefined };
    if (d?.x === "color") p.x = "green";
    if (d?.x === "fx") p.x = "confetti";
    if (d?.x === "state") p.x = String(Math.max(0, statusesOf(ends.tgt.props).length - 1));
    if (d?.x === "player") p.x = rule?.x && whoOf(ends.tgt).some((x) => x.id === rule?.x) ? rule.x : whoOf(ends.tgt)[0]?.id;
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
  }

  const stop = (e: KeyboardEvent) => e.stopPropagation();
</script>


{#if arrow}
  <div class="lp">

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
                <span class="label">{ends.src.type === "loot" ? "Предмет" : "Вариант"}</span>
                <select class="input sm" value={rule.tx ?? ""} onchange={(e) => put({ tx: e.currentTarget.value })}>
                  {#each optionsOf(ends.src) as o (o)}<option value={o}>{o}</option>{/each}
                </select>
              </label>
            {/if}
            {#if trig?.x === "player"}
              {@const pl = whoOf(ends.src)}
              <label class="field">
                <span class="label">Шкала</span>
                <select class="input sm" value={pl.some((x) => x.id === rule.tx) ? rule.tx : (pl[0]?.id ?? "")} onchange={(e) => put({ tx: e.currentTarget.value })}>
                  {#each pl as x (x.id)}<option value={x.id}>{x.t || "Без имени"}</option>{/each}
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
              <span class="label">{act.id === "say" ? "Сообщение" : "Текст"}</span>
              <input class="input sm" maxlength="200" placeholder={act.id === "say" ? "Например: «Готово! 🎉»" : "Что вписать"} value={rule.x ?? ""} onchange={(e) => put({ x: e.currentTarget.value })} onkeydown={stop} />
            </label>
          {/if}
          {#if act?.x === "player"}
            {@const pl = whoOf(ends.tgt)}
            <label class="field">
              <span class="label">{ends.tgt.type === "stats" ? "Шкала" : "Кому"}</span>
              <select class="input sm" value={pl.some((x) => x.id === rule.x) ? rule.x : (pl[0]?.id ?? "")} onchange={(e) => put({ x: e.currentTarget.value })}>
                {#each pl as x (x.id)}<option value={x.id}>{x.t || "Без имени"}</option>{/each}
              </select>
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
            <button type="button" class="btn primary sm" onclick={onclose}>Готово</button>
          {:else}
            <span class="lp-sp"></span>
            <button type="button" class="btn ghost sm" onclick={onclose}>Отмена</button>
            <button type="button" class="btn primary sm" onclick={enable}><Zap size={14} /> Включить</button>
          {/if}
        </footer>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .lp {
    padding-top: 10px;
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
