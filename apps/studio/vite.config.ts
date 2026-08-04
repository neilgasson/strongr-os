import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: true,
    outDir: mode === "development-review" ? "dist-development-review" : "dist",
    ...(mode === "development-review"
      ? { rollupOptions: { input: "dev-review.html" } }
      : { rollupOptions: { input: "index.html" } }),
    sourcemap: false,
    target: "es2022",
  },
  ...(mode === "hosted-preview" ? { envDir: false } : {}),
  envPrefix: "PUBLIC_",
  plugins: [react()],
  preview: {
    host: "127.0.0.1",
    port: mode === "development-review" ? 4174 : 4173,
    strictPort: true,
  },
  server: {
    host: "127.0.0.1",
    port: mode === "development-review" ? 4174 : 4173,
    strictPort: true,
  },
}));
