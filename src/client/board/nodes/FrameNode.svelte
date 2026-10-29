<script lang="ts">
  /* Рамка: область с названием. Внутренность прозрачна для указателя —
     внутри большой рамки можно выделять рамкой и рисовать. Рамка-устройство
     (телефон, браузер, окно, экран игры) рисует вокруг себя корпус или
     панель — для макетов интерфейсов; внутрь кладут фигуры и текст. */
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import { DEVICE_LABELS } from "../model.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const dev = $derived(v.props.dev && v.props.dev in DEVICE_LABELS ? v.props.dev : null);
  const name = $derived(v.props.name || (dev ? DEVICE_LABELS[dev] : "Рамка"));
  const renaming = $derived(b.ix.renaming === v.id);

  function commit(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (b.ix.renaming !== v.id) return;
    b.ix.renaming = null;
    if (val && val !== name) b.view.update(v.id, { name: val });
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
    if (e.key === "Escape") {
      b.ix.renaming = null;
      e.stopPropagation();
    }
  }
</script>

<div class="frame-body{dev ? ` dev dev-${dev}` : ''}">
  {#if dev === "phone" || dev === "tablet"}
    <div class="dv-status" aria-hidden="true">
      <span>9:41</span>
      <svg viewBox="0 0 66 12" width="66" height="12">
        <rect x="0" y="8" width="3" height="4" rx="0.7" /><rect x="4.5" y="6" width="3" height="6" rx="0.7" /><rect x="9" y="3.5" width="3" height="8.5" rx="0.7" /><rect x="13.5" y="1" width="3" height="11" rx="0.7" />
        <path d="M27 11.6l2.2-2.6a3.3 3.3 0 0 0-4.4 0zM22.7 6.7a6.6 6.6 0 0 1 8.6 0l-1.3 1.6a4.6 4.6 0 0 0-6 0zM20.3 3.9a10 10 0 0 1 13.4 0l-1.3 1.6a7.9 7.9 0 0 0-10.8 0z" />
        <rect x="40" y="0.5" width="22" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity="0.45" /><rect x="42" y="2.5" width="15" height="7" rx="1.6" /><rect x="63" y="4" width="1.6" height="4" rx="0.8" opacity="0.45" />
      </svg>
    </div>
    {#if dev === "phone"}<div class="dv-island" aria-hidden="true"></div>{/if}
    <div class="dv-home" aria-hidden="true"></div>
  {:else if dev === "browser"}
    <div class="dv-bar" aria-hidden="true">
      <span class="dv-dots"><i></i><i></i><i></i></span>
      <span class="dv-url"><svg viewBox="0 0 10 12" width="9" height="11"><rect x="1" y="5" width="8" height="6.5" rx="1.4" /><path d="M3 5V3.6a2 2 0 0 1 4 0V5" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>{v.props.url || "example.com"}</span>
    </div>
  {:else if dev === "window"}
    <div class="dv-title" aria-hidden="true">
      <span class="dv-tname">{name}</span>
      <span class="dv-ctl"><i>—</i><i>▢</i><i class="x">✕</i></span>
    </div>
  {:else if dev === "game"}
    <div class="dv-safe" aria-hidden="true"><span>безопасная зона</span></div>
    <div class="dv-cross" aria-hidden="true"></div>
  {/if}
</div>
<div class="frame-label{dev ? ` dvl-${dev}` : ''}" data-frame-label={v.id}>
  {#if renaming}
    <input class="rename" data-ui value={name} {@attach focusSelect} onblur={commit} onkeydown={onkey} />
  {:else}
    {name}
  {/if}
</div>
