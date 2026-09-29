// Cria a conta de um(a) proprietário(a) no Supabase (primeiro acesso ao
// painel). Rode UMA vez por pessoa, na sua máquina. Depois disso, novas contas
// são criadas pelo próprio painel (Configurações > Equipe).
//
//   SUPABASE_URL=https://SEU-PROJETO.supabase.co \
//   SUPABASE_SECRET_KEY=sb_secret_... \
//   node scripts/create-owner.mjs "Nome Completo" email@dominio.com
//
// A senha é pedida no terminal (não fica no histórico do shell).
import { createInterface } from "node:readline/promises";

const [name, email] = process.argv.slice(2);
const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;

if (!name || !email || !url || !key) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/create-owner.mjs "Nome" email');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = await rl.question("Senha (mín. 10 caracteres, letras e números): ");
rl.close();
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("Senha fraca.");
  process.exit(1);
}

const headers = { apikey: key, "Content-Type": "application/json" };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

const created = await fetch(`${url}/auth/v1/admin/users`, {
  method: "POST",
  headers,
  body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name } }),
});
const user = await created.json();
if (!created.ok) {
  console.error("Falha ao criar usuário:", user.msg ?? user.message ?? created.status);
  process.exit(1);
}

const profile = await fetch(`${url}/rest/v1/profiles`, {
  method: "POST",
  headers: { ...headers, Prefer: "return=minimal" },
  body: JSON.stringify({ id: user.id, full_name: name, email, role: "OWNER", is_active: true }),
});
if (!profile.ok) {
  console.error("Usuário criado, mas falhou ao criar o profile:", await profile.text());
  process.exit(1);
}
console.log(`Proprietário(a) ${name} <${email}> criado(a). Acesse /admin/login.`);
