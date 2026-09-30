import { useMemo } from "react";
import { useCatalog } from "@/hooks/useStore";
import { useCart } from "./cart";
import { reconcileCart } from "./cartLogic";

/** Carrinho reconciliado com o catálogo atual (preço e estoque do banco). */
export function useCartDetails() {
  const cart = useCart();
  const catalog = useCatalog();
  const reconciled = useMemo(
    () => (catalog.data ? reconcileCart(cart.lines, catalog.data.products) : null),
    [cart.lines, catalog.data],
  );
  return { cart, catalog, reconciled };
}
