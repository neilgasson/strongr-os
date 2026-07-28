import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  ...(mode === "hosted-preview" ? { envDir: false } : {}),
  envPrefix: "PUBLIC_",
  plugins: [react()],
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
}));
