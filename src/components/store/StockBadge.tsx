import { Badge } from "@/components/ui/Badge";
import { stockStatusOf } from "@/lib/labels";
import type { Product } from "@/types/domain";

export function StockBadge({ product, className }: { product: Pick<Product, "stock_available" | "low_stock_threshold">; className?: string }) {
  const status = stockStatusOf(product);
  if (status === "SOLD_OUT") return <Badge tone="danger" className={className}>Esgotado</Badge>;
  if (status === "LOW") {
    return (
      <Badge tone="warning" className={className}>
        {product.stock_available === 1 ? "Última unidade" : `Últimas ${product.stock_available} unidades`}
      </Badge>
    );
  }
  return null;
}
