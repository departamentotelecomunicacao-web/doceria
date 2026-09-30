// Pós-build para GitHub Pages (hospedagem estática):
// 1. Rotas conhecidas recebem uma cópia do index.html em <rota>/index.html,
//    então abrir/atualizar /checkout ou /embed responde 200 (não 404).
// 2. Rotas dinâmicas (/produto/:slug, /pedido/:token, /admin/pedidos/:id)
//    caem no 404.html, que é o mesmo app: o React Router resolve a rota.
// 3. .nojekyll e CNAME (domínio personalizado, se configurado).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const index = join(dist, "index.html");
if (!existsSync(index)) {
  console.error("dist/index.html não encontrado. Rode o build do Vite antes.");
  process.exit(1);
}

const staticRoutes = [
  "produtos",
  "carrinho",
  "checkout",
  "embed",
  "privacidade",
  "admin",
  "admin/login",
  "admin/pedidos",
  "admin/produtos",
  "admin/produtos/novo",
  "admin/configuracoes",
];

copyFileSync(index, join(dist, "404.html"));
for (const route of staticRoutes) {
  const dir = join(dist, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(index, join(dir, "index.html"));
}

writeFileSync(join(dist, ".nojekyll"), "");

const domain = process.env.CUSTOM_DOMAIN?.trim();
if (domain) {
  writeFileSync(join(dist, "CNAME"), `${domain}\n`);
}

console.log(`postbuild: 404.html + ${staticRoutes.length} rotas estáticas${domain ? ` + CNAME (${domain})` : ""}`);
