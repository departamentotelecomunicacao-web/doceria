import { Cookie, Info } from "lucide-react";
import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { CategoryTabs } from "@/components/store/CategoryTabs";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAddToCart } from "@/hooks/useAddToCart";
import { useCatalog, useStoreConfig } from "@/hooks/useStore";
import { storeUrl } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";

export default function Products() {
  const [params, setParams] = useSearchParams();
  const catalog = useCatalog();
  const config = useStoreConfig();
  const addToCart = useAddToCart();
  const active = params.get("categoria") ?? "todos";

  useDocumentMeta({
    title: `Cardápio${config.data ? ` · ${config.data.storeName}` : ""}`,
    description: "Cookies clássicos, especiais, combos e novidades. Veja preços, disponibilidade e faça seu pedido.",
    canonical: storeUrl("/produtos"),
  });

  const categories = useMemo(() => catalog.data?.categories ?? [], [catalog.data]);
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { todos: catalog.data?.products.length ?? 0 };
    for (const product of catalog.data?.products ?? []) {
      const slug = categoriesById.get(product.category_id ?? "")?.slug;
      if (slug) result[slug] = (result[slug] ?? 0) + 1;
    }
    return result;
  }, [catalog.data, categoriesById]);

  const visible = useMemo(() => {
    const products = catalog.data?.products ?? [];
    if (active === "todos") return products;
    return products.filter((product) => categoriesById.get(product.category_id ?? "")?.slug === active);
  }, [catalog.data, active, categoriesById]);

  const changeCategory = (slug: string) => {
    const next = new URLSearchParams(params);
    if (slug === "todos") next.delete("categoria");
    else next.set("categoria", slug);
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="mb-8 space-y-3">
        <p className="eyebrow">Cardápio</p>
        <h1 className="font-display text-4xl sm:text-5xl">Escolha seus cookies</h1>
        {config.data && (
          <p className="flex max-w-2xl items-start gap-2 text-sm text-cocoa-600">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {config.data.deliveryEnabled && <>Entrega em {config.data.deliveryCity} por {formatBRL(config.data.deliveryFeeCents)}. </>}
              {config.data.pickupEnabled && <>Retirada grátis. </>}
              {config.data.minOrderCents > 0 && <>Pedido mínimo {formatBRL(config.data.minOrderCents)}.</>}
            </span>
          </p>
        )}
      </header>

      {categories.length > 0 && (
        <div className="sticky top-16 z-30 -mx-4 mb-8 bg-cream-50/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0">
          <CategoryTabs categories={categories} active={active} onChange={changeCategory} counts={counts} />
        </div>
      )}

      {catalog.isError ? (
        <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} title="Não foi possível carregar o cardápio" />
      ) : catalog.isLoading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Cookie className="size-6" aria-hidden />}
          title="Nada por aqui ainda"
          description="Não há produtos nesta categoria no momento. Veja as outras opções do cardápio."
          action={<Button variant="secondary" onClick={() => changeCategory("todos")}>Ver todos</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4" data-testid="product-grid">
          {visible.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              category={categoriesById.get(product.category_id ?? "")}
              onAdd={(p) => addToCart(p)}
              priority={index < 2}
            />
          ))}
        </div>
      )}
    </div>
  );
}
