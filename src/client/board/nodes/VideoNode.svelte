<script lang="ts">
  /* Видео: обложка с кнопкой, по нажатию — плеер. Свои видеофайлы
     смотрятся синхронно: пауза и перемотка видны всем, кто открыл плеер. */
  import Film from "@lucide/svelte/icons/film";
  import Play from "@lucide/svelte/icons/play";
  import X from "@lucide/svelte/icons/x";
  import { bytes } from "../../lib/util.ts";
  import { useBoard } from "../board.svelte.ts";
  import { fileUrl, localPreview } from "../files.ts";
  import { QUIET } from "../store.svelte.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  /* Плеер открыт, пока его не закроют: выбор другого объекта, уход за край
     экрана и отдаление его не останавливают. */
  const open = $derived(b.live.has(v.id));
  const poster = $derived(p.image || (p.preview ? fileUrl(p.preview) : localPreview.get(v.id) || ""));
  const title = $derived(p.title || p.name || "");
  const badge = $derived(p.site || (p.bytes ? `Видео · ${bytes(p.bytes)}` : "Видео"));
  const embedUrl = $derived(p.embed ? p.embed + (p.embed.includes("?") ? "&" : "?") + "autoplay=1" : "");
  let video = $state<HTMLVideoElement | null>(null);
  let applying = false;

  function play(e: MouseEvent) {
    e.stopPropagation();
    if (p.pending) return;
    b.ix.activate(v.id);
  }

  function report() {
    if (applying || b.readonly || !video) return;
    b.view.update(v.id, { sync: { playing: !video.paused, t: Math.round(video.currentTime * 100) / 100, at: Date.now(), by: b.me.id } }, QUIET);
  }

  $effect(() => {
    const sy = p.sync;
    const el = video;
    if (!el || !sy || sy.by === b.me.id) return;
    const target = sy.t + (sy.playing ? (Date.now() - sy.at) / 1000 : 0);
    applying = true;
    if (Math.abs(el.currentTime - target) > 0.8) el.currentTime = target;
    if (sy.playing && el.paused) void el.play().catch(() => {});
    if (!sy.playing && !el.paused) el.pause();
    setTimeout(() => (applying = false), 300);
  });
</script>

{#if open}
  <div class="video-bar">
    <span>{title || badge}</span>
    <button data-ui onclick={() => b.ix.deactivate(v.id)} aria-label="Закрыть плеер"><X size={14} /></button>
  </div>
  <div class="media">
    {#if p.embed}
      <iframe src={embedUrl} title={title || "Видео"} allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" data-ui></iframe>
    {:else if p.src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} src={fileUrl(p.src)} poster={poster || undefined} controls autoplay playsinline data-ui onplay={report} onpause={report} onseeked={report}></video>
    {/if}
  </div>
{:else}
  <div class="media" class:loading={p.pending}>
    {#if poster}
      <img src={poster} alt="" draggable="false" loading="lazy" referrerpolicy="no-referrer" />
    {:else}
      <div class="ph"><Film size={30} strokeWidth={1.5} /></div>
    {/if}
    {#if title}<div class="title">{title}</div>{/if}
    {#if !p.pending}
      <button class="play" data-ui onclick={play} aria-label="Смотреть"><Play size={26} fill="currentColor" strokeWidth={0} /></button>
    {/if}
    <div class="badge"><Film size={13} /><span>{badge}</span></div>
  </div>
{/if}
