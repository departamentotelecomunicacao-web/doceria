import { Badge } from "@/components/ui/Badge";
import type { Product } from "@/types/domain";

/** Só aparece quando o produto tem controle de estoque e está acabando. */
export function StockBadge({ product, className }: { product: Pick<Product, "stock">; className?: string }) {
  if (product.stock === null) return null;
  if (product.stock <= 0) return <Badge tone="danger" className={className}>Esgotado</Badge>;
  if (product.stock <= 3) {
    return (
      <Badge tone="warning" className={className}>
        {product.stock === 1 ? "Última unidade" : `Últimas ${product.stock} unidades`}
      </Badge>
    );
  }
  return null;
}
