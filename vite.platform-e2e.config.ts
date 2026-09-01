import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { PLATFORM_URL, UNCONFIGURED_URL, SUPABASE_TEST_ORIGIN, SUPABASE_TEST_KEY } from "./tests/config/e2eEnvironment";

// Same entry, AuthProvider and Supabase SDK as production. Only HTTP is mocked
// by Playwright. No .env files, real project keys, auth aliases or runtime bypass.
export default defineConfig(({ mode }) => {
  const unconfigured = mode === "unconfigured";
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    envDir: false,
    envPrefix: [],
    plugins: [react()],
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(unconfigured ? "" : SUPABASE_TEST_ORIGIN),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(unconfigured ? "" : SUPABASE_TEST_KEY),
    },
    build: {
      outDir: unconfigured ? ".qa_unconfigured-build" : ".qa_platform-build",
      emptyOutDir: true,
    },
    preview: {
      host: "127.0.0.1",
      port: Number(new URL(unconfigured ? UNCONFIGURED_URL : PLATFORM_URL).port),
      strictPort: true,
    },
  };
});
