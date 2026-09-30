import { ArrowUpRight, Cookie } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { CategoryTabs } from "@/components/store/CategoryTabs";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useCatalog, useStoreConfig } from "@/hooks/useStore";
import { postToParent, startAutoResize } from "@/lib/embed";
import { storeUrl } from "@/lib/env";
import { useDocumentMeta } from "@/lib/seo";
import type { Product } from "@/types/domain";

/**
 * /embed: cardápio compacto para o iframe do Wix.
 * - sem header/footer (o Wix já tem os seus);
 * - fundo transparente (ou creme com ?fundo=creme);
 * - comprar abre a loja completa em nova aba (carrinho/checkout fora do iframe);
 * - informa a altura ao pai (RESIZE) para quem suportar auto-altura.
 * Parâmetros: ?categoria=slug  ?limite=6  ?fundo=transparente|creme
 */
export default function Embed() {
  const [params] = useSearchParams();
  const catalog = useCatalog();
  const config = useStoreConfig();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(params.get("categoria") ?? "todos");
  const limit = Math.min(Math.max(Number(params.get("limite")) || 0, 0), 60);
  const background = params.get("fundo") === "creme" ? "creme" : "transparente";

  useDocumentMeta({ title: config.data ? `Cardápio · ${config.data.storeName}` : "Cardápio", robots: "noindex,follow" });

  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("embed-mode");
    if (background === "creme") html.classList.add("embed-bg-cream");
    return () => html.classList.remove("embed-mode", "embed-bg-cream");
  }, [background]);

  useEffect(() => {
    if (!rootRef.current) return;
    const stop = startAutoResize(rootRef.current);
    postToParent("READY");
    return stop;
  }, []);

  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const products = useMemo(() => {
    const all = catalog.data?.products ?? [];
    const filtered = active === "todos" ? all : all.filter((product) => categoriesById.get(product.category_id ?? "")?.slug === active);
    return limit > 0 ? filtered.slice(0, limit) : filtered;
  }, [catalog.data, active, categoriesById, limit]);

  const utm = "utm_source=wix&utm_medium=embed&utm_campaign=cardapio";
  const buyHref = (product: Product) => storeUrl(`/produto/${product.slug}?adicionar=1&${utm}`);
  const viewHref = (product: Product) => storeUrl(`/produto/${product.slug}?${utm}`);
  const onView = (product: Product) => {
    postToParent("PRODUCT_VIEW", { productId: product.id, slug: product.slug, name: product.name });
    postToParent("OPEN_STORE", { path: `/produto/${product.slug}` });
  };
  const onBuy = (product: Product) => {
    postToParent("ADD_TO_CART", { productId: product.id, slug: product.slug, name: product.name });
    postToParent("OPEN_STORE", { path: `/produto/${product.slug}` });
  };

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4" data-testid="embed-root">
      {categories.length > 0 && (
        <div className="mb-5">
          <CategoryTabs categories={categories} active={active} onChange={setActive} />
        </div>
      )}

      {catalog.isError ? (
        <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} title="Não foi possível carregar o cardápio" />
      ) : catalog.isLoading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: limit || 4 }, (_, i) => <ProductCardSkeleton key={i} compact />)}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={<Cookie className="size-6" aria-hidden />} title="Cardápio em atualização" description="Volte em instantes para ver os sabores do dia." />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              category={categoriesById.get(product.category_id ?? "")}
              compact
              buyHref={buyHref(product)}
              onBuyClick={onBuy}
              viewHref={viewHref(product)}
              onViewClick={onView}
            />
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <a
          href={storeUrl(`/produtos?${utm}`)}
          target="_blank"
          rel="noopener"
          onClick={() => postToParent("OPEN_STORE", { path: "/produtos" })}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-cocoa-900/20 bg-white px-5 text-sm font-semibold text-cocoa-900 hover:border-cocoa-900/40"
        >
          Ver cardápio completo e fazer pedido <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
