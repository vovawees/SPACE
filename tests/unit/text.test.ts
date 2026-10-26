import { describe, expect, it } from "vitest";
import { firstLine, renderMarkdown, toggleTaskLine } from "../../src/client/board/text.svelte.ts";

describe("текст заметок", () => {
  it("флажки задач переключаются в исходнике", () => {
    const src = "Список\n- [ ] купить\n- [x] сделано";
    expect(toggleTaskLine(src, 1)).toBe("Список\n- [x] купить\n- [x] сделано");
    expect(toggleTaskLine(src, 2)).toBe("Список\n- [ ] купить\n- [ ] сделано");
    expect(toggleTaskLine(src, 0)).toBeNull();
  });

  it("первая строка без разметки", () => {
    expect(firstLine("\n\n## **Заголовок** доски\nещё")).toBe("Заголовок доски");
    expect(firstLine("- [ ] дело")).toBe("дело");
  });

  it("Markdown: ссылки наружу, задачи, деньги не формулы", () => {
    const html = renderMarkdown("Смотри https://example.com\n\n- [x] готово\n\nЦена $5 и $10");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).not.toContain("math");
  });

  it("HTML в тексте экранируется", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
