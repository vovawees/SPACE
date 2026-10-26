<script lang="ts">
  /* Картинка: издали — лёгкое превью, вблизи — оригинал (подменяется,
     когда уже загрузился, без мигания). */
  import ImageIcon from "@lucide/svelte/icons/image";
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { fileUrl, localPreview } from "../files.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();

  const want = $derived.by(() => {
    const p = v.props;
    if (!p.src) return localPreview.get(v.id) ?? "";
    const big = b.lod === "near" && v.w * b.camera.z * devicePixelRatio > 760;
    return fileUrl(p.preview && !big ? p.preview : p.src);
  });
  let shown = $state("");
  let loaded = $state(false);
  let failed = $state(false);

  $effect(() => {
    const url = want;
    const cur = untrack(() => shown);
    if (!url || url === cur) return;
    if (!cur) {
      shown = url;
      return;
    }
    let live = true;
    const img = new Image();
    img.src = url;
    img
      .decode()
      .catch(() => {})
      .then(() => {
        if (live) shown = url;
      });
    return () => (live = false);
  });
</script>

<div class="media" class:loading={(!loaded && !failed) || v.props.pending}>
  {#if shown && !failed}
    <img src={shown} alt={v.props.name ?? ""} draggable="false" decoding="async" onload={() => (loaded = true)} onerror={() => (failed = true)} />
  {/if}
  {#if failed || (!shown && !v.props.pending)}
    <div class="ph"><ImageIcon size={28} strokeWidth={1.5} /></div>
  {/if}
</div>
