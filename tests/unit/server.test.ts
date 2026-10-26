/* API сервера целиком в памяти процесса: app.request() без сети. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "space-unit-"));
process.env.NODE_ENV = "test";
const { app } = await import("../../src/server/app.ts");

class Client {
  cookie = "";
  async req(method: string, url: string, body?: unknown, raw?: Uint8Array, headers: Record<string, string> = { "x-space": "1" }) {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (raw) {
      h["content-type"] = "application/octet-stream";
      payload = raw as unknown as BodyInit;
    } else if (body !== undefined) {
      h["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const r = await app.request(url, { method, headers: h, body: payload });
    const set = r.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return r;
  }
  async json<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
    const r = await this.req(method, url, body);
    return { status: r.status, data: (await r.json().catch(() => null)) as T };
  }
  static async guest(name: string) {
    const c = new Client();
    const r = await c.json("POST", "/api/auth/guest", { name, color: "#5b9cf0" });
    expect(r.status).toBe(200);
    return c;
  }
}

describe("API", () => {
  it("без входа — 401, без заголовка x-space — отказ", async () => {
    const anon = new Client();
    expect((await anon.req("GET", "/api/boards")).status).toBe(401);
    const r = await anon.req("POST", "/api/auth/guest", { name: "X", color: "#5b9cf0" }, undefined, {});
    expect(r.status).toBe(403);
  });

  it("доска: создание, список, доступ по ссылке и роли", async () => {
    const anna = await Client.guest("Аня");
    const { data: board } = await anna.json("POST", "/api/boards", { title: "План" });
    expect(board.role).toBe("owner");
    const list = await anna.json<any[]>("GET", "/api/boards");
    expect(list.data.map((b) => b.id)).toContain(board.id);

    // по ссылке с правом правки — сразу редактор
    await anna.json("PATCH", `/api/boards/${board.id}`, { linkAccess: "edit" });
    const borya = await Client.guest("Боря");
    const joined = await borya.json("GET", `/api/boards/${board.id}`);
    expect(joined.status).toBe(200);
    expect(joined.data.role).toBe("editor");
    expect((await borya.json("PATCH", `/api/boards/${board.id}`, { linkAccess: "view" })).status).toBe(403);

    // ссылка закрыта: новый человек не войдёт, участник — да
    await anna.json("PATCH", `/api/boards/${board.id}`, { linkAccess: "none" });
    const vika = await Client.guest("Вика");
    expect((await vika.json("GET", `/api/boards/${board.id}`)).status).toBe(403);
    expect((await borya.json("GET", `/api/boards/${board.id}`)).status).toBe(200);

    // понизить до зрителя — переименовать нельзя
    const me = await borya.json("GET", "/api/me");
    const members = await anna.json<any[]>("PATCH", `/api/boards/${board.id}/members/${me.data.id}`, { role: "viewer" });
    expect(members.data.find((m) => m.id === me.data.id)?.role).toBe("viewer");
    expect((await borya.json("PATCH", `/api/boards/${board.id}`, { title: "Взлом" })).status).toBe(403);
    expect((await anna.json("PATCH", `/api/boards/${board.id}`, { title: "План Б" })).data.title).toBe("План Б");

    // удалить может только владелец; участник — только покинуть
    expect((await borya.json("DELETE", `/api/boards/${board.id}`)).status).toBe(200);
    expect((await borya.json<any[]>("GET", "/api/boards")).data.some((b) => b.id === board.id)).toBe(false);
    expect((await anna.json("DELETE", `/api/boards/${board.id}`)).status).toBe(200);
    expect((await anna.json("GET", `/api/boards/${board.id}`)).status).toBe(404);
  });

  it("импорт, экспорт и история версий", async () => {
    const anna = await Client.guest("Аня");
    const doc = new Y.Doc();
    const node = new Y.Map<unknown>();
    doc.transact(() => {
      doc.getMap("meta").set("title", "Из файла");
      node.set("type", "note");
      node.set("x", 10);
      node.set("y", 20);
      node.set("w", 240);
      node.set("h", 120);
      node.set("z", "a0");
      node.set("text", new Y.Text("Привет"));
      doc.getMap("nodes").set("n1", node);
    });
    const r = await anna.req("POST", "/api/boards/import", undefined, Y.encodeStateAsUpdate(doc));
    const board = (await r.json()) as { id: string; title: string };
    expect(board.title).toBe("Из файла");

    const exp = await anna.req("GET", `/api/boards/${board.id}/export`);
    const back = new Y.Doc();
    Y.applyUpdate(back, new Uint8Array(await exp.arrayBuffer()));
    const n1 = back.getMap<Y.Map<unknown>>("nodes").get("n1")!;
    expect(String(n1.get("text"))).toBe("Привет");

    const snap = await anna.json("POST", `/api/boards/${board.id}/history`, { label: "Начало" });
    expect(snap.status).toBe(200);
    const hist = await anna.json<any[]>("GET", `/api/boards/${board.id}/history`);
    expect(hist.data.some((s) => s.label === "Начало")).toBe(true);
    const restored = await anna.json("POST", `/api/boards/${board.id}/history/${snap.data.id}/restore`, {});
    expect(restored.status).toBe(200);
    const fork = await anna.json("POST", `/api/boards/${board.id}/history/${snap.data.id}/fork`, {});
    expect(fork.data.title).toContain("из истории");
  });

  it("мусор вместо файла доски — понятная ошибка", async () => {
    const anna = await Client.guest("Аня");
    const r = await anna.req("POST", "/api/boards/import", undefined, new Uint8Array([1, 2, 3, 4, 5]));
    expect(r.status).toBe(400);
  });
});
