// Gera os arquivos de ambiente para desenvolvimento local a partir do
// `supabase status` (as chaves locais nunca são versionadas).
//   node scripts/local-env.mjs          -> .env.local + supabase/functions/.env
//   node scripts/local-env.mjs --stub   -> idem, para os testes (limite de pedidos alto)
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
const write = !existsSync(functionsEnv) || useStub;
if (write) {
  let content = readFileSync("supabase/functions/.env.example", "utf8");
  content = content
    .replace(/^RATE_LIMIT_SALT=.*$/m, "RATE_LIMIT_SALT=local-dev-salt")
    .replace(/^SITE_URL=.*$/m, `SITE_URL=${site}`);
  if (useStub) {
    content = content.replace(/^ORDER_RATE_LIMIT_PER_10_MIN=.*$/m, "ORDER_RATE_LIMIT_PER_10_MIN=1000");
  }
  writeFileSync(functionsEnv, content);
}

console.log(`Gerado .env.local${write ? " e supabase/functions/.env" : ""}${useStub ? " (modo de testes)" : ""}.`);
