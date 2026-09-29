import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { useCartDetails } from "./useCartDetails";
import { cartFingerprint } from "./cartLogic";

/**
 * Montado uma única vez no layout da loja: aplica correções do carrinho
 * (produto esgotado, removido ou quantidade acima do estoque) e avisa o cliente.
 */
export function CartSync() {
  const { cart, reconciled } = useCartDetails();
  const toast = useToast();
  const { replace, lines } = cart;

  useEffect(() => {
    if (!reconciled || cartFingerprint(reconciled.lines) === cartFingerprint(lines)) return;
    const soldOut = reconciled.issues.filter((issue) => issue.issue === "SOLD_OUT" || issue.issue === "UNAVAILABLE");
    const reduced = reconciled.issues.filter((issue) => issue.issue === "REDUCED");
    if (soldOut.length > 0) {
      toast.info(
        "Carrinho atualizado",
        `${soldOut.map((issue) => issue.name ?? "Um produto").join(", ")} ${soldOut.length > 1 ? "esgotaram ou saíram" : "esgotou ou saiu"} do cardápio.`,
      );
    } else if (reduced.length > 0) {
      toast.info("Carrinho atualizado", `Ajustamos a quantidade de ${reduced.map((issue) => issue.name).join(", ")} ao estoque disponível.`);
    }
    replace(reconciled.lines);
  }, [reconciled, lines, replace, toast]);

  return null;
}
