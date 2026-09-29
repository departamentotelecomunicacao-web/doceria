// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Product } from "@/types/domain";
import { ProductCard } from "./ProductCard";

const base: Product = {
  id: "p1", category_id: null, name: "Cookie Clássico", slug: "cookie-classico", short_description: "Gotas de chocolate", description: "",
  price_cents: 1200, compare_at_price_cents: null, stock_available: 10, stock_reserved: 0, low_stock_threshold: 2,
  max_per_order: 24, is_active: true, is_featured: false, sort_order: 0, allergens: [], ingredients: "",
  weight_grams: null, created_at: "", updated_at: "", images: [],
};

describe("ProductCard", () => {
  afterEach(cleanup);

  it("mostra o produto esgotado mas impede a compra", () => {
    const onAdd = vi.fn();
    render(<MemoryRouter><ProductCard product={{ ...base, stock_available: 0 }} onAdd={onAdd} /></MemoryRouter>);
    const button = screen.getByRole("button", { name: "Cookie Clássico esgotado" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getAllByText("Esgotado").length).toBeGreaterThan(0);
  });

  it("adiciona quando há estoque e avisa últimas unidades", () => {
    const onAdd = vi.fn();
    render(<MemoryRouter><ProductCard product={{ ...base, stock_available: 2 }} onAdd={onAdd} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar Cookie Clássico ao carrinho" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Últimas 2 unidades")).toBeTruthy();
    expect(screen.getByText("R$ 12,00")).toBeTruthy();
  });

  it("no modo incorporado, comprar abre a loja em nova aba", () => {
    render(<MemoryRouter><ProductCard product={base} buyHref="https://loja.exemplo.com/produto/cookie-classico?adicionar=1" /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /Comprar/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("href")).toContain("adicionar=1");
  });
});
