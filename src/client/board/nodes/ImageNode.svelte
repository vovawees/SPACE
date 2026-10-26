<script lang="ts">
  /* Картинка: издали — лёгкое превью, вблизи — оригинал (подменяется,
     когда уже загрузился, без мигания). Решение «оригинал или превью»
     принимается, когда камера остановилась, и с запасом в обе стороны —
     иначе при каждом приближении декодировались бы мегабайты.
     GIF анимируется только вблизи; издали — неподвижный первый кадр. */
  import ImageIcon from "@lucide/svelte/icons/image";
  import { untrack } from "svelte";
  import { session } from "../../lib/session.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { fileUrl, localPreview } from "../files.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, sel }: NodeCompProps = $props();
  const b = useBoard();
  const cam = b.camera;

  const gif = $derived(v.props.mime === "image/gif" || /\.gif$/i.test(v.props.name ?? ""));

  /** Нужен оригинал: на экране картинка крупнее превью. */
  let big = $state(false);
  $effect(() => {
    if (cam.moving) return;
    const px = v.w * cam.z * devicePixelRatio;
    const near = b.lod === "near";
    untrack(() => {
      if (!big && near && px > 760) big = true;
      else if (big && (!near || px < 420)) big = false;
    });
  });

  /** GIF двигается вблизи (и всегда — выделенный), но не при «Меньше движения». */
  const still = $derived(gif && !!v.props.preview && !sel && (b.lod !== "near" || session.settings.reduceMotion || v.w * cam.z < 48));

  const want = $derived.by(() => {
    const p = v.props;
    if (!p.src) return localPreview.get(v.id) ?? "";
    if (gif) return fileUrl(still ? p.preview : p.src);
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
    img.decoding = "async";
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
  {#if gif && still}<span class="gif-badge">GIF</span>{/if}
</div>
