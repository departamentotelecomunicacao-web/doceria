import { describe, expect, it } from "vitest";
import { buildOrderSearch } from "./orderSearch";

describe("busca de pedidos", () => {
  it("aceita o código com # e em minúsculas", () => {
    expect(buildOrderSearch("#NPWU2F").conditions).toContain("code.ilike.%NPWU2F%");
    expect(buildOrderSearch("  #npwu2f ").conditions).toContain("code.ilike.%NPWU2F%");
  });

  it("só # não busca nada", () => {
    expect(buildOrderSearch("#")).toEqual({ term: "", conditions: [] });
    expect(buildOrderSearch("   ")).toEqual({ term: "", conditions: [] });
  });

  it("WhatsApp com máscara vira só dígitos", () => {
    expect(buildOrderSearch("(28) 99911-2233").conditions).toContain("customer_phone.ilike.%28999112233%");
  });

  it("nome com acento e caracteres que quebrariam o filtro", () => {
    const search = buildOrderSearch("João, (Silva)%");
    expect(search.term).toBe("João Silva");
    expect(search.conditions[0]).toBe("customer_name.ilike.%João Silva%");
    for (const condition of search.conditions) expect(condition.slice(condition.indexOf("%") + 1, -1)).not.toMatch(/[(),%]/);
  });
});
