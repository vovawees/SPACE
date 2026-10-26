<script lang="ts">
  /* QR-код: ссылка или текст — навести телефон и открыть. Двойной щелчок
     — изменить содержимое. */
  import { encode } from "uqr";
  import { focusSelect } from "../../ui/portal.ts";
  import { useBoard } from "../board.svelte.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const text = $derived((p.url ?? "").trim());
  const qr = $derived.by(() => {
    if (!text) return null;
    try {
      return encode(text, { border: 1, ecc: "M" });
    } catch {
      return null;
    }
  });
  const path = $derived.by(() => {
    if (!qr) return "";
    let d = "";
    qr.data.forEach((row, y) => {
      let run = -1;
      for (let x = 0; x <= row.length; x++) {
        if (row[x] && run < 0) run = x;
        else if (!row[x] && run >= 0) {
          d += `M${run} ${y}h${x - run}v1h${run - x}z`;
          run = -1;
        }
      }
    });
    return d;
  });
  const caption = $derived(p.title || (/^https?:\/\//i.test(text) ? text.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : text));
  const size = $derived(Math.max(40, Math.min(v.w - 20, v.h - 20 - (caption || editing ? 28 : 0))));

  function commit(e: Event) {
    const val = (e.currentTarget as HTMLInputElement).value.trim();
    if (val !== (p.url ?? "")) b.view.update(v.id, { url: val || undefined });
  }
</script>

<div class="card qr-card">
  {#if qr}
    <svg class="qr-svg" width={size} height={size} viewBox="0 0 {qr.size} {qr.size}" shape-rendering="crispEdges" role="img" aria-label="QR-код: {text}">
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={path} fill="#111" />
    </svg>
  {:else}
    <div class="qr-empty" style:width="{size}px" style:height="{size}px">{text ? "Слишком длинный текст" : "Двойной щелчок — ссылка или текст"}</div>
  {/if}
  {#if editing && !b.readonly}
    <input
      class="qr-in"
      data-ui
      value={p.url ?? ""}
      placeholder="https://… или любой текст"
      {@attach focusSelect}
      onchange={commit}
      onkeydown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          commit(e);
          b.ix.stopEditing();
        }
        if (e.key === "Escape") b.ix.stopEditing();
      }}
    />
  {:else if caption}
    <div class="qr-cap">
      {#if /^https?:\/\//i.test(text)}<a href={text} target="_blank" rel="noopener noreferrer">{caption}</a>{:else}{caption}{/if}
    </div>
  {/if}
</div>
