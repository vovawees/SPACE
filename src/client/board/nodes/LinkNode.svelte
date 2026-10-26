<script lang="ts">
  /* Ссылка: карточка с обложкой и описанием; двойной щелчок — живая
     страница прямо на доске (если сайт разрешает встраивание). */
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Globe from "@lucide/svelte/icons/globe";
  import X from "@lucide/svelte/icons/x";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { brandOf, brandSvg } from "../brands.ts";
  import { embedFor, embedHeight } from "../embeds.ts";
  import { hostOf, prettyUrl } from "../files.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const url = $derived(p.url ?? "");
  const playing = $derived(b.live.has(v.id));
  // у сервисов (Spotify, Figma, Google Документы…) — их встраиваемый плеер
  const emb = $derived(embedFor(url));
  const live = $derived((playing || !!p.live) && (!!emb || p.embeddable !== false) && /^https?:/.test(url));
  const brand = $derived(brandOf(url));
  const facts = $derived(Array.isArray(p.facts) ? p.facts.filter((f): f is string => typeof f === "string").slice(0, 5) : []);
  let coverFailed = $state(false);
  let iconFailed = $state(false);

  function open(e: MouseEvent) {
    e.stopPropagation();
    window.open(url, "_blank", "noopener,noreferrer");
  }
</script>

{#if live}
  <div class="card link-live" class:embed={!!emb}>
    <div class="link-bar">
      {#if brand && brand !== "link"}
        <span class="fav brand">{@html brandSvg(brand, 13)}</span>
      {:else}
        <Globe size={13} />
      {/if}
      <span>{prettyUrl(url)}</span>
      <button class="icon-btn" data-ui onclick={open} {@attach tip("Открыть в новой вкладке")}><ExternalLink size={14} /></button>
      {#if playing}
        <button class="icon-btn" data-ui onclick={() => b.ix.deactivate(v.id)} {@attach tip("Закрыть")}><X size={14} /></button>
      {/if}
    </div>
    {#if emb}
      <iframe
        src={emb.src}
        title={p.title || emb.site}
        style:height={p.fit !== false ? `${embedHeight(emb, v.w)}px` : undefined}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
        allowfullscreen
        loading="lazy"
      ></iframe>
    {:else}
      <iframe src={url} title={p.title || url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" referrerpolicy="no-referrer" loading="lazy"></iframe>
    {/if}
  </div>
{:else}
  <div class="card" class:loading={p.pending}>
    {#if p.image && !coverFailed && v.w >= 220}
      <img class="link-cover" src={p.image} alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer" onerror={() => (coverFailed = true)} />
    {/if}
    <div class="link-main">
      <div class="link-title">{p.title || prettyUrl(url)}</div>
      {#if p.desc}<div class="link-desc">{p.desc}</div>{/if}
      {#if facts.length}
        <div class="link-facts">
          {#each facts as f, i (i)}<span class:state={i === 0 && /^(Открыт|Закрыт|Влит)$/.test(f)} data-s={f}>{f}</span>{/each}
        </div>
      {/if}
      <div class="link-site">
        {#if brand && brand !== "link"}
          <span class="fav brand">{@html brandSvg(brand, 14)}</span>
        {:else if p.icon && !iconFailed}
          <img src={p.icon} alt="" draggable="false" referrerpolicy="no-referrer" onerror={() => (iconFailed = true)} />
        {:else}
          <Globe size={13} />
        {/if}
        <span>{p.site || hostOf(url)}</span>
      </div>
    </div>
  </div>
{/if}
