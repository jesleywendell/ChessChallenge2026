import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const SERVER_PORT = Number(process.env.PORT ?? 8787);

export default defineConfig({
  root: "src/web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: `ws://localhost:${SERVER_PORT}`, ws: true },
    },
  },
  test: {
    root: ".",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
