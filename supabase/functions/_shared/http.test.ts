import { describe, expect, it } from "vitest";
import { AppError, appErrorFromPostgrest } from "./errors.ts";
import { corsHeaders, createHandler, parseAllowedOrigins, readJsonBody, resolveAllowedOrigins } from "./http.ts";

describe("CORS", () => {
  const allowed = parseAllowedOrigins("https://loja.exemplo.com.br, http://localhost:5173/");
  it("libera somente origens configuradas", () => {
    expect(corsHeaders("https://loja.exemplo.com.br", allowed)["Access-Control-Allow-Origin"]).toBe("https://loja.exemplo.com.br");
    expect(corsHeaders("http://localhost:5173", allowed)["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(corsHeaders("https://malicioso.example", allowed)["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(corsHeaders(null, allowed)["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("sem ALLOWED_ORIGINS usa a origem de SITE_URL; sem os dois, não trava a loja", () => {
    const envOf = (vars: Record<string, string>) => (name: string) => vars[name];
    expect(resolveAllowedOrigins(envOf({ ALLOWED_ORIGINS: "https://a.example", SITE_URL: "https://b.example/x" }))).toEqual(["https://a.example"]);
    expect(resolveAllowedOrigins(envOf({ SITE_URL: "https://usuario.github.io/doceria" }))).toEqual(["https://usuario.github.io"]);
    expect(resolveAllowedOrigins(envOf({}))).toEqual(["*"]);
  });
});

describe("createHandler", () => {
  const env = (name: string) => (name === "ALLOWED_ORIGINS" ? "https://loja.exemplo.com.br" : undefined);

  it("responde preflight e recusa métodos não permitidos", async () => {
    const handler = createHandler(env, "t", async () => new Response("ok"));
    expect((await handler(new Request("http://x", { method: "OPTIONS", headers: { origin: "https://loja.exemplo.com.br" } }))).status).toBe(204);
    expect((await handler(new Request("http://x", { method: "GET" }))).status).toBe(405);
  });

  it("erro inesperado vira mensagem genérica sem detalhes técnicos", async () => {
    const handler = createHandler(env, "t", async () => {
      throw new Error("relation \"orders\" violates constraint at line 42");
    });
    const response = await handler(new Request("http://x", { method: "POST" }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/relation|constraint|line/);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("erro de negócio mantém código e mensagem amigável", async () => {
    const handler = createHandler(env, "t", async () => {
      throw new AppError(409, "OUT_OF_STOCK", "Sem estoque.");
    });
    const response = await handler(new Request("http://x", { method: "POST" }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatchObject({ code: "OUT_OF_STOCK", message: "Sem estoque." });
  });
});

describe("readJsonBody", () => {
  it("rejeita corpo grande, tipo errado e JSON inválido", async () => {
    const big = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: "x".repeat(5000) }) });
    await expect(readJsonBody(big, 1000)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    const text = new Request("http://x", { method: "POST", headers: { "content-type": "text/plain" }, body: "oi" });
    await expect(readJsonBody(text)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    const invalid = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    await expect(readJsonBody(invalid)).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
});

describe("appErrorFromPostgrest", () => {
  it("converte erros de negócio PTxxx", () => {
    const error = appErrorFromPostgrest(409, { code: "PT409", message: "OUT_OF_STOCK", details: "Sem estoque.", hint: "{\"problems\":[]}" });
    expect(error).toMatchObject({ status: 409, code: "OUT_OF_STOCK", message: "Sem estoque.", data: { problems: [] } });
  });
  it("esconde erros técnicos", () => {
    expect(appErrorFromPostgrest(400, { code: "42P01", message: "relation does not exist" }).code).toBe("INTERNAL_ERROR");
    expect(appErrorFromPostgrest(503, null).code).toBe("SERVICE_UNAVAILABLE");
  });
});
