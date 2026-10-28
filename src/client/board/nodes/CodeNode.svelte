<script lang="ts">
  /* Блок кода: подсветка, язык, копирование и «результат» для
     Markdown / HTML / LaTeX / SVG. */
  import Check from "@lucide/svelte/icons/check";
  import CodeXml from "@lucide/svelte/icons/code-xml";
  import Copy from "@lucide/svelte/icons/copy";
  import Eye from "@lucide/svelte/icons/eye";
  import Play from "@lucide/svelte/icons/play";
  import Square from "@lucide/svelte/icons/square";
  import X from "@lucide/svelte/icons/x";
  import { toasts } from "../../lib/toast.svelte.ts";
  import { copyText } from "../../lib/util.ts";
  import { menu } from "../../ui/menu.svelte.ts";
  import { tip } from "../../ui/tooltip.ts";
  import { useBoard } from "../board.svelte.ts";
  import { langLabel, PREVIEW_LANGS } from "../model.ts";
  import { langItems } from "../menus.ts";
  import { assets, renderMath } from "../text.svelte.ts";
  import EditorHost from "../ui/EditorHost.svelte";
  import { highlightOf, markdownOf } from "./cache.ts";
  import { RUN_LANGS, runTime, runs } from "../run.svelte.ts";
  import type { NodeCompProps } from "./types.ts";

  let { v, editing }: NodeCompProps = $props();
  const b = useBoard();
  const lang = $derived(v.props.lang || "text");
  const wrap = $derived(v.props.wrap !== false);
  const canPreview = $derived(PREVIEW_LANGS.has(lang));
  const preview = $derived(!editing && canPreview && v.props.view === "preview");
  const src = $derived(preview ? v.textValue : "");
  const svg = $derived(preview && lang === "xml" && /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?<svg[\s>]/i.test(src));
  const latex = $derived.by(() => {
    void assets.rev;
    if (!preview || lang !== "latex") return "";
    const t = src.trim().replace(/^\$\$([\s\S]*)\$\$$/, "$1").replace(/^\\\[([\s\S]*)\\\]$/, "$1");
    return renderMath(t, true);
  });
  const code = $derived(editing || (preview && lang !== "xml") || svg ? "" : highlightOf(v, lang));
  let copied = $state(false);
  const canRun = $derived(RUN_LANGS.has(lang));
  const out = $derived(runs.state.get(v.id));

  function run(e?: MouseEvent) {
    e?.stopPropagation();
    if (out?.running) runs.stop(v.id, true);
    else runs.run(v.id, v.textValue);
  }

  // сменили язык или удалили блок — вывод больше не нужен
  $effect(() => {
    if (!canRun) runs.stop(v.id);
  });
  $effect(() => () => runs.stop(v.id));

  function pickLang(e: MouseEvent) {
    if (b.readonly) return;
    menu.dropdown(
      e.currentTarget as HTMLElement,
      langItems(lang, (id) => b.view.update(v.id, { lang: id })),
    );
  }

  function toggleView() {
    b.view.update(v.id, { view: preview ? "code" : "preview" });
  }

  async function copy() {
    if (await copyText(v.textValue)) {
      copied = true;
      setTimeout(() => (copied = false), 1400);
    } else toasts.show("Не удалось скопировать", { kind: "error" });
  }
</script>

<div class="card code-card">
  <div class="code-head">
    <button class="lang" data-ui onclick={pickLang} {@attach tip(b.readonly ? langLabel(lang) : "Язык")}>{langLabel(lang)}</button>
    <span class="title">{v.props.title ?? ""}</span>
    {#if canRun}
      <button class="icon-btn run" class:on={out?.running} data-ui onclick={run} {@attach tip(out?.running ? "Остановить" : "Запустить", "Shift+Enter")}>
        {#if out?.running}<Square size={13} fill="currentColor" />{:else}<Play size={15} />{/if}
      </button>
    {/if}
    {#if canPreview}
      <button class="icon-btn" data-ui onclick={toggleView} disabled={b.readonly} {@attach tip(preview ? "Показать код" : "Показать результат")}>
        {#if preview}<CodeXml size={15} />{:else}<Eye size={15} />{/if}
      </button>
    {/if}
    <button class="icon-btn" data-ui onclick={copy} {@attach tip("Копировать")}>
      {#if copied}<Check size={15} />{:else}<Copy size={15} />{/if}
    </button>
  </div>
  {#if editing}
    <div class="code-body" class:wrap>
      <EditorHost {v} mode="code" {lang} {wrap} placeholder="// код" />
    </div>
  {:else if preview && lang === "markdown"}
    <div class="code-preview md scroll" data-scroll>{@html markdownOf(v)}</div>
  {:else if preview && lang === "html"}
    <div class="code-preview frame">
      <iframe title="Результат HTML" sandbox="allow-scripts allow-forms allow-modals allow-popups" srcdoc={src}></iframe>
    </div>
  {:else if preview && lang === "latex"}
    <div class="code-preview latex scroll" data-scroll>{@html latex}</div>
  {:else if svg}
    <div class="code-preview svg">
      <img alt="SVG" draggable="false" src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(src)} />
    </div>
  {:else}
    <pre class="code-body scroll" class:wrap data-scroll>{@html code || " "}</pre>
  {/if}
  {#if out}
    <div class="code-out scroll" data-scroll data-ui>
      <div class="code-out-head">
        <span class="code-out-state {out.running ? 'running' : (out.end ?? 'ok')}">
          <i></i>{out.running ? "Выполняется…" : out.end === "error" ? "Ошибка" : out.end === "stopped" ? "Остановлено" : "Готово"}
          {#if !out.running && out.ms !== undefined}<em>{runTime(out.ms)}</em>{/if}
        </span>
        <button class="icon-btn" data-ui onclick={(e) => (e.stopPropagation(), runs.stop(v.id))} aria-label="Закрыть вывод"><X size={13} /></button>
      </div>
      {#each out.lines as l, i (i)}
        <div class="code-line {l.k}">{#if l.k === "result"}<b>←</b>{/if}{l.t}</div>
      {:else}
        {#if !out.running}<div class="code-line muted">Нет вывода — используйте console.log()</div>{/if}
      {/each}
    </div>
  {/if}
</div>
