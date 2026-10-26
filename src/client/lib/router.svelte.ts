/* Маленький роутер на History API: / , /b/:id , /login/:token */
export type Route =
  | { name: "home" }
  | { name: "board"; id: string; focus?: string; invite?: string }
  | { name: "login-link"; token: string }
  | { name: "not-found" };

function parse(path: string, search: string): Route {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return { name: "home" };
  let m = /^\/b\/([a-z0-9]{6,32})$/.exec(p);
  if (m) {
    const qs = new URLSearchParams(search);
    const focus = qs.get("n") || undefined;
    const invite = qs.get("k") || undefined;
    return { name: "board", id: m[1]!, focus, invite };
  }
  m = /^\/login\/([\w-]{10,200})$/.exec(p);
  if (m) return { name: "login-link", token: m[1]! };
  return { name: "not-found" };
}

class Router {
  route = $state<Route>(parse(location.pathname, location.search));

  constructor() {
    addEventListener("popstate", () => {
      this.route = parse(location.pathname, location.search);
    });
  }

  go(path: string, replace = false) {
    if (path === location.pathname + location.search) return;
    if (replace) history.replaceState(null, "", path);
    else history.pushState(null, "", path);
    this.route = parse(location.pathname, location.search);
    window.scrollTo(0, 0);
  }
}

export const router = new Router();
export const boardUrl = (id: string) => `/b/${id}`;
