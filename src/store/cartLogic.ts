// Regras puras do carrinho (testáveis). O carrinho guarda somente IDs e
// quantidades; nome, preço e estoque sempre vêm do banco no momento da exibição.
import type { Product } from "@/types/domain";

export interface CartLine {
  productId: string;
  quantity: number;
}

export type CartIssue = "UNAVAILABLE" | "SOLD_OUT" | "REDUCED";

export interface CartItem {
  product: Product;
  quantity: number;
  lineTotalCents: number;
  maxQuantity: number;
}

export interface ReconciledCart {
  items: CartItem[];
  subtotalCents: number;
  count: number;
  issues: { productId: string; name?: string; issue: CartIssue }[];
  /** Linhas corrigidas (para persistir após reconciliar). */
  lines: CartLine[];
}

/** Limite por item no pedido (o banco aceita até 99). */
export const MAX_PER_ITEM = 99;

/** Quanto do produto pode ir para o carrinho: estoque, se houver controle, ou 99. */
export function maxPurchasable(product: Pick<Product, "stock">): number {
  return product.stock === null ? MAX_PER_ITEM : Math.max(0, Math.min(product.stock, MAX_PER_ITEM));
}

export function addLine(lines: CartLine[], productId: string, quantity: number, max: number): CartLine[] {
  const existing = lines.find((line) => line.productId === productId);
  const next = Math.min(max, (existing?.quantity ?? 0) + quantity);
  if (next <= 0) return lines.filter((line) => line.productId !== productId);
  if (existing) return lines.map((line) => (line.productId === productId ? { ...line, quantity: next } : line));
  return [...lines, { productId, quantity: next }];
}

export function setLineQuantity(lines: CartLine[], productId: string, quantity: number, max: number): CartLine[] {
  const next = Math.min(max, Math.max(0, Math.floor(quantity)));
  if (next <= 0) return lines.filter((line) => line.productId !== productId);
  return lines.map((line) => (line.productId === productId ? { ...line, quantity: next } : line));
}

export function reconcileCart(lines: CartLine[], products: Product[]): ReconciledCart {
  const byId = new Map(products.map((product) => [product.id, product]));
  const items: CartItem[] = [];
  const issues: ReconciledCart["issues"] = [];
  const corrected: CartLine[] = [];

  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product || !product.is_active) {
      issues.push({ productId: line.productId, issue: "UNAVAILABLE" });
      continue;
    }
    const max = maxPurchasable(product);
    if (max <= 0) {
      issues.push({ productId: line.productId, name: product.name, issue: "SOLD_OUT" });
      continue;
    }
    let quantity = Math.max(1, Math.floor(line.quantity));
    if (quantity > max) {
      quantity = max;
      issues.push({ productId: line.productId, name: product.name, issue: "REDUCED" });
    }
    corrected.push({ productId: line.productId, quantity });
    items.push({ product, quantity, lineTotalCents: product.price_cents * quantity, maxQuantity: max });
  }

  return {
    items,
    subtotalCents: items.reduce((sum, item) => sum + item.lineTotalCents, 0),
    count: items.reduce((sum, item) => sum + item.quantity, 0),
    issues,
    lines: corrected,
  };
}

/** Assinatura estável do conteúdo (usada na chave de idempotência). */
export function cartFingerprint(lines: CartLine[]): string {
  return [...lines]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map((line) => `${line.productId}:${line.quantity}`)
    .join("|");
}
