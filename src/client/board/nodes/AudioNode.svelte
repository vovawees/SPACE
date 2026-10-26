<script lang="ts">
  /* Аудио: свой плеер. Пока музыка играет, узел не выгружается за
     краем экрана и при отдалении — звук не обрывается. */
  import Music from "@lucide/svelte/icons/music";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import { bytes } from "../../lib/util.ts";
  import { useBoard } from "../board.svelte.ts";
  import { fileUrl } from "../files.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  let el = $state<HTMLAudioElement | null>(null);
  let playing = $state(false);
  let t = $state(0);
  let d = $state(0);
  const name = $derived((p.title || p.name || "Аудио").replace(/\.[a-z0-9]{2,5}$/i, ""));

  const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (!el || p.pending) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }

  function seek(e: PointerEvent) {
    e.stopPropagation();
    if (!el || !d) return;
    const bar = e.currentTarget as HTMLElement;
    const set = (x: number) => {
      const r = bar.getBoundingClientRect();
      el!.currentTime = Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width))) * d;
    };
    set(e.clientX);
    bar.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  }

  function onState() {
    playing = !!el && !el.paused;
    if (playing) b.live.add(v.id);
    else b.live.delete(v.id);
  }
</script>

<div class="card audio-card" class:loading={p.pending} class:playing>
  <button class="audio-play" data-ui onclick={toggle} aria-label={playing ? "Пауза" : "Слушать"} disabled={p.pending}>
    {#if playing}<Pause size={18} fill="currentColor" strokeWidth={0} />{:else}<Play size={18} fill="currentColor" strokeWidth={0} />{/if}
  </button>
  <div class="audio-main">
    <div class="audio-name"><Music size={13} /><span>{name}</span></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="audio-bar" data-ui onpointerdown={seek}>
      <span style:width="{d ? (t / d) * 100 : 0}%"></span>
    </div>
    <div class="audio-time"><span>{fmt(t)}</span><span>{d ? fmt(d) : p.bytes ? bytes(p.bytes) : ""}</span></div>
  </div>
  {#if p.src}
    <audio bind:this={el} src={fileUrl(p.src)} preload="metadata" onplay={onState} onpause={onState} onended={onState} ontimeupdate={() => (t = el?.currentTime ?? 0)} onloadedmetadata={() => (d = el?.duration ?? 0)} ondurationchange={() => (d = el?.duration ?? 0)}></audio>
  {/if}
</div>
