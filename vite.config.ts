/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * Content-Security-Policy via <meta> (GitHub Pages não permite cabeçalhos).
 * Aplicada apenas no build: libera somente o Supabase configurado, o ViaCEP
 * (autopreenchimento de CEP) e, se configurados, GTM/GA4/Meta Pixel.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  return {
    name: "doceria-csp",
    apply: "build",
    transformIndexHtml(html) {
      const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : "";
      const supabaseWs = supabase.replace(/^http/, "ws");
      const scriptSrc = ["'self'"];
      const connectSrc = ["'self'", supabase, supabaseWs, "https://viacep.com.br"];
      const imgSrc = ["'self'", "data:", "blob:", supabase];
      if (env.VITE_GTM_ID || env.VITE_GA4_ID) {
        scriptSrc.push("https://www.googletagmanager.com");
        connectSrc.push("https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com");
        imgSrc.push("https://*.google-analytics.com", "https://www.googletagmanager.com");
      }
      if (env.VITE_META_PIXEL_ID) {
        scriptSrc.push("https://connect.facebook.net");
        connectSrc.push("https://www.facebook.com");
        imgSrc.push("https://www.facebook.com");
      }
      const policy = [
        "default-src 'self'",
        `script-src ${scriptSrc.join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        `img-src ${imgSrc.filter(Boolean).join(" ")}`,
        "font-src 'self' data:",
        `connect-src ${connectSrc.filter(Boolean).join(" ")}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      return html.replace(
        "<!-- CSP -->",
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env)],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        "@shared": fileURLToPath(new URL("./supabase/functions/_shared", import.meta.url)),
      },
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
    build: {
      target: "es2020",
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router"],
            supabase: ["@supabase/supabase-js"],
            query: ["@tanstack/react-query"],
          },
        },
      },
    },
    test: {
      include: ["src/**/*.test.{ts,tsx}", "supabase/functions/_shared/**/*.test.ts"],
      environment: "node",
      restoreMocks: true,
    },
  };
});
