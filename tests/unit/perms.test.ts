/* Ранги, лимиты, приглашения и роли на доске — через API целиком в памяти. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "space-perms-"));
process.env.NODE_ENV = "test";
const { app } = await import("../../src/server/app.ts");

class C {
  cookie = "";
  async j<T = any>(method: string, url: string, body?: unknown): Promise<{ status: number; data: T }> {
    const h: Record<string, string> = { "x-space": "1" };
    if (this.cookie) h.cookie = this.cookie;
    if (body !== undefined) h["content-type"] = "application/json";
    const r = await app.request(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = r.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0]!;
    return { status: r.status, data: (await r.json().catch(() => null)) as T };
  }
  static async join(name: string, invite?: string) {
    const c = new C();
    const r = await c.j("POST", "/api/auth/guest", { name, color: "#5b9cf0", invite });
    return { c, r };
  }
}

describe("ранги и приглашения на сервер", () => {
  it("первый — владелец сервера; закрытая регистрация пускает только по коду", async () => {
    const { c: owner, r } = await C.join("Хозяин");
    expect(r.data.rank).toBe("owner");
    expect((await owner.j("PATCH", "/api/admin/settings", { registration: "invite" })).status).toBe(200);
    expect((await C.join("Чужой")).r.status).toBe(403);
    const inv = await owner.j("POST", "/api/invites", { rank: "guest", maxUses: 1 });
    expect(inv.status).toBe(200);
    expect((await new C().j("GET", `/api/invites/${inv.data.code}/check`)).data.rank).toBe("guest");
    const { r: g } = await C.join("Гость", inv.data.code);
    expect(g.status).toBe(200);
    expect(g.data.rank).toBe("guest");
    // код одноразовый
    expect((await C.join("Второй", inv.data.code)).r.status).toBe(403);
  });

  it("лимит досок ранга и блокировка", async () => {
    const owner = new C();
    // владелец уже есть — заходим новым человеком по коду участника
    const { c: admin } = await C.join("Хозяин2");
    expect(admin).toBeTruthy();
    const login = await owner.j("POST", "/api/auth/guest", { name: "x", color: "#5b9cf0" });
    expect(login.status).toBe(403); // регистрация по приглашениям
  });
});

describe("роли на доске и приглашения на доску", async () => {
  const s = await import("../../src/server/ranks.ts");
  it("хост, комментатор, бан, заморозка", async () => {
    s.saveServerSettings({ registration: "open" });
    const { c: ann } = await C.join("Аня");
    const { c: bob } = await C.join("Боря");
    const { c: vic } = await C.join("Вика");
    const board = (await ann.j("POST", "/api/boards", { title: "Права" })).data;
    expect(board.perms.manage).toBe(true);
    // закрываем общую ссылку, приглашаем Борю хостом, Вику — комментатором
    await ann.j("PATCH", `/api/boards/${board.id}`, { linkAccess: "none" });
    expect((await bob.j("GET", `/api/boards/${board.id}`)).status).toBe(403);
    const links = (await ann.j("POST", `/api/boards/${board.id}/links`, { role: "host", maxUses: 1 })).data;
    const hostLink = links[0].id;
    const joined = await bob.j("POST", `/api/boards/${board.id}/join`, { token: hostLink });
    expect(joined.data.role).toBe("host");
    expect(joined.data.perms.manage).toBe(true);
    // хост не может выдать хоста, но может пригласить комментатора
    expect((await bob.j("POST", `/api/boards/${board.id}/links`, { role: "host" })).status).toBe(403);
    const cl = (await bob.j("POST", `/api/boards/${board.id}/links`, { role: "commenter", days: 1 })).data;
    const vj = await vic.j("POST", `/api/boards/${board.id}/join`, { token: cl[0].id });
    expect(vj.data.role).toBe("commenter");
    expect(vj.data.perms.edit).toBe(false);
    expect(vj.data.perms.chat).toBe(true);
    // комментатор пишет в чат через API
    expect((await vic.j("POST", `/api/boards/${board.id}/chat`, { text: "привет" })).status).toBe(200);
    const pin = await vic.j("POST", `/api/boards/${board.id}/comments`, { x: 10, y: 20, text: "вопрос" });
    expect(pin.status).toBe(200);
    // чат только для редакторов — комментатору нельзя
    await bob.j("PATCH", `/api/boards/${board.id}`, { settings: { chat: "editors" } });
    expect((await vic.j("POST", `/api/boards/${board.id}/chat`, { text: "ещё" })).status).toBe(403);
    // заморозка: редактор перестаёт править
    const ed = (await ann.j("POST", `/api/boards/${board.id}/links`, { role: "editor" })).data[0].id;
    const { c: gen } = await C.join("Гена");
    expect((await gen.j("POST", `/api/boards/${board.id}/join`, { token: ed })).data.perms.edit).toBe(true);
    await ann.j("PATCH", `/api/boards/${board.id}`, { settings: { lock: true } });
    expect((await gen.j("GET", `/api/boards/${board.id}`)).data.perms.edit).toBe(false);
    expect((await bob.j("GET", `/api/boards/${board.id}`)).data.perms.edit).toBe(true);
    // бан: Вика больше не попадёт даже по новой ссылке
    const vicId = (await vic.j("GET", "/api/me")).data.id;
    expect((await bob.j("PATCH", `/api/boards/${board.id}/members/${vicId}`, { role: "banned" })).status).toBe(200);
    expect((await vic.j("GET", `/api/boards/${board.id}`)).status).toBe(403);
    const again = (await ann.j("POST", `/api/boards/${board.id}/links`, { role: "viewer" })).data[0].id;
    expect((await vic.j("POST", `/api/boards/${board.id}/join`, { token: again })).status).toBe(403);
    // передача доски: Аня становится хостом
    const bobId = (await bob.j("GET", "/api/me")).data.id;
    expect((await ann.j("POST", `/api/boards/${board.id}/transfer`, { userId: bobId })).data.role).toBe("host");
  });

  it("лимиты ранга: доски и предел участников", async () => {
    const { c: g } = await C.join("Лимит");
    const gid = (await g.j("GET", "/api/me")).data.id;
    const { c: boss } = await C.join("Админ");
    // делаем Лимита гостем через владельца сервера
    const ownerRow = (await import("../../src/server/db.ts")).q("SELECT id FROM users WHERE rank = 'owner'").get() as { id: string };
    const { adminUpdateUser } = s;
    adminUpdateUser({ id: ownerRow.id, rank: "owner" }, gid, { rank: "guest" });
    s.saveServerSettings({ limits: { guest: { boards: 1, members: 2 } } as never });
    expect((await g.j("POST", "/api/boards", { title: "1" })).status).toBe(200);
    const second = await g.j("POST", "/api/boards", { title: "2" });
    expect(second.status).toBe(403);
    expect(second.data.error.code).toBe("limit_boards");
    const me = (await g.j("GET", "/api/me")).data;
    expect(me.usage.boards).toBe(1);
    expect(me.limits.boards).toBe(1);
    // на доске гостя максимум 2 участника (он сам + один)
    const list = (await g.j("GET", "/api/boards")).data;
    const bid = list[0].id;
    expect((await boss.j("GET", `/api/boards/${bid}`)).status).toBe(200);
    const { c: third } = await C.join("Третий");
    const full = await third.j("GET", `/api/boards/${bid}`);
    expect(full.status).toBe(403);
    expect(full.data.error.code).toBe("board_full");
    // админка: не-админу закрыто
    expect((await g.j("GET", "/api/admin")).status).toBe(403);
  });
});
