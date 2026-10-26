/* Подсветка кода на lezer — те же классы tok-*, что и в редакторе, поэтому
   код выглядит одинаково при чтении и правке. Модуль грузится лениво
   (из text.svelte.ts и editor.ts). */
import { LanguageDescription, type Language } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightCode } from "@lezer/highlight";

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  rs: "rust",
  kt: "kotlin",
  ps1: "powershell",
  htm: "html",
  svg: "xml",
  tex: "latex",
  docker: "dockerfile",
};

const loaded = new Map<string, Language | null>();
const loading = new Set<string>();

/** Имя в @codemirror/language-data, если отличается от нашего id. */
const NAMES: Record<string, string> = {
  latex: "stex",
  csharp: "c#",
  objc: "objective-c",
  fsharp: "f#",
  vbnet: "vb.net",
  asm: "gas",
  ini: "properties files",
  lisp: "common lisp",
  protobuf: "protobuf",
  wasm: "webassembly",
  gdscript: "python",
  glsl: "c",
  luau: "lua",
  groovy: "groovy",
};

function describe(lang: string): LanguageDescription | null {
  const name = ALIASES[lang] ?? lang;
  return LanguageDescription.matchLanguageName(languages, NAMES[name] ?? name, true);
}

/** Парсер языка, если уже загружен; иначе начинает загрузку (onLoad — по готовности). */
function languageFor(key: string, onLoad: () => void): Language | null {
  if (loaded.has(key)) return loaded.get(key) ?? null;
  if (!loading.has(key)) {
    loading.add(key);
    const desc = describe(key);
    if (!desc) {
      loaded.set(key, null);
    } else {
      void desc
        .load()
        .then((support) => {
          loaded.set(key, support.language);
          onLoad();
        })
        .catch(() => loaded.set(key, null));
    }
  }
  return null;
}

export function loadLanguageSupport(lang: string | undefined) {
  const desc = lang ? describe(lang.toLowerCase()) : null;
  return desc ? desc.load() : Promise.resolve(null);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML с подсветкой или null, если язык неизвестен/ещё грузится. */
export function highlight(code: string, key: string, onLoad: () => void): string | null {
  const language = languageFor(key, onLoad);
  if (!language) return null;
  let out = "";
  try {
    highlightCode(
      code,
      language.parser.parse(code),
      classHighlighter,
      (text, classes) => {
        out += classes ? `<span class="${classes}">${esc(text)}</span>` : esc(text);
      },
      () => (out += "\n"),
    );
  } catch {
    return null;
  }
  return out;
}
