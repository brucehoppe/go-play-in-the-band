import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Production-only Content-Security-Policy. Dev is left open because Vite's
// dev server injects inline scripts for hot reload.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "csp",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<!--csp-->", `<meta http-equiv="Content-Security-Policy" content="${csp}" />`),
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), cspPlugin()],
  worker: { format: "es" },
  build: { assetsInlineLimit: 0 },
  test: { environment: "node" },
});
