// Stub da API REST do EmailJS para testes locais e no CI (nunca usado em
// produção). Guarda as mensagens recebidas para os testes conferirem.
//   POST /api/v1.0/email/send   -> 200 "OK" (ou 500 se /__fail estiver ativo)
//   GET  /__emails              -> mensagens recebidas
//   POST /__reset               -> limpa as mensagens e desliga a falha
//   POST /__fail                -> as próximas chamadas falham (simula EmailJS fora do ar)
import { createServer } from "node:http";

const port = Number(process.env.EMAIL_STUB_PORT ?? 54401);
let emails = [];
let failing = false;

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/__emails") return send(res, 200, { emails });
  if (req.method === "POST" && req.url === "/__reset") {
    emails = [];
    failing = false;
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && req.url === "/__fail") {
    failing = true;
    return send(res, 200, { ok: true });
  }
  if (req.method !== "POST" || req.url !== "/api/v1.0/email/send") return send(res, 404, { error: "not found" });

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    if (failing) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Service unavailable");
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain" });
      return res.end("Bad JSON");
    }
    const valid = body.service_id && body.template_id && body.user_id && body.accessToken && body.template_params?.to_email;
    if (!valid) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      return res.end("The template params are invalid");
    }
    emails.push({ ...body.template_params, receivedAt: new Date().toISOString() });
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Stub do EmailJS em http://127.0.0.1:${port}`);
});
