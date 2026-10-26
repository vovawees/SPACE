<script lang="ts">
  /* Место под редактор CodeMirror. Сам редактор грузится лениво; пока
     он грузится, виден исходный текст — без мигания пустотой. */
  import { onMount, tick, untrack } from "svelte";
  import { useBoard } from "../board.svelte.ts";
  import type { EditorMode, TextEditor } from "../editor.ts";
  import type { NodeView } from "../store.svelte.ts";

  interface Props {
    v: NodeView;
    mode: EditorMode;
    lang?: string;
    wrap?: boolean;
    placeholder?: string;
  }
  let { v, mode, lang, wrap = true, placeholder = "" }: Props = $props();
  const b = useBoard();
  let el: HTMLDivElement;
  let ed = $state.raw<TextEditor | null>(null);
  let raw = $state(true);

  onMount(() => {
    let dead = false;
    const at = b.ix.editAt;
    const opts = untrack(() => ({ lang, wrap, placeholder, mode }));
    import("../editor.ts")
      .then(async ({ TextEditor }) => {
        if (dead || !v.text) return;
        // сначала убрать временный текст: иначе редактор встанет под ним
        // и щелчок попадёт не в ту строку
        raw = false;
        await tick();
        if (dead) return;
        ed = new TextEditor({
          parent: el,
          text: v.text,
          awareness: b.provider.awareness,
          undo: b.view.undo,
          mode: opts.mode,
          lang: opts.lang,
          wrap: opts.wrap,
          placeholder: opts.placeholder,
          at,
          onExit: () => b.ix.stopEditing(),
        });
      })
      .catch(() => b.ix.stopEditing());
    return () => {
      dead = true;
      ed?.destroy();
      ed = null;
      b.provider.awareness?.setLocalStateField("cursor", null);
    };
  });

  let lastLang = untrack(() => lang);
  $effect(() => {
    const l = lang;
    if (!ed || l === lastLang) return;
    lastLang = l;
    void ed.setLang(l);
  });
  let lastWrap = untrack(() => wrap);
  $effect(() => {
    const w = wrap;
    if (!ed || w === lastWrap) return;
    lastWrap = w;
    ed.setWrap(w);
  });
</script>

<div class="editor-host" bind:this={el} data-ui>
  {#if raw}<pre class="editor-raw">{v.textValue || " "}</pre>{/if}
</div>
