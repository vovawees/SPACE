<script lang="ts">
  /* Поле ввода: имя, ответ, число для вычислений. Пишет любой участник с
     правом правки; значение видят все, его подхватывают стрелки и
     вычисления. Пока поле в фокусе, чужие правки его не перебивают. */
  import { useBoard } from "../board.svelte.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";
  import { textNumber } from "./values.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const num = $derived(p.it === "num");
  let focused = $state(false);
  let local = $state("");
  const value = $derived(focused ? local : (p.iv ?? ""));
  const bad = $derived(num && value.trim() !== "" && textNumber(value) === null);
  const k = $derived(Math.max(0.5, Math.min(v.w / 260, v.h / 100)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  function commit() {
    clearTimeout(timer);
    const val = local.slice(0, 500);
    if (!b.readonly && val !== (v.props.iv ?? "")) b.view.update(v.id, { iv: val || undefined });
  }
  function oninput(e: Event) {
    local = (e.currentTarget as HTMLInputElement).value;
    clearTimeout(timer);
    timer = setTimeout(commit, 400);
  }
  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") el.blur();
    if (e.key === "Escape") {
      clearTimeout(timer);
      local = p.iv ?? "";
      el.blur();
    }
  }
</script>

<div class="card in-card" class:bad style:--k={k}>
  <span class="in-title"><TitleEdit {v} placeholder="Поле ввода" /></span>
  <label class="in-box" data-ui>
    <input
      class="in-field"
      value={value}
      placeholder={p.ph || (num ? "Число" : "Введите…")}
      inputmode={num ? "decimal" : "text"}
      maxlength="500"
      readonly={b.readonly}
      aria-label={p.title || "Поле ввода"}
      onfocus={() => {
        focused = true;
        local = p.iv ?? "";
      }}
      onblur={() => {
        commit();
        focused = false;
      }}
      {oninput}
      {onkeydown}
    />
    {#if num && p.unit}<span class="in-unit">{p.unit}</span>{/if}
  </label>
  {#if bad}<span class="in-err">Нужно число</span>{/if}
</div>
