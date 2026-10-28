<script lang="ts">
  /* Фишка для настольных игр: пешка, круг, квадрат, шестигранник или
     звезда своего цвета с буквой или числом. Двигают все, кто может править. */
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const p = $derived(v.props);
  const shape = $derived(p.tk ?? "pawn");
  const label = $derived([...(p.title ?? "").trim()].slice(0, 4).join(""));
  const gid = $derived(`tkg-${v.id}`);
  const star = (() => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 ? 21 : 47;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(52 + r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(" ");
  })();
  const fsz = $derived(Math.min(v.w, v.h) * (label.length <= 1 ? 0.42 : label.length === 2 ? 0.34 : 0.25) * (shape === "pawn" ? 0.62 : shape === "star" ? 0.7 : 1));
</script>

{#snippet body()}
  {#if shape === "circle"}
    <circle cx="50" cy="50" r="45" />
  {:else if shape === "square"}
    <rect x="6" y="6" width="88" height="88" rx="18" />
  {:else if shape === "hex"}
    <polygon points="50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27" />
  {:else if shape === "star"}
    <polygon points={star} stroke-linejoin="round" />
  {:else}
    <circle cx="50" cy="23" r="15.5" />
    <rect x="33" y="40" width="34" height="8" rx="4" />
    <path d="M38.5 48 L61.5 48 Q62.5 66 72 80 L28 80 Q37.5 66 38.5 48 Z" />
    <rect x="18" y="79" width="64" height="15" rx="7" />
  {/if}
{/snippet}

<div class="tk-node tk-{shape}">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id={gid} cx="34%" cy="26%" r="80%">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.6" />
        <stop offset="42%" stop-color="#fff" stop-opacity="0.08" />
        <stop offset="100%" stop-color="#000" stop-opacity="0.22" />
      </radialGradient>
    </defs>
    <g class="tk-body">{@render body()}</g>
    <g class="tk-gloss" fill="url(#{gid})">{@render body()}</g>
    {#if shape === "circle"}<circle class="tk-ring" cx="50" cy="50" r="34" />{/if}
  </svg>
  {#if label}<span class="tk-label" style:font-size="{fsz}px">{label}</span>{/if}
</div>
