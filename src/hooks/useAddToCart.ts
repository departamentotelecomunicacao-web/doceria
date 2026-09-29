import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useToast } from "@/components/ui/Toast";
import { centsToValue, track } from "@/lib/analytics";
import { useCart } from "@/store/cart";
import { maxPurchasable } from "@/store/cartLogic";
import type { Product } from "@/types/domain";

export function useAddToCart() {
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  return useCallback((product: Product, quantity = 1) => {
    const max = maxPurchasable(product);
    if (max <= 0) {
      toast.error("Produto esgotado", `${product.name} acabou de esgotar.`);
      return false;
    }
    const current = cart.lines.find((line) => line.productId === product.id)?.quantity ?? 0;
    if (current >= max) {
      toast.info("Limite atingido", `Você já tem a quantidade máxima disponível de ${product.name} no carrinho.`);
      return false;
    }
    const added = Math.min(quantity, max - current);
    cart.add(product.id, added, max);
    track("add_to_cart", {
      value: centsToValue(product.price_cents * added),
      items: [{ item_id: product.id, item_name: product.name, price: centsToValue(product.price_cents), quantity: added }],
    });
    toast.show({
      tone: "success",
      title: `${product.name} no carrinho`,
      description: added < quantity ? `Adicionamos ${added} (limite do estoque).` : undefined,
      action: { label: "Ver carrinho", onClick: () => navigate("/carrinho") },
    });
    return true;
  }, [cart, toast, navigate]);
}
