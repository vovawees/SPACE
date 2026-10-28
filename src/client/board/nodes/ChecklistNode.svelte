<script lang="ts">
  /* Чек-лист: пункты с галочками. Отмечает любой участник; у каждого пункта
     своё поле, так что одновременные отметки не теряются. Пункты меняются
     в настройках или прямо здесь — «Добавить пункт». */
  import Check from "@lucide/svelte/icons/check";
  import Plus from "@lucide/svelte/icons/plus";
  import { nanoid } from "nanoid";
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { playFx } from "./fx.ts";
  import { checkItem, checklistCount, isChecked, itemsOf, playSound } from "./play.ts";
  import TitleEdit from "./TitleEdit.svelte";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const items = $derived(itemsOf(p));
  const count = $derived(checklistCount(p));
  const full = $derived(count[1] > 0 && count[0] === count[1]);
  const shown = $derived(p.hd ? items.filter((x) => !isChecked(p, x.id)) : items);
  const k = $derived(Math.max(0.75, Math.min(1.8, v.w / 280)));
  let el = $state<HTMLElement>();

  // всё отмечено — салют у всех, кто смотрит
  let was = untrack(() => full);
  $effect(() => {
    if (full && !was && el) {
      playFx(el, "confetti");
      playSound("win");
    }
    was = full;
  });

  function toggle(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (b.readonly) return;
    if (!isChecked(p, id)) playSound("click");
    checkItem(b, v, id);
  }

  function add(e: KeyboardEvent) {
    e.stopPropagation();
    const input = e.currentTarget as HTMLInputElement;
    if (e.key === "Escape") return input.blur();
    if (e.key !== "Enter") return;
    const t = input.value.trim().slice(0, 200);
    if (!t || b.readonly) return;
    b.view.update(v.id, { cl: [...itemsOf(v.props), { id: nanoid(8), t }] });
    input.value = "";
  }
</script>

<div class="card cl-card" class:full bind:this={el} style:--k={k}>
  <div class="cl-head">
    <span class="cl-title"><TitleEdit {v} placeholder="Чек-лист" /></span>
    <span class="cl-n">{full ? "Готово! 🎉" : `${count[0]} / ${count[1]}`}</span>
  </div>
  <div class="cl-bar"><span style:width="{count[1] ? (count[0] / count[1]) * 100 : 0}%"></span></div>
  <ul class="cl-list" data-ui>
    {#each shown as it (it.id)}
      {@const on = isChecked(p, it.id)}
      <li>
        <button class="cl-item" class:on disabled={b.readonly} role="checkbox" aria-checked={on} onclick={(e) => toggle(e, it.id)}>
          <span class="cl-box">{#if on}<Check size={Math.round(13 * k)} strokeWidth={3.2} />{/if}</span>
          <span class="cl-text">{it.t || "Без названия"}</span>
        </button>
      </li>
    {:else}
      <li class="cl-empty">{items.length ? "Всё выполнено — отмеченные скрыты" : "Пока нет пунктов"}</li>
    {/each}
  </ul>
  {#if p.hd && count[0] > 0 && shown.length}<div class="cl-hidden">Выполнено и скрыто: {count[0]}</div>{/if}
  {#if sel && !b.readonly && !v.locked}
    <label class="cl-add" data-ui>
      <Plus size={Math.round(14 * k)} />
      <input placeholder="Добавить пункт" maxlength="200" onkeydown={add} />
    </label>
  {/if}
</div>
