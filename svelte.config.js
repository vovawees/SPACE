/** @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig} */
export default {
  compilerOptions: {
    // предупреждения доступности оставляем, но не ломаем сборку
    warningFilter: (w) => !["a11y_no_static_element_interactions", "a11y_click_events_have_key_events"].includes(w.code),
  },
};
