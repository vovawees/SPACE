<script lang="ts">
  import { session } from "../../lib/session.svelte.ts";
  /* Слой поверх доски в экранных координатах: ручки выделения, рамка
     выделения, направляющие, курсоры других людей, подписи рамок
     издалека. Всё кроме ручек прозрачно для указателя. */
  import Lock from "@lucide/svelte/icons/lock";
  import Plus from "@lucide/svelte/icons/plus";
  import { MediaQuery } from "svelte/reactivity";
  import { useBoard } from "../board.svelte.ts";
  import { BARBED, SIDES } from "../connector.ts";
  import { dist, intersects, type Pt } from "../geometry.ts";
  import { CONNECTABLE } from "../interact.svelte.ts";
  import { ASPECT_TYPES, WIDGET_TYPES, type NodeType } from "../model.ts";

  const b = useBoard();
  const cam = b.camera;
  const ix = b.ix;
  const s = $derived(b.view);
  const sel = $derived(s.selected());
  const single = $derived(sel.length === 1 ? sel[0]! : null);
  const idle = $derived(ix.kind === null || ix.kind === "press");
  const canEdit = $derived(!b.readonly && (b.tool === "select" || b.tool === "hand") && !b.spaceDown);

  const ROTATABLE = new Set<NodeType>(["note", "text", "code", "image", "video", "file", "shelf", "link", "shape", "ink", "sticker", "table", "task", "poll", "timer", "audio", "counter", "dice", "progress", ...WIDGET_TYPES]);
  const toS = (p: Pt) => cam.toScreen(p.x, p.y);

  const box = $derived.by(() => {
    // линия и булавка комментария рисуют выделение сами
    if (!sel.length || (single && (single.type === "path" || single.type === "comment"))) return null;
    const z = cam.z;
    if (single) {
      const v = single;
      const c = cam.toScreen(v.x + v.w / 2, v.y + v.H / 2);
      return { x: c.x - (v.w * z) / 2, y: c.y - (v.H * z) / 2, w: v.w * z, h: v.H * z, r: v.r };
    }
    const u = s.boundsOfIds(s.selection.ids);
    if (!u) return null;
    const a = cam.toScreen(u.x, u.y);
    return { x: a.x, y: a.y, w: u.w * z, h: u.h * z, r: 0 };
  });

  const locked = $derived(sel.length > 0 && sel.every((v) => v.locked));
  const showHandles = $derived(!!box && canEdit && !s.editing && !locked && (idle || ix.kind === "resize" || ix.kind === "rotate"));
  const small = $derived(!!box && (box.w < 34 || box.h < 34));
  const edges = $derived.by(() => {
    if (!box || small) return [];
    if (single && ASPECT_TYPES.has(single.type)) return [];
    if (single?.type === "text") return ["e", "w"];
    return ["n", "e", "s", "w"];
  });
  const rotatable = $derived(!!single && ROTATABLE.has(single.type) && !small);

  const BASE: Record<string, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];
  function cursorFor(h: string, r: number): string {
    const deg = (BASE[h]! + (r * 180) / Math.PI + 360 * 4) % 180;
    return CURSORS[Math.round(deg / 45) % 4]!;
  }

  /* ------------------------------ связи ------------------------------ */

  /* Связи от края. Мышь: у края выделенного узла появляется полупрозрачная
     «+» и плавно едет за указателем вдоль ближайшей стороны; щелчок —
     связанный объект, перетаскивание — стрелка ровно из этой точки.
     На сенсорных экранах наведения нет — там «+» стоят по серединам сторон. */
  const coarse = new MediaQuery("pointer: coarse");
  const KNOB_OUT = 44; // насколько далеко за краем кнопка ещё видна, px
  const KNOB_IN = 18; // и насколько внутри узла
  const KNOB_OFF = 21; // вынос кнопки за край
  const KNOB_CORNER = 20; // не заезжать на угловые ручки

  const knobNode = $derived.by(() => {
    if (!canEdit || b.tool !== "select" || s.editing || cam.moving) return null;
    if (ix.kind !== null && ix.kind !== "press") return null;
    const v = single;
    if (!v || v.locked || !CONNECTABLE.has(v.type)) return null;
    if (v.w * cam.z < 24 || v.H * cam.z < 16) return null;
    return v;
  });

  const knob = $derived.by(() => {
    const v = knobNode;
    const w = ix.hover;
    if (!v || coarse.current || !w || ix.hoverNode !== v.id) return null;
    const z = cam.z;
    const hw = (v.w * z) / 2;
    const hh = (v.H * z) / 2;
    const c = cam.toScreen(v.x + v.w / 2, v.y + v.H / 2);
    const p = cam.toScreen(w.x, w.y);
    // в осях узла (без поворота), начало — центр
    const cos = Math.cos(v.r);
    const sin = Math.sin(v.r);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const out = { e: lx - hw, w: -hw - lx, s: ly - hh, n: -hh - ly };
    const side = (Object.keys(out) as (keyof typeof out)[]).reduce((a, k) => (out[k] > out[a] ? k : a), "e");
    const d = out[side];
    if (d < -KNOB_IN || d > KNOB_OUT) return null;
    const horiz = side === "n" || side === "s";
    const half = horiz ? hw : hh;
    let t = horiz ? lx : ly;
    // за углом — место ручек поворота и размера
    if (Math.abs(t) > half + 4) return null;
    const lim = Math.max(0, half - KNOB_CORNER);
    t = Math.max(-lim, Math.min(lim, t));
    if (Math.abs(t) < 10) t = 0; // середина стороны — магнит
    const n = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }[side];
    const ex = horiz ? t : n[0]! * hw;
    const ey = horiz ? n[1]! * hh : t;
    const kx = ex + n[0]! * KNOB_OFF;
    const ky = ey + n[1]! * KNOB_OFF;
    const back = (x: number, y: number) => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos });
    const e = back(ex, ey);
    const k = back(kx, ky);
    const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
    const u = r4(ex / (2 * hw) + 0.5);
    const vv = r4(ey / (2 * hh) + 0.5);
    return { id: v.id, side, x: k.x, y: k.y, ex: e.x, ey: e.y, u, v: vv, near: Math.hypot(lx - kx, ly - ky) < 20 };
  });

  /** Сенсорный экран: «+» по серединам сторон выделенного. */
  const connBox = $derived.by(() => {
    const v = knobNode;
    if (!v || !coarse.current || ix.kind !== null) return null;
    const z = cam.z;
    const w = v.w * z;
    const h = v.H * z;
    const c = cam.toScreen(v.x + v.w / 2, v.y + v.H / 2);
    return { id: v.id, x: c.x - w / 2, y: c.y - h / 2, w, h, r: v.r };
  });

  /** Куда сядет конец линии: магниты сторон и точка на контуре. */
  const anchorHint = $derived.by(() => {
    const a = ix.anchor;
    if (!a) return null;
    const dot = a.dot;
    const magnets = a.magnets.map((m) => ({ side: m.side, on: !!dot && dist(m.p, dot) < 0.75, ...toS(m.p) }));
    const onMagnet = magnets.some((m) => m.on);
    return { key: a.id, magnets, dot: dot && !onMagnet ? toS(dot) : null };
  });

  /* ------------------------------ линии ------------------------------ */

  const pathGeo = $derived(single?.type === "path" ? s.connector(single) : null);
  const path = $derived.by(() => {
    const g = pathGeo;
    if (!g || g.ctrl.length < 2) return null;
    const z = cam.z;
    return {
      route: g.route,
      ctrl: g.ctrl.map(toS),
      mids: g.mids.map(toS),
      elbow: g.elbow ? { ...toS(g.elbow.p), axis: g.elbow.axis } : null,
      barbs: g.heads.map((h) => (h && BARBED.has(h.head) && h.len * z >= 7 ? h.barbs.map(toS) : [])),
    };
  });
  const showPath = $derived(!!path && canEdit && !single!.locked && (idle || ix.kind === "point"));
  const mids = $derived.by(() => {
    const out: { i: number; x: number; y: number }[] = [];
    const ps = path;
    if (!showPath || !ps || ix.kind === "point" || ps.route === "elbow") return out;
    for (let i = 0; i + 1 < ps.ctrl.length; i++) {
      const a = ps.ctrl[i]!;
      const c = ps.ctrl[i + 1]!;
      const m = ps.mids[i];
      if (m && Math.hypot(c.x - a.x, c.y - a.y) > 44) out.push({ i, x: m.x, y: m.y });
    }
    return out;
  });

  /* ------------------------------ прочее ------------------------------ */

  const marquee = $derived.by(() => {
    const m = ix.marquee;
    if (!m) return null;
    const a = cam.toScreen(m.x, m.y);
    return { x: a.x, y: a.y, w: m.w * cam.z, h: m.h * cam.z };
  });

  const guides = $derived(
    ix.guides.map((g) => {
      if (g.axis === "x") {
        const a = cam.toScreen(g.at, g.from);
        const c = cam.toScreen(g.at, g.to);
        return { x1: a.x, y1: a.y, x2: c.x, y2: c.y };
      }
      const a = cam.toScreen(g.from, g.at);
      const c = cam.toScreen(g.to, g.at);
      return { x1: a.x, y1: a.y, x2: c.x, y2: c.y };
    }),
  );

  const size = $derived(ix.kind === "resize" && single ? `${Math.round(single.w)} × ${Math.round(single.H)}` : "");

  const cursors = $derived(
    b.peers
      .filter((p) => p.cursor)
      .map((p) => ({ id: p.clientId, name: p.user.name, color: p.user.color, say: p.say, ...cam.toScreen(p.cursor!.x, p.cursor!.y) }))
      .filter((p) => p.x > -40 && p.y > -40 && p.x < cam.vw + 40 && p.y < cam.vh + 40),
  );

  const editors = $derived.by(() => {
    const out: { id: number; name: string; color: string; x: number; y: number }[] = [];
    for (const p of b.peers) {
      if (!p.editing) continue;
      const v = s.get(p.editing);
      if (!v) continue;
      const r = s.bounds(v);
      const a = cam.toScreen(r.x, r.y);
      out.push({ id: p.clientId, name: p.user.name, color: p.user.color, x: a.x, y: a.y });
    }
    return out;
  });

  const frameTags = $derived.by(() => {
    if (b.lod !== "far") return [];
    const view = cam.view;
    const out: { id: string; name: string; x: number; y: number; w: number; sel: boolean }[] = [];
    for (const v of s.order) {
      if (v.type !== "frame" || !intersects(v.rect, view)) continue;
      const a = cam.toScreen(v.x, v.y);
      const w = v.w * cam.z;
      if (w < 36) continue;
      out.push({ id: v.id, name: v.props.name || "Рамка", x: a.x, y: a.y, w, sel: s.selection.has(v.id) });
      if (out.length > 200) break;
    }
    return out;
  });

  const follow = $derived(b.following !== null ? b.peers.find((p) => p.clientId === b.following) : null);
</script>

<div class="overlay" class:still={!cam.moving}>
  {#each frameTags as f (f.id)}
    <div class="ftag" class:sel={f.sel} data-frame-label={f.id} style:transform="translate({f.x}px, {f.y - 20}px)" style:max-width="{f.w}px">{f.name}</div>
  {/each}

  {#if box}
    <div
      class="sel-box"
      class:group={!single}
      class:locked
      class:editing={!!s.editing}
      style:transform="translate({box.x}px, {box.y}px){box.r ? ` rotate(${box.r}rad)` : ''}"
      style:width="{box.w}px"
      style:height="{box.h}px"
    >
      {#if showHandles}
        {#each edges as h (h)}
          <div class="edge e-{h}" data-handle={h} style:cursor={cursorFor(h, box.r)}></div>
        {/each}
        {#each ["nw", "ne", "se", "sw"] as h (h)}
          <div class="corner c-{h}" data-handle={h} style:cursor={cursorFor(h, box.r)}></div>
        {/each}
        {#if rotatable}
          <div class="rot" data-handle="rot" title="Повернуть (Shift — шаг 15°)"></div>
        {/if}
      {/if}
      {#if locked}
        <div class="lock"><Lock size={11} strokeWidth={2.4} /></div>
      {/if}
      {#if size}
        <div class="size">{size}</div>
      {/if}
    </div>
  {/if}

  {#if knob}
    <div class="knob-dot" class:near={knob.near} style:transform="translate({knob.ex}px, {knob.ey}px)"></div>
    <div
      class="knob"
      class:near={knob.near}
      data-handle="conn:{knob.side}:{knob.id}:{knob.u}:{knob.v}"
      style:transform="translate({knob.x}px, {knob.y}px)"
      title="Щелчок — связанный объект (Tab), перетаскивание — стрелка отсюда"
    >
      <Plus size={14} strokeWidth={2.6} />
    </div>
  {/if}

  {#if connBox}
    <div
      class="conn-box"
      style:transform="translate({connBox.x}px, {connBox.y}px){connBox.r ? ` rotate(${connBox.r}rad)` : ''}"
      style:width="{connBox.w}px"
      style:height="{connBox.h}px"
    >
      {#each SIDES as side (side)}
        <div class="conn k-{side}" data-handle="conn:{side}:{connBox.id}">
          <Plus size={13} strokeWidth={2.6} />
        </div>
      {/each}
    </div>
  {/if}

  {#if anchorHint}
    {#each anchorHint.magnets as m (m.side)}
      <div class="magnet" class:on={m.on} style:transform="translate({m.x}px, {m.y}px)"></div>
    {/each}
    {#if anchorHint.dot}
      <div class="anchor-dot" style:transform="translate({anchorHint.dot.x}px, {anchorHint.dot.y}px)"></div>
    {/if}
  {/if}

  {#if showPath && path}
    {#if path.route === "curve" && path.ctrl.length > 2}
      <svg class="path-guide" width={cam.vw} height={cam.vh}>
        <polyline points={path.ctrl.map((p) => `${p.x},${p.y}`).join(" ")} />
      </svg>
    {/if}
    {#each mids as m (m.i)}
      <div class="pt mid" data-handle="mid:{m.i}" style:transform="translate({m.x}px, {m.y}px)" title="Тяните — добавить излом"></div>
    {/each}
    {#if path.elbow && ix.kind !== "point"}
      <div
        class="pt elbow ax-{path.elbow.axis}"
        data-handle="elbow"
        style:cursor={path.elbow.axis === "x" ? "ew-resize" : "ns-resize"}
        style:transform="translate({path.elbow.x}px, {path.elbow.y}px)"
        title="Тяните — сдвинуть колено, двойной щелчок — как было"
      ></div>
    {/if}
    {#each path.ctrl as p, i (i)}
      {#if i === 0}
        <div class="pt end" class:bound={!!single?.props.b0} data-handle="end0" style:transform="translate({p.x}px, {p.y}px)" title="Тяните к объекту — привязать"></div>
      {:else if i === path.ctrl.length - 1}
        <div class="pt end" class:bound={!!single?.props.b1} data-handle="end1" style:transform="translate({p.x}px, {p.y}px)" title="Тяните к объекту — привязать"></div>
      {:else if path.route !== "elbow"}
        <div class="pt" data-handle="pt:{i}" style:transform="translate({p.x}px, {p.y}px)" title="Двойной щелчок — убрать излом"></div>
      {/if}
    {/each}
    {#if ix.kind !== "point"}
      {#each path.barbs as list, end (end)}
        {#each list as q, i (i)}
          <div
            class="barb"
            data-handle="barb:{end}:{i}"
            style:transform="translate({q.x}px, {q.y}px)"
            title="Тяните — форма наконечника (Alt — один ус), двойной щелчок — сбросить"
          ></div>
        {/each}
      {/each}
    {/if}
  {/if}

  {#if marquee}
    <div class="marquee" style:transform="translate({marquee.x}px, {marquee.y}px)" style:width="{marquee.w}px" style:height="{marquee.h}px"></div>
  {/if}

  {#if guides.length}
    <svg class="guides" width={cam.vw} height={cam.vh}>
      {#each guides as g, i (i)}
        <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} />
      {/each}
    </svg>
  {/if}

  {#each editors as e (e.id)}
    <div class="peer-tag" style:transform="translate({e.x}px, {e.y - 22}px)" style:background={e.color}>{e.name}</div>
  {/each}

  {#each cursors as c (c.id)}
    <div class="cursor" style:transform="translate({c.x}px, {c.y}px)" style:--pc={c.color}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M2.5 1.8 15.2 8.3 9.4 9.7 6.6 15.6Z" fill="var(--pc)" stroke="#fff" stroke-width="1.3" stroke-linejoin="round" />
      </svg>
      {#if c.say !== null}
        <span class="said"><b>{c.name}</b>{c.say || "…"}</span>
      {:else if session.settings.cursorNames}
        <span>{c.name}</span>
      {/if}
    </div>
  {/each}

  {#if follow}
    <div class="follow" style:--pc={follow.user.color}>
      <span>Вы следите за {follow.user.name} · Esc — перестать</span>
    </div>
  {/if}
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .sel-box {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 50% 50%;
    outline: 1.5px solid var(--accent);
    outline-offset: 1px;
    border-radius: 3px;
  }
  .sel-box.group {
    outline-style: dashed;
    outline-width: 1px;
    outline-offset: 4px;
  }
  .sel-box.editing {
    outline-color: var(--accent-line);
  }
  .sel-box.locked {
    outline-color: var(--ink-3);
  }
  .corner {
    position: absolute;
    width: 11px;
    height: 11px;
    margin: -5.5px 0 0 -5.5px;
    background: #fff;
    border: 1.5px solid var(--accent);
    border-radius: 3px;
    pointer-events: auto;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  }
  .c-nw {
    left: 0;
    top: 0;
  }
  .c-ne {
    left: 100%;
    top: 0;
  }
  .c-se {
    left: 100%;
    top: 100%;
  }
  .c-sw {
    left: 0;
    top: 100%;
  }
  .edge {
    position: absolute;
    pointer-events: auto;
  }
  .e-n,
  .e-s {
    left: 8px;
    right: 8px;
    height: 10px;
  }
  .e-n {
    top: -5px;
  }
  .e-s {
    bottom: -5px;
  }
  .e-e,
  .e-w {
    top: 8px;
    bottom: 8px;
    width: 10px;
  }
  .e-e {
    right: -5px;
  }
  .e-w {
    left: -5px;
  }
  .edge::after {
    content: "";
    position: absolute;
    background: #fff;
    border: 1.5px solid var(--accent);
    border-radius: 4px;
    opacity: 0;
    transition: opacity var(--t-fast);
  }
  .e-n::after,
  .e-s::after {
    left: 50%;
    top: 50%;
    width: 18px;
    height: 7px;
    margin: -3.5px 0 0 -9px;
  }
  .e-e::after,
  .e-w::after {
    left: 50%;
    top: 50%;
    width: 7px;
    height: 18px;
    margin: -9px 0 0 -3.5px;
  }
  .sel-box:hover .edge::after,
  .edge:hover::after {
    opacity: 1;
  }
  .rot {
    position: absolute;
    left: 100%;
    top: 0;
    width: 22px;
    height: 22px;
    margin: -30px 0 0 8px;
    border-radius: 50%;
    pointer-events: auto;
    cursor:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-3-6.7L21 8'/%3E%3Cpath d='M21 3v5h-5'/%3E%3C/svg%3E")
        11 11,
      grab;
  }
  .rot::after {
    content: "";
    position: absolute;
    inset: 7px;
    border-radius: 50%;
    background: var(--surface-1);
    border: 1.5px solid var(--accent);
    opacity: 0.7;
  }
  .rot:hover::after {
    opacity: 1;
    background: var(--accent);
  }
  .knob {
    position: absolute;
    left: 0;
    top: 0;
    width: 26px;
    height: 26px;
    margin: -13px 0 0 -13px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: color-mix(in oklab, var(--accent) 82%, transparent);
    color: var(--accent-ink);
    box-shadow: 0 2px 10px color-mix(in oklab, var(--accent) 30%, transparent);
    pointer-events: auto;
    cursor: crosshair;
    opacity: 0.42;
    scale: 0.82;
    /* «спокойно» догоняет указатель */
    transition:
      transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms var(--ease-out),
      scale 200ms var(--ease-spring);
    animation: knob-in 200ms var(--ease-out) backwards;
  }
  .knob::before {
    /* зона попадания больше самого кружка */
    content: "";
    position: absolute;
    inset: -9px;
    border-radius: 50%;
  }
  .knob.near {
    opacity: 1;
    scale: 1.06;
  }
  .knob-dot {
    position: absolute;
    left: 0;
    top: 0;
    width: 8px;
    height: 8px;
    margin: -4px 0 0 -4px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 2px var(--surface-1);
    opacity: 0.35;
    transition:
      transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 160ms var(--ease-out);
    animation: knob-in 200ms var(--ease-out) backwards;
  }
  .knob-dot.near {
    opacity: 0.9;
  }
  @keyframes knob-in {
    from {
      opacity: 0;
      scale: 0.4;
    }
  }
  .conn-box {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 50% 50%;
    pointer-events: none;
  }
  .conn {
    position: absolute;
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: color-mix(in oklab, var(--accent) 82%, transparent);
    color: var(--accent-ink);
    pointer-events: auto;
    opacity: 0.6;
    animation: conn-in 220ms var(--ease-spring) backwards;
  }
  .conn::before {
    content: "";
    position: absolute;
    inset: -8px;
    border-radius: 50%;
  }
  .k-n {
    left: 50%;
    top: -24px;
  }
  .k-s {
    left: 50%;
    top: calc(100% + 24px);
  }
  .k-e {
    left: calc(100% + 24px);
    top: 50%;
  }
  .k-w {
    left: -24px;
    top: 50%;
  }
  @keyframes conn-in {
    from {
      opacity: 0;
      transform: scale(0.35);
    }
  }
  .magnet {
    position: absolute;
    left: 0;
    top: 0;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: var(--surface-1);
    border: 1.5px solid var(--accent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    transition:
      transform 90ms var(--ease-out),
      background 90ms;
  }
  .magnet.on {
    transform: scale(1.45);
    background: var(--accent);
    border-color: #fff;
  }
  .anchor-dot {
    position: absolute;
    left: 0;
    top: 0;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: var(--accent);
    border: 2px solid #fff;
    box-shadow:
      0 0 0 4px var(--accent-soft),
      0 1px 3px rgb(0 0 0 / 0.35);
  }
  .lock {
    position: absolute;
    right: -9px;
    top: -9px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-3);
    color: var(--ink-2);
    border: 1px solid var(--line-2);
  }
  .size {
    position: absolute;
    left: 50%;
    top: calc(100% + 10px);
    transform: translateX(-50%);
    padding: 2px 7px;
    border-radius: 5px;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .path-guide,
  .guides {
    position: absolute;
    left: 0;
    top: 0;
    overflow: visible;
  }
  .path-guide polyline {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    opacity: 0.7;
  }
  .guides line {
    stroke: var(--c-pink);
    stroke-width: 1;
  }
  .pt {
    position: absolute;
    left: 0;
    top: 0;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border-radius: 50%;
    background: #fff;
    border: 1.5px solid var(--accent);
    pointer-events: auto;
    cursor: move;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  }
  .pt.end {
    width: 13px;
    height: 13px;
    margin: -6.5px 0 0 -6.5px;
  }
  .pt.end.bound {
    background: var(--accent);
    border-color: #fff;
  }
  .pt.mid {
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
    background: var(--surface-1);
    opacity: 0.75;
    cursor: copy;
  }
  .pt.mid:hover {
    opacity: 1;
    background: var(--accent);
  }
  .pt.elbow {
    border-radius: 5px;
    background: var(--accent);
    border-color: #fff;
  }
  .pt.elbow.ax-x {
    width: 8px;
    height: 20px;
    margin: -10px 0 0 -4px;
  }
  .pt.elbow.ax-y {
    width: 20px;
    height: 8px;
    margin: -4px 0 0 -10px;
  }
  .barb {
    position: absolute;
    left: 0;
    top: 0;
    width: 16px;
    height: 16px;
    margin: -8px 0 0 -8px;
    display: grid;
    place-items: center;
    pointer-events: auto;
    cursor: grab;
  }
  .barb::before {
    /* ромбик; поворот — у псевдоэлемента, чтобы не крутить сдвиг самой ручки */
    content: "";
    width: 8px;
    height: 8px;
    rotate: 45deg;
    border-radius: 2px;
    background: var(--surface-1);
    border: 1.5px solid var(--accent);
    opacity: 0.85;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  }
  .barb:hover::before {
    opacity: 1;
    background: var(--accent);
  }
  .marquee {
    position: absolute;
    left: 0;
    top: 0;
    background: color-mix(in oklab, var(--accent) 8%, transparent);
    border: 1px solid var(--accent-line);
    border-radius: 2px;
  }
  .cursor {
    position: absolute;
    left: 0;
    top: 0;
    display: flex;
    align-items: flex-start;
    gap: 2px;
    will-change: transform;
  }
  .still .cursor {
    transition: transform 110ms linear;
  }
  .cursor svg {
    margin: -2px 0 0 -2px;
    filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35));
  }
  .cursor span {
    margin-top: 12px;
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--pc);
    color: #111;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.25);
  }
  .cursor .said {
    display: grid;
    gap: 1px;
    max-width: 260px;
    padding: 5px 11px 7px;
    border-radius: 4px 14px 14px 14px;
    font-size: 13.5px;
    font-weight: 550;
    line-height: 1.3;
    white-space: normal;
    overflow-wrap: anywhere;
    animation: said-in 160ms var(--ease-spring);
  }
  .cursor .said b {
    font-size: 10.5px;
    font-weight: 700;
    opacity: 0.7;
  }
  @keyframes said-in {
    from {
      opacity: 0;
      scale: 0.85;
    }
  }
  .peer-tag {
    position: absolute;
    left: 0;
    top: 0;
    padding: 2px 7px;
    border-radius: 6px 6px 6px 0;
    color: #111;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .ftag {
    position: absolute;
    left: 0;
    top: 0;
    padding: 2px 2px 4px;
    font-size: 12.5px;
    font-weight: 550;
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: auto;
    cursor: default;
  }
  .ftag.sel {
    color: var(--accent);
  }
  .follow {
    position: absolute;
    inset: 0;
    border: 2px solid var(--pc);
    border-radius: 2px;
    display: flex;
    justify-content: center;
  }
  .follow span {
    margin-top: 62px;
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 0 0 8px 8px;
    background: var(--pc);
    color: #111;
    font-size: 12px;
    font-weight: 600;
    height: fit-content;
  }
</style>
