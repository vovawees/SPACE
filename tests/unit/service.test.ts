import { describe, expect, it } from "vitest";
import { desktopArg, desktopFile, unitArg, unitFile, unitPathValue } from "../../scripts/service.ts";

describe("служба Linux: экранирование путей", () => {
  it("ExecStart: пробелы и кириллица в кавычках, %, $, \\ и кавычки экранированы", () => {
    expect(unitArg("/home/вова/Рабочий стол/node")).toBe('"/home/вова/Рабочий стол/node"');
    expect(unitArg("/a/100%/b")).toBe('"/a/100%%/b"');
    expect(unitArg("/a/$HOME/b")).toBe('"/a/$$HOME/b"');
    expect(unitArg('/a/"q"\\b')).toBe('"/a/\\"q\\"\\\\b"');
  });

  it("WorkingDirectory: только %", () => {
    expect(unitPathValue("/home/u/Рабочий стол/space 100%")).toBe("/home/u/Рабочий стол/space 100%%");
  });

  it(".desktop Exec: двойное экранирование и %%", () => {
    expect(desktopArg("/home/u/Рабочий стол/node")).toBe('"/home/u/Рабочий стол/node"');
    expect(desktopArg("/a/$x/`y`/50%")).toBe('"/a/\\\\$x/\\\\`y\\\\`/50%%"');
    expect(desktopArg("/a\\b")).toBe('"/a\\\\\\\\b"');
  });

  it("перевод строки в пути — ошибка, а не сломанный файл", () => {
    expect(() => unitArg("/a\nb")).toThrow();
    expect(() => desktopArg("/a\rb")).toThrow();
  });

  it("файлы службы и ярлыка", () => {
    const unit = unitFile("/usr/bin/node", "/home/u/Рабочий стол/space");
    expect(unit).toContain('ExecStart="/usr/bin/node" --disable-warning=ExperimentalWarning "/home/u/Рабочий стол/space/src/server/index.ts"');
    expect(unit).toContain("WorkingDirectory=/home/u/Рабочий стол/space\n");
    expect(unit).toContain("RestartPreventExitStatus=78");
    expect(unit).toContain("WantedBy=default.target");
    const desk = desktopFile("/usr/bin/node", "/home/u/space");
    expect(desk).toContain('Exec="/usr/bin/node" --disable-warning=ExperimentalWarning "/home/u/space/scripts/service.ts" open');
    expect(desk).toContain("Icon=space-board");
  });
});
