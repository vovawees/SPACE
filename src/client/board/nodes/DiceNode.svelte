<script lang="ts">
  /* Кубики: бросок виден всем — у всех один результат и одна и та же
     анимация (её «случайность» выводится из номера броска). Шестигранник —
     скруглённый 3D-кубик со светом (рисуется в SVG, см. die3d.ts), который
     катится по столу; остальные — многогранники, которые крутятся волчком,
     отскакивают от стола и замирают. Щелчок по
     кубикам — бросить. Свои грани, прибавка, «лучший из» — в настройках. */
  import { untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import { PIPS, diceCount, diceFaces, diceFormula, diceSides, diceTotal, faceLabel, keptDice, randInt, rollDice, type Roll } from "./games.ts";
  import { playSound } from "./sound.ts";
  import { axisAngle, cubeFrame, mul, norm, pipXY, restPose, rotZ, view, type M3, type V3 } from "./die3d.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v }: NodeCompProps = $props();
  const b = useBoard();
  const p = $derived(v.props);
  const sides = $derived(diceSides(p));
  const count = $derived(diceCount(p));
  const custom = $derived(!!diceFaces(p));
  const cube = $derived(sides === 6);
  const roll = $derived((p.roll as Roll | null | undefined) ?? null);
  const vals = $derived(roll ? roll.v.slice(0, count) : []);
  const kept = $derived(keptDice(p, vals));
  const total = $derived(diceTotal(p, vals));
  const look = $derived(p.ds ?? "classic");
  const k = $derived(Math.max(0.4, Math.min(v.w / 220, v.h / 170)));

  /* раскладка: до трёх — в ряд, дальше — в два-три ряда; грань — по месту */
  const perRow = $derived(count <= 3 ? count : count <= 8 ? Math.ceil(count / 2) : 5);
  const rows = $derived(Math.ceil(count / perRow));
  const hist = $derived(p.hist ? (p.rh ?? []).slice(0, -1).slice(-5).reverse() : []);
  const infoH = $derived(24 * Math.min(k, 1.5) + (hist.length ? 22 : 0));
  const gap = $derived(12 * Math.min(1.4, k));
  /** Повёрнутый 3D-кубик с перспективой занимает заметно больше своей клетки —
      закладываем запас, чтобы кубики не наезжали друг на друга и на подпись. */
  const fp = $derived(cube ? 1.16 : 1.08);
  const die = $derived(Math.max(14, Math.min(100 * k, (v.w - 28 - (perRow - 1) * gap) / perRow / fp, (v.h - 34 - infoH - (rows - 1) * gap) / rows / (fp * 1.06))));
  const spread = $derived(die * (fp - 1));

  /* ------------------------- детерминированный «случай» ------------------------- */

  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const idHash = (() => {
    let h = 2166136261;
    for (const ch of untrack(() => v.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  })();

  /** Наклон на столе — у каждого броска свой, но у всех одинаковый. */
  function tiltOf(i: number, seq: number) {
    const r = rng(seq * 7919 + i * 104729 + idHash + 1);
    return (r() - 0.5) * 26;
  }
  const pose = (i: number, seq: number) => ({ x: 0, y: 0, z: tiltOf(i, seq) * 0.5 });
  const tf = (q: { x: number; y: number; z: number }) => `rotateZ(${q.z}deg) rotateX(${q.x}deg) rotateY(${q.y}deg)`;

  /* 3D-кубик: половина ребра — 78 из 200 единиц клетки, скругление — 20 % */
  const CR = 78;
  const RHO = 0.2;
  const FLAT = 100 * (1 - RHO);
  /** Ещё не брошенный кубик повёрнут так, чтобы были видны три грани. */
  const IDLE = axisAngle(norm([1, 1, 0]), -0.5);
  const restView = (i: number, n: number, seq: number): M3 =>
    n ? view(restPose(n, (tiltOf(i, seq) * Math.PI) / 180)) : view(mul(IDLE, restPose(1 + (i % 3), (i % 2 ? 0.2 : -0.15))));
  /** Цвет грани по освещённости: светлая → основная → тёмная (ребро). */
  const faceFill = (sh: number) => {
    const t = 0.22 + 0.78 * sh;
    return t >= 0.5 ? `color-mix(in oklab, var(--face-a) ${Math.round((t - 0.5) * 200)}%, var(--face-b))` : `color-mix(in oklab, var(--face-b) ${Math.round(t * 200)}%, var(--edge))`;
  };

  /* ------------------------------- анимация ------------------------------- */

  let row = $state<HTMLElement>();
  let rolling = $state(false);
  /** Мелькающие грани многогранников, пока они крутятся. */
  let flick = $state<(number | null)[]>([]);
  let landed = $state(0);
  /** Повороты кубиков в полёте (null — лежит). */
  let mats = $state<(M3 | null)[]>([]);
  let raf = 0;
  let lastSeq = untrack(() => roll?.s ?? 0);
  let timers: ReturnType<typeof setTimeout>[] = [];
  let anims: Animation[] = [];

  const reduced = () => document.documentElement.hasAttribute("data-reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  $effect(() => {
    const r = roll;
    const seq = r?.s ?? 0;
    if (seq === lastSeq) return;
    lastSeq = seq;
    if (!r) return;
    untrack(() => throwDice(r));
  });
  $effect(() => () => stop());

  function stop() {
    for (const t of timers) clearTimeout(t);
    for (const a of anims) a.cancel();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    timers = [];
    anims = [];
    mats = [];
  }

  function throwDice(r: Roll) {
    stop();
    const el = row;
    landed++;
    if (!el || reduced()) {
      rolling = false;
      flick = [];
      return;
    }
    rolling = true;
    playSound("dice");
    const slots = [...el.querySelectorAll<HTMLElement>(".die-slot")];
    const n = Math.min(slots.length, r.v.length);
    let left = n;
    const fl: (number | null)[] = Array.from({ length: n }, () => null);
    type Job = { i: number; delay: number; dur: number; axis: V3; turn: number; spin: number; rest: M3 };
    const jobs: Job[] = [];
    slots.slice(0, n).forEach((slot, i) => {
      const rand = rng(r.s * 7919 + i * 104729 + idHash);
      const delay = i * 65 + rand() * 70;
      const dur = 980 + rand() * 360;
      // кубик падает на стол «из-под камеры»: сначала он выше и потому крупнее,
      // потом бьётся о стол, пару раз подпрыгивает и откатывается на место
      const dx = (rand() - 0.5) * 1.3 * die;
      const up = die * (0.3 + rand() * 0.22);
      const s0 = 1.26 + rand() * 0.12;
      const hop = slot.querySelector<HTMLElement>(".die-hop");
      const body = slot.querySelector<HTMLElement>(".die-body");
      const shadow = slot.querySelector<HTMLElement>(".die-shadow");
      if (!hop || !body || !shadow) return void left--;
      const fall = "cubic-bezier(.55,0,1,.45)";
      const rise = "cubic-bezier(0,.55,.45,1)";
      const opt = { duration: dur, delay, fill: "backwards" as const };
      const at = (x: number, y: number, sc: number) => `translate(${x}px, ${y}px) scale(${sc})`;
      const hopAnim = hop.animate(
        [
          { transform: at(dx, -up, s0), easing: fall },
          { transform: at(dx * 0.3, 0, 1), offset: 0.4, easing: rise },
          { transform: at(dx * 0.12, -up * 0.3, 1 + (s0 - 1) * 0.3), offset: 0.58, easing: fall },
          { transform: at(dx * 0.04, 0, 1), offset: 0.74, easing: rise },
          { transform: at(0, -up * 0.07, 1 + (s0 - 1) * 0.07), offset: 0.85, easing: fall },
          { transform: at(0, 0, 1) },
        ],
        opt,
      );
      anims.push(
        hopAnim,
        // тень лежит на столе прямо под кубиком: чем он выше, тем она меньше и бледнее
        shadow.animate(
          [
            { transform: `translateX(${dx}px) scale(0.45)`, opacity: 0.15 },
            { transform: `translateX(${dx * 0.3}px) scale(1)`, opacity: 1, offset: 0.4 },
            { transform: `translateX(${dx * 0.12}px) scale(0.8)`, opacity: 0.6, offset: 0.58 },
            { transform: `translateX(${dx * 0.04}px) scale(1)`, opacity: 1, offset: 0.74 },
            { transform: "translateX(0px) scale(0.96)", opacity: 0.92, offset: 0.85 },
            { transform: "translateX(0px) scale(1)", opacity: 1 },
          ],
          opt,
        ),
        // появление — на клетке: прозрачность на самом 3D-кубике «сплющила» бы его
        slot.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1 }], opt),
      );
      const sx = rand() < 0.5 ? -1 : 1;
      const sy = rand() < 0.5 ? -1 : 1;
      if (cube) {
        // катится по столу туда, куда летит: ось вращения — поперёк движения
        // (старт — (dx, up) в координатах стола, финиш — центр клетки)
        const axis: V3 = norm([-up, dx, (rand() - 0.5) * die * 0.5]);
        jobs.push({
          i,
          delay,
          dur: dur * 0.92,
          axis,
          turn: Math.PI * 2 * (1.4 + rand() * 0.9),
          spin: (rand() - 0.5) * Math.PI * 1.6,
          rest: restPose(r.v[i]!, (tiltOf(i, r.s) * Math.PI) / 180),
        });
      } else {
        // плоский многогранник крутится в основном «волчком» и покачивается,
        // но не встаёт ребром к зрителю — иначе он превращается в полоску
        const end = pose(i, r.s);
        const z0 = end.z - sy * (420 + rand() * 300);
        const ax = sx * (34 + rand() * 12);
        const ay = sy * (28 + rand() * 12);
        const ease = (t: number) => 1 - (1 - t) ** 3;
        const keys = [0, 0.22, 0.45, 0.68, 0.86, 1].map((t, j) => {
          const w = [1, -0.75, 0.45, -0.2, 0.06, 0][j]!;
          return { offset: t, transform: tf({ x: end.x + ax * w, y: end.y + ay * w, z: z0 + (end.z - z0) * ease(t) }) };
        });
        anims.push(body.animate(keys, { duration: dur * 0.9, delay, fill: "backwards" }));
      }
      hopAnim.onfinish = () => {
        if (--left <= 0) {
          rolling = false;
          flick = [];
        }
      };
      // у многогранников грани мелькают, пока те крутятся
      if (!cube) {
        const until = delay + dur * 0.62;
        const tick = (t: number) => {
          if (t >= until) {
            fl[i] = null;
            flick = [...fl];
            return;
          }
          fl[i] = randInt(sides);
          flick = [...fl];
          timers.push(setTimeout(() => tick(t + 75), 75));
        };
        timers.push(setTimeout(() => tick(delay), delay));
      }
    });
    if (left <= 0) rolling = false;
    // 3D-кубики поворачиваем покадрово: остаток поворота тает к нулю,
    // и в конце кубик ровно в позе «лёжа» — той же, что рисуется без анимации
    if (jobs.length) {
      const t0 = performance.now();
      const frame = (now: number) => {
        let live = false;
        const next: (M3 | null)[] = [];
        for (const j of jobs) {
          const t = Math.min(1, Math.max(0, (now - t0 - j.delay) / j.dur));
          if (t < 1) live = true;
          const k = (1 - t) ** 3;
          next[j.i] = t >= 1 ? null : view(mul(axisAngle(j.axis, j.turn * k), mul(rotZ(j.spin * k), j.rest)));
        }
        mats = next;
        raf = live ? requestAnimationFrame(frame) : 0;
      };
      frame(t0);
    }
  }

  function go(e: MouseEvent) {
    e.stopPropagation();
    rollDice(b, [v.id]);
  }

  /* ------------------------------- многогранники ------------------------------- */

  const SHAPES: Record<string, { o: string; f?: string }> = {
    d2: { o: "circle" },
    d4: { o: "50,5 96,88 4,88", f: "M50 5 50 62M96 88 50 62M4 88 50 62" },
    d8: { o: "50,3 96,50 50,97 4,50", f: "M4 50H96M50 3 28 50 50 97 72 50Z" },
    d10: { o: "50,3 95,40 50,97 5,40", f: "M5 40 50 58 95 40M50 58V97M50 3 30 47M50 3 70 47" },
    d12: { o: "50,4 96,38 78,94 22,94 4,38", f: "M50 22 74 40 65 70H35L26 40ZM50 4V22M96 38 74 40M78 94 65 70M22 94 35 70M4 38 26 40" },
    d20: { o: "50,3 93,27 93,73 50,97 7,73 7,27", f: "M50 22 78 70H22ZM50 3V22M93 27 78 70M93 27 50 22M7 27 50 22M7 27 22 70M93 73 78 70M7 73 22 70M50 97 78 70M50 97 22 70" },
    dn: { o: "50,3 83,14 97,46 88,80 58,97 24,92 5,66 6,30 26,8", f: "M50 26 74 42 66 70H36L26 42Z" },
  };
  const shapeKey = $derived(sides === 2 ? "d2" : sides === 4 ? "d4" : sides === 8 ? "d8" : sides === 10 ? "d10" : sides === 12 ? "d12" : sides === 20 ? "d20" : "dn");
  const shape = $derived(SHAPES[shapeKey]!);
  /** Где на многограннике встаёт число (у треугольника — ниже середины). */
  const textY = $derived(shapeKey === "d4" ? 62 : shapeKey === "d10" ? 46 : 52);

  const label = (n: number | null | undefined) => (n ? faceLabel(p, n) : "?");
  const fontFor = (t: string) => (t.length <= 2 ? 0.38 : t.length <= 3 ? 0.3 : t.length <= 5 ? 0.22 : 0.16);
  const isMax = (i: number, n: number) => !rolling && !custom && sides >= 4 && n === sides && kept.has(i);
  const isMin = (i: number, n: number) => !rolling && !custom && sides >= 10 && n === 1 && kept.has(i);
</script>

<div class="card dice-card look-{look}" class:nocolor={!p.color || p.color === "default"} class:rolling style:--k={k} style:--die="{die}px" style:--gap="{gap + spread}px" style:--pad="{spread / 2}px">
  <button class="dice-row" bind:this={row} style:--cols={perRow} data-ui disabled={b.readonly} aria-label="Бросить кубики" onclick={go}>
    {#each Array.from({ length: count }, (_, i) => i) as i (i)}
      {@const n = vals[i] ?? 0}
      {@const q = pose(i, roll?.s ?? 0)}
      <span class="die-slot" class:max={isMax(i, n)} class:min={isMin(i, n)} class:dropped={!rolling && !!roll && !kept.has(i)}>
        <span class="die-shadow"></span>
        <span class="die-hop">
          {#if cube}
            {@const fr = cubeFrame(mats[i] ?? restView(i, n, roll?.s ?? 0), CR, RHO)}
            {@const gid = `dg-${v.id}-${i}`}
            <span class="die-body cube" class:blank={!n}>
              <svg viewBox="-100 -100 200 200" aria-hidden="true">
                <defs>
                  <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="-80" y1="-100" x2="80" y2="100">
                    <stop offset="0" style:stop-color="var(--face-a)" />
                    <stop offset="0.5" style:stop-color="var(--face-b)" />
                    <stop offset="1" style:stop-color="var(--edge)" />
                  </linearGradient>
                </defs>
                <polygon class="c-rim" points={fr.hull} stroke-width={RHO * CR * 2 + 3} />
                <polygon class="c-body" points={fr.hull} stroke-width={RHO * CR * 2} fill="url(#{gid})" stroke="url(#{gid})" />
                {#each fr.faces as fc (fc.f)}
                  <g transform={fc.m}>
                    <rect class="c-face" x={-FLAT} y={-FLAT} width={FLAT * 2} height={FLAT * 2} rx="13" style:fill={faceFill(fc.shade)} />
                    {#if custom}
                      <text class="c-num" style:font-size="{fontFor(label(fc.f)) * 230}px">{label(fc.f)}</text>
                    {:else}
                      {#each PIPS[fc.f] ?? [] as j (j)}
                        {@const xy = pipXY(j)}
                        <circle class="c-pip" class:one={fc.f === 1} cx={xy[0]} cy={xy[1]} r={fc.f === 1 ? 21 : 14.5} />
                      {/each}
                    {/if}
                  </g>
                {/each}
              </svg>
            </span>
          {:else}
            {@const t = label(flick[i] ?? (n || null))}
            <span class="die-body poly {shapeKey}" style:transform={tf(q)}>
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <defs>
                  <linearGradient id="dg-{v.id}-{i}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" style:stop-color="var(--face-a)" />
                    <stop offset="1" style:stop-color="var(--face-b)" />
                  </linearGradient>
                </defs>
                {#if shape.o === "circle"}
                  <circle class="ps" fill="url(#dg-{v.id}-{i})" cx="50" cy="50" r="46" />
                  <circle class="pf" cx="50" cy="50" r="36" />
                {:else}
                  <polygon class="ps" fill="url(#dg-{v.id}-{i})" points={shape.o} />
                  {#if shape.f}<path class="pf" d={shape.f} />{/if}
                {/if}
                <text x="50" y={textY} style:font-size="{fontFor(t) * 100}px">{t}</text>
              </svg>
            </span>
          {/if}
        </span>
      </span>
    {/each}
  </button>
  <div class="dice-info" aria-live="polite">
    {#if roll && !rolling}
      {#key landed}<b class="dice-sum">{total}</b>{/key}
      <span class="dice-f">{diceFormula(p)}</span> · <span class="dice-who" style:color={roll.c}>{roll.n}</span>
    {:else if rolling}
      <span class="dice-f">Бросок…</span>
    {:else}
      <span class="dice-f">{diceFormula(p)} · бросок по щелчку</span>
    {/if}
  </div>
  {#if hist.length}
    <div class="dice-hist" title="Прошлые броски">
      {#each hist as h, j (j)}
        <span style:--hc={h.c} title={h.n}>{diceTotal(p, h.v)}</span>
      {/each}
    </div>
  {/if}
</div>
