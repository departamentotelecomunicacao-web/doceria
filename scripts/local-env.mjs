// Gera os arquivos de ambiente para desenvolvimento local a partir do
// `supabase status` (as chaves locais nunca são versionadas).
//   node scripts/local-env.mjs          -> .env.local + supabase/functions/.env
//   node scripts/local-env.mjs --stub   -> idem, com a API de rotas apontando para o stub de testes
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const useStub = process.argv.includes("--stub");
const output = execSync("npx --no-install supabase status -o json", { stdio: ["ignore", "pipe", "inherit"] }).toString();
const status = JSON.parse(output.slice(output.indexOf("{")));

const site = process.env.VITE_SITE_URL ?? "http://localhost:5173";
writeFileSync(
  ".env.local",
  [
    "# Gerado por scripts/local-env.mjs (não versionar)",
    `VITE_SUPABASE_URL=${status.API_URL}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}`,
    `VITE_SITE_URL=${site}`,
    "VITE_BASE_PATH=/",
    "",
  ].join("\n"),
);

const functionsEnv = "supabase/functions/.env";
if (!existsSync(functionsEnv) || useStub) {
  let content = readFileSync("supabase/functions/.env.example", "utf8");
  content = content.replace(/^RATE_LIMIT_SALT=.*$/m, "RATE_LIMIT_SALT=local-dev-salt");
  if (useStub) {
    content = content
      .replace(/^GOOGLE_MAPS_API_KEY=.*$/m, "GOOGLE_MAPS_API_KEY=test-google-key")
      .replace(/^# GOOGLE_ROUTES_ENDPOINT=.*$/m, "GOOGLE_ROUTES_ENDPOINT=http://host.docker.internal:54400/directions/v2:computeRoutes")
      .replace(/^ROUTING_TIMEOUT_MS=.*$/m, "ROUTING_TIMEOUT_MS=4000")
      .replace(/^QUOTE_RATE_LIMIT_PER_10_MIN=.*$/m, "QUOTE_RATE_LIMIT_PER_10_MIN=1000")
      .replace(/^ORDER_RATE_LIMIT_PER_10_MIN=.*$/m, "ORDER_RATE_LIMIT_PER_10_MIN=1000")
      .replace(/^ROUTING_MAX_CALLS_PER_HOUR=.*$/m, "ROUTING_MAX_CALLS_PER_HOUR=100000");
  }
  writeFileSync(functionsEnv, content);
}

console.log(`Gerado .env.local${!existsSync(functionsEnv) || useStub ? " e supabase/functions/.env" : ""}${useStub ? " (stub de rotas)" : ""}.`);
