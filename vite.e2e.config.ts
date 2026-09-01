import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { LAB_FIXTURE_URL } from "./tests/config/e2eEnvironment";

// Separate entry/output: the simulated session can never enter the production bundle.
export default defineConfig({
  envDir: false,
  envPrefix: [],
  define: {
    "import.meta.env.VITE_SUPABASE_URL": '""',
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  },
  root: fileURLToPath(new URL("./tests/fixtures", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("./.qa_e2e-build", import.meta.url)), emptyOutDir: true,
    rollupOptions: { input: {
      laboratory: fileURLToPath(new URL("./tests/fixtures/index.html", import.meta.url)),
      platform: fileURLToPath(new URL("./tests/fixtures/platform-visual.html", import.meta.url)),
    } },
  },
  preview: { host: "127.0.0.1", port: Number(new URL(LAB_FIXTURE_URL).port), strictPort: true },
});
