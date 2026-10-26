/* Редактор текста на CodeMirror 6 + совместный ввод через y-codemirror.
   Загружается лениво — при первом двойном щелчке по тексту. */
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { drawSelection, EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
import { classHighlighter } from "@lezer/highlight";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";
import type * as Y from "yjs";
import { loadLanguageSupport } from "./highlight.ts";

export type EditorMode = "markdown" | "code" | "plain";

export interface EditorOptions {
  parent: HTMLElement;
  text: Y.Text;
  awareness: unknown;
  undo: Y.UndoManager;
  mode: EditorMode;
  lang?: string;
  wrap?: boolean;
  placeholder?: string;
  /** Где поставить курсор: экранная точка двойного щелчка или «в конец». */
  at?: { x: number; y: number } | "end" | "all";
  onExit: () => void;
  onTab?: () => void;
}

const theme = EditorView.theme({
  "&": { background: "transparent", color: "inherit", fontSize: "inherit", height: "100%" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "visible" },
  ".cm-content": { padding: "0", caretColor: "var(--accent)", minHeight: "1.5em" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    background: "color-mix(in oklab, var(--accent) 30%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--ink-3)" },
  ".cm-ySelectionInfo": {
    fontFamily: "var(--font-ui)",
    fontSize: "11px",
    fontWeight: "600",
    padding: "1px 5px",
    borderRadius: "4px 4px 4px 0",
    top: "-1.35em",
    opacity: "1",
    color: "#111",
  },
  ".cm-matchingBracket": { background: "var(--hover)", outline: "1px solid var(--line-3)" },
  ".cm-searchMatch": { background: "color-mix(in oklab, var(--c-yellow) 30%, transparent)" },
  ".cm-panels": { display: "none" },
});

export class TextEditor {
  view: EditorView;
  private lang = new Compartment();
  private wrapping = new Compartment();
  private mode: EditorMode;

  constructor(o: EditorOptions) {
    this.mode = o.mode;
    const exit = () => {
      o.onExit();
      return true;
    };
    const base: Extension[] = [
      theme,
      drawSelection(),
      syntaxHighlighting(classHighlighter),
      yCollab(o.text, o.awareness, { undoManager: o.undo }),
      keymap.of([
        { key: "Escape", run: exit },
        { key: "Mod-Enter", run: exit },
        ...yUndoManagerKeymap,
        ...closeBracketsKeymap,
        ...searchKeymap.filter((k) => k.key !== "Mod-f"),
        ...(o.mode === "code" ? [indentWithTab] : []),
        ...defaultKeymap,
      ]),
      this.wrapping.of(o.wrap === false ? [] : EditorView.lineWrapping),
      EditorView.contentAttributes.of({ spellcheck: o.mode === "code" ? "false" : "true", autocapitalize: "sentences" }),
      cmPlaceholder(o.placeholder ?? ""),
    ];
    if (o.mode === "code") {
      base.push(indentUnit.of("  "), indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), this.lang.of([]));
    } else if (o.mode === "markdown") {
      base.push(markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }), closeBrackets());
    }
    this.view = new EditorView({
      parent: o.parent,
      state: EditorState.create({ doc: o.text.toString(), extensions: base }),
    });
    if (o.mode === "code") void this.setLang(o.lang);
    this.place(o.at);
  }

  place(at: EditorOptions["at"]) {
    const v = this.view;
    v.focus();
    if (at === "all") {
      v.dispatch({ selection: EditorSelection.single(0, v.state.doc.length) });
    } else if (at && at !== "end") {
      const pos = v.posAtCoords(at, false);
      v.dispatch({ selection: EditorSelection.cursor(pos ?? v.state.doc.length) });
    } else {
      v.dispatch({ selection: EditorSelection.cursor(v.state.doc.length) });
    }
  }

  async setLang(lang: string | undefined) {
    if (this.mode !== "code") return;
    const support = await loadLanguageSupport(lang).catch(() => null);
    this.view.dispatch({ effects: this.lang.reconfigure(support ?? []) });
  }

  setWrap(wrap: boolean) {
    this.view.dispatch({ effects: this.wrapping.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }

  destroy() {
    this.view.destroy();
  }
}
