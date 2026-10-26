import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const server = `http://localhost:${process.env.PORT || 8787}`;

export default defineConfig({
  plugins: [svelte()],
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": { target: server, changeOrigin: false },
      "/collab": { target: server.replace("http", "ws"), ws: true, changeOrigin: false },
    },
  },
  preview: { port: 4173 },
});
