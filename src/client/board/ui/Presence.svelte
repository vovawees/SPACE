<script lang="ts">
  /* Слой общения поверх доски: чужие выделения, моё сообщение у курсора,
     летящие реакции. Всё в экранных координатах. */
  import { session } from "../../lib/session.svelte.ts";
  import { useBoard } from "../board.svelte.ts";
  import { intersects } from "../geometry.ts";

  const b = useBoard();
  const cam = b.camera;
  const so = b.social;

  /* чужие выделения: рамка цвета участника и имя */
  const selections = $derived.by(() => {
    if (!session.settings.peerSelection || b.lod === "far") return [];
    const s = b.view;
    const view = cam.view;
    const out: { id: number; name: string; color: string; x: number; y: number; w: number; h: number; n: number }[] = [];
    for (const p of b.peers) {
      if (!p.sel.length) continue;
      const ids = p.sel.slice(0, 300).filter((id) => id !== p.editing && s.get(id));
      if (!ids.length) continue;
      const r = s.boundsOfIds(ids);
      if (!r || !intersects(r, view)) continue;
      const a = cam.toScreen(r.x, r.y);
      out.push({ id: p.clientId, name: p.user.name, color: p.user.color, x: a.x - 4, y: a.y - 4, w: r.w * cam.z + 8, h: r.h * cam.z + 8, n: ids.length });
    }
    return out;
  });

  /* моё сообщение у курсора */
  const me = $derived.by(() => {
    if (so.say === null) return null;
    const w = b.ix.hover ?? so.sayAt;
    if (!w) return null;
    const p = cam.toScreen(w.x, w.y);
    return { x: Math.min(Math.max(8, p.x), cam.vw - 260), y: Math.min(Math.max(8, p.y), cam.vh - 60) };
  });

  function onkey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      so.closeSay(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      so.closeSay(false);
    }
  }

  function focus(el: HTMLInputElement) {
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  }

  /* реакции: у края экрана, если место вне вида */
  const bursts = $derived(
    so.bursts.map((x) => {
      const p = cam.toScreen(x.x, x.y);
      const off = p.x < 0 || p.y < 0 || p.x > cam.vw || p.y > cam.vh;
      return { ...x, off, sx: Math.min(Math.max(48, p.x), cam.vw - 48), sy: Math.min(Math.max(96, p.y), cam.vh - 96) };
    }),
  );
  const SPARKS = [
    [-38, -54, 0.55, 40],
    [34, -62, 0.6, 90],
    [-14, -88, 0.5, 140],
    [22, -30, 0.45, 60],
    [-30, -24, 0.42, 120],
  ];
</script>

<div class="presence">
  {#each selections as r (r.id)}
    <div class="psel" class:many={r.n > 1} style:--pc={r.color} style:transform="translate({r.x}px, {r.y}px)" style:width="{r.w}px" style:height="{r.h}px">
      <span>{r.name}</span>
    </div>
  {/each}

  {#if me}
    <div class="say" style:transform="translate({me.x + 14}px, {me.y + 16}px)" style:--pc={b.me.color}>
      <input
        data-ui
        value={so.say}
        maxlength="140"
        placeholder="Скажите что-нибудь…"
        aria-label="Сообщение у курсора"
        {@attach focus}
        oninput={(e) => so.typeSay(e.currentTarget.value)}
        onkeydown={onkey}
        onblur={() => so.say !== null && so.closeSay(true)}
      />
    </div>
  {/if}

  {#each bursts as x (x.key)}
    <div class="burst" class:off={x.off} style:transform="translate({x.sx}px, {x.sy}px)" style:--pc={x.color}>
      <span class="big">{x.e}</span>
      {#each SPARKS as [dx, dy, k, delay], i (i)}
        <span class="spark" style:--dx="{dx}px" style:--dy="{dy}px" style:--k={k} style:animation-delay="{delay}ms">{x.e}</span>
      {/each}
      <span class="who">{x.name}</span>
    </div>
  {/each}
</div>

<style>
  .presence {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .psel {
    position: absolute;
    left: 0;
    top: 0;
    border: 1.5px solid var(--pc);
    border-radius: 6px;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pc) 14%, transparent);
  }
  .psel.many {
    border-style: dashed;
  }
  .psel span {
    position: absolute;
    left: -1.5px;
    bottom: 100%;
    margin-bottom: 3px;
    max-width: 180px;
    padding: 1px 7px 2px;
    border-radius: 6px 6px 6px 2px;
    background: var(--pc);
    color: #111;
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .say {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: auto;
    animation: say-in 160ms var(--ease-spring);
  }
  .say input {
    width: 240px;
    height: 34px;
    padding: 0 12px;
    border-radius: 4px 14px 14px 14px;
    border: 1.5px solid var(--pc);
    background: color-mix(in srgb, var(--pc) 22%, var(--panel));
    color: var(--ink);
    font: inherit;
    font-size: 13.5px;
    font-weight: 500;
    box-shadow: var(--shadow-2);
    outline: none;
  }
  .say input::placeholder {
    color: color-mix(in srgb, var(--ink) 55%, transparent);
  }
  @keyframes say-in {
    from {
      opacity: 0;
      scale: 0.85;
    }
  }

  .burst {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
  }
  .burst span {
    position: absolute;
    left: 0;
    top: 0;
    translate: -50% -50%;
    line-height: 1;
  }
  .big {
    font-size: 44px;
    animation: rise 1900ms var(--ease-out) forwards;
    filter: drop-shadow(0 4px 10px rgb(0 0 0 / 0.35));
  }
  .spark {
    font-size: calc(44px * var(--k));
    opacity: 0;
    animation: spark 1300ms var(--ease-out) forwards;
  }
  .who {
    top: 30px !important;
    padding: 1px 7px 2px;
    border-radius: 99px;
    background: var(--pc);
    color: #111;
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
    animation: who 1900ms ease-out forwards;
  }
  .burst:not(.off) .who {
    display: none;
  }
  @keyframes rise {
    0% {
      opacity: 0;
      transform: translateY(10px) scale(0.3);
    }
    14% {
      opacity: 1;
      transform: translateY(-6px) scale(1.15);
    }
    26% {
      transform: translateY(-10px) scale(1);
    }
    72% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(-70px) scale(0.9);
    }
  }
  @keyframes spark {
    0% {
      opacity: 0;
      transform: translate(0, 0) scale(0.4);
    }
    20% {
      opacity: 0.95;
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(1);
    }
  }
  @keyframes who {
    0%,
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  :global([data-reduce-motion]) .spark {
    display: none;
  }
</style>
