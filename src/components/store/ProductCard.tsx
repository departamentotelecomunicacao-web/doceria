import { ArrowUpRight, Plus } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { isSoldOut } from "@/lib/labels";
import type { Category, Product } from "@/types/domain";
import { Price } from "./Price";
import { ProductImage } from "./ProductImage";
import { StockBadge } from "./StockBadge";

interface Props {
  product: Product;
  category?: Category | null;
  onAdd?: (product: Product) => void;
  /** Modo incorporado: CTA abre a loja completa em vez de adicionar ao carrinho. */
  buyHref?: string;
  onBuyClick?: (product: Product) => void;
  /** Modo incorporado: link de detalhes (abre a loja sem adicionar ao carrinho). */
  viewHref?: string;
  onViewClick?: (product: Product) => void;
  compact?: boolean;
  priority?: boolean;
}

export function ProductCard({ product, category, onAdd, buyHref, onBuyClick, viewHref, onViewClick, compact, priority }: Props) {
  const soldOut = isSoldOut(product);
  const detailHref = `/produto/${product.slug}`;

  const imageBlock = (
    <div className={cn("relative overflow-hidden rounded-[1.1rem] bg-cream-100", compact ? "aspect-square" : "aspect-[4/5]")}>
      <ProductImage product={product} priority={priority} className={cn("transition-transform duration-500 group-hover:scale-[1.03]", soldOut && "opacity-60 grayscale-[35%]")} />
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        {category?.slug === "novidades" && <Badge tone="accent">Novidade</Badge>}
        <StockBadge product={product} />
      </div>
    </div>
  );

  return (
    <article className="group flex min-w-0 flex-col gap-3" data-testid="product-card" data-product-slug={product.slug}>
      {buyHref ? (
        <a href={viewHref ?? buyHref} target="_blank" rel="noopener" onClick={() => onViewClick?.(product)} aria-label={`Ver ${product.name}`}>
          {imageBlock}
        </a>
      ) : (
        <Link to={detailHref} aria-label={`Ver ${product.name}`}>
          {imageBlock}
        </Link>
      )}

      <div className="flex flex-1 flex-col gap-1.5 px-0.5">
        <h3 className={cn("break-words font-display leading-tight text-cocoa-900", compact ? "text-lg" : "text-xl")}>
          {buyHref ? product.name : <Link to={detailHref} className="hover:underline hover:decoration-caramel-400 hover:underline-offset-4">{product.name}</Link>}
        </h3>
        {product.short_description && <p className="line-clamp-2 text-sm text-cocoa-600">{product.short_description}</p>}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <Price cents={product.price_cents} />
          {buyHref ? (
            soldOut ? (
              <span className="text-sm font-semibold text-cocoa-500">Esgotado</span>
            ) : (
              <a
                href={buyHref}
                target="_blank"
                rel="noopener"
                onClick={() => onBuyClick?.(product)}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-cocoa-900 px-3.5 text-sm font-semibold text-cream-50 hover:bg-cocoa-800"
              >
                Comprar <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )
          ) : (
            <button
              type="button"
              disabled={soldOut}
              onClick={() => onAdd?.(product)}
              aria-label={soldOut ? `${product.name} esgotado` : `Adicionar ${product.name} ao carrinho`}
              className={cn(
                "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors",
                soldOut
                  ? "cursor-not-allowed border border-cream-300 px-3 text-cocoa-500"
                  : "w-10 bg-cocoa-900 text-cream-50 hover:bg-cocoa-800 sm:w-auto sm:px-4",
              )}
            >
              {soldOut ? "Esgotado" : <><Plus className="size-4" aria-hidden /><span className="hidden sm:inline">Adicionar</span></>}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className={cn("skeleton rounded-[1.1rem]", compact ? "aspect-square" : "aspect-[4/5]")} />
      <div className="skeleton h-5 w-2/3 rounded-lg" />
      <div className="skeleton h-4 w-full rounded-lg" />
      <div className="flex items-center justify-between pt-2">
        <div className="skeleton h-5 w-16 rounded-lg" />
        <div className="skeleton h-9 w-28 rounded-full" />
      </div>
    </div>
  );
}
