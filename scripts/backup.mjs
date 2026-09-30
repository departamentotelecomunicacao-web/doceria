// Backup lógico do banco de produção (papéis, schema e dados) com o
// Supabase CLI. Rode em uma máquina confiável; os arquivos contêm dados
// pessoais de clientes (LGPD): guarde-os criptografados e com acesso restrito.
//
//   SUPABASE_DB_URL="postgresql://postgres.[ref]:[senha]@aws-0-[região].pooler.supabase.com:5432/postgres" \
//     node scripts/backup.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Defina SUPABASE_DB_URL (Dashboard > Connect > Session pooler).");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = join("backups", stamp);
mkdirSync(dir, { recursive: true });

const run = (args, file) => {
  console.log(`> supabase db dump ${args.join(" ")} -f ${file}`);
  execFileSync("npx", ["--no-install", "supabase", "db", "dump", "--db-url", dbUrl, ...args, "-f", join(dir, file)], { stdio: "inherit" });
};

run(["--role-only"], "roles.sql");
run([], "schema.sql");
run(["--data-only", "--use-copy"], "data.sql");

console.log(`\nBackup salvo em ${dir}. Veja docs/OPERACAO.md para restaurar.`);
