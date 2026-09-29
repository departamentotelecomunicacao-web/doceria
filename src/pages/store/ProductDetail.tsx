import { ArrowLeft, Scale, ShoppingBag, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Price } from "@/components/store/Price";
import { ProductImage } from "@/components/store/ProductImage";
import { StockBadge } from "@/components/store/StockBadge";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useAddToCart } from "@/hooks/useAddToCart";
import { useProduct, useStoreConfig } from "@/hooks/useStore";
import { centsToValue, track } from "@/lib/analytics";
import { storeUrl } from "@/lib/env";
import { useDocumentMeta } from "@/lib/seo";
import { productImageUrl } from "@/lib/rest";
import { maxPurchasable } from "@/store/cartLogic";

export default function ProductDetail() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const query = useProduct(slug);
  const config = useStoreConfig();
  const addToCart = useAddToCart();
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const product = query.data;
  const max = product ? maxPurchasable(product) : 0;
  const autoAdded = useRef(false);

  useDocumentMeta({
    title: product ? `${product.name}${config.data ? ` · ${config.data.storeName}` : ""}` : "Produto",
    description: product?.short_description || product?.description.slice(0, 155),
    canonical: product ? storeUrl(`/produto/${product.slug}`) : undefined,
    image: productImageUrl(product?.images[0]?.storage_path),
    jsonLd: product
      ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description || product.short_description,
        image: product.images.map((image) => productImageUrl(image.storage_path)).filter(Boolean),
        brand: config.data ? { "@type": "Brand", name: config.data.storeName } : undefined,
        offers: {
          "@type": "Offer",
          priceCurrency: "BRL",
          price: (product.price_cents / 100).toFixed(2),
          availability: max > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: storeUrl(`/produto/${product.slug}`),
        },
      }
      : null,
  });

  useEffect(() => {
    if (!product) return;
    track("view_item", {
      value: centsToValue(product.price_cents),
      items: [{ item_id: product.id, item_name: product.name, price: centsToValue(product.price_cents), quantity: 1 }],
    });
  }, [product]);

  // Vindo do cardápio incorporado (Wix): "Comprar" abre a loja já com o item.
  useEffect(() => {
    if (!product || autoAdded.current || params.get("adicionar") !== "1") return;
    autoAdded.current = true;
    const next = new URLSearchParams(params);
    next.delete("adicionar");
    setParams(next, { replace: true });
    if (addToCart(product, 1)) navigate("/carrinho");
  }, [product, params, setParams, addToCart, navigate]);

  if (query.isLoading) {
    return (
      <div className="container-page grid gap-10 py-10 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-[2rem]" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => query.refetch()} title="Não foi possível carregar o produto" />;
  }
  if (!product) {
    return (
      <EmptyState
        className="container-page"
        title="Produto não encontrado"
        description="Ele pode ter saído do cardápio. Veja as opções disponíveis hoje."
        action={<ButtonLink to="/produtos">Ver cardápio</ButtonLink>}
      />
    );
  }

  const soldOut = max <= 0;

  return (
    <div className="container-page py-8 sm:py-12">
      <Link to="/produtos" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">
        <ArrowLeft className="size-4" aria-hidden /> Voltar ao cardápio
      </Link>

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-[2rem] bg-cream-100">
            <ProductImage product={product} index={imageIndex} priority sizes="(min-width: 1024px) 50vw, 100vw" className={cn(soldOut && "opacity-70")} />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto" aria-label="Galeria">
              {product.images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  className={cn("size-20 shrink-0 overflow-hidden rounded-xl border-2", index === imageIndex ? "border-cocoa-900" : "border-transparent")}
                  aria-label={`Foto ${index + 1}`}
                  aria-pressed={index === imageIndex}
                >
                  <ProductImage product={product} index={index} sizes="80px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2"><StockBadge product={product} /></div>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">{product.name}</h1>
            {product.short_description && <p className="text-lg text-cocoa-700">{product.short_description}</p>}
            <Price cents={product.price_cents} compareAtCents={product.compare_at_price_cents} size="lg" />
          </div>

          {soldOut ? (
            <div className="rounded-2xl border border-cream-300 bg-cream-100 p-4 text-cocoa-700" data-testid="sold-out-notice">
              <p className="font-semibold text-cocoa-900">Esgotado por enquanto</p>
              <p className="text-sm">Fazemos fornadas pequenas. Volte mais tarde ou escolha outro sabor.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <QuantityStepper value={Math.min(quantity, max)} max={max} onChange={setQuantity} />
              <Button
                size="lg"
                icon={<ShoppingBag className="size-5" aria-hidden />}
                onClick={() => addToCart(product, Math.min(quantity, max))}
                className="flex-1 sm:flex-none"
              >
                Adicionar ao carrinho
              </Button>
            </div>
          )}

          {product.description && (
            <section className="space-y-2 border-t border-cream-200 pt-6">
              <h2 className="font-display text-xl">Sobre</h2>
              <p className="leading-relaxed text-cocoa-700">{product.description}</p>
            </section>
          )}

          <section className="grid gap-6 border-t border-cream-200 pt-6 sm:grid-cols-2">
            {product.ingredients && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-cocoa-600">Ingredientes</h2>
                <p className="text-sm text-cocoa-700">{product.ingredients}</p>
              </div>
            )}
            <div className="space-y-3">
              {product.allergens.length > 0 && (
                <div className="space-y-2">
                  <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-cocoa-600">
                    <TriangleAlert className="size-4" aria-hidden /> Alergênicos
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {product.allergens.map((allergen) => <Badge key={allergen} tone="warning">{allergen}</Badge>)}
                  </div>
                </div>
              )}
              {product.weight_grams && (
                <p className="flex items-center gap-1.5 text-sm text-cocoa-700">
                  <Scale className="size-4" aria-hidden /> {product.weight_grams} g
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
