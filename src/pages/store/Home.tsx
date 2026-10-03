import { ArrowRight, Bike, MessageCircle, ShoppingBag, Store } from "lucide-react";
import { Link } from "react-router";
import { CookieIllustration } from "@/components/store/CookieIllustration";
import { InstagramIcon } from "@/components/store/InstagramIcon";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import { ProductImage } from "@/components/store/ProductImage";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { useAddToCart } from "@/hooks/useAddToCart";
import { useCatalog, useStoreConfig } from "@/hooks/useStore";
import { storeUrl } from "@/lib/env";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { productImageUrl } from "@/lib/rest";
import { useDocumentMeta } from "@/lib/seo";
import { whatsappLink } from "@/lib/whatsapp";
import { useCart } from "@/store/cart";

export default function Home() {
  const config = useStoreConfig();
  const catalog = useCatalog();
  const cart = useCart();
  const addToCart = useAddToCart();

  const storeName = config.data?.storeName ?? "";
  const tagline = config.data?.tagline || "Cookies artesanais";
  useDocumentMeta({
    title: storeName ? `${storeName} · ${tagline}` : tagline,
    description: tagline,
    canonical: storeUrl("/"),
  });

  const products = catalog.data?.products ?? [];
  const featuredList = products.filter((product) => product.is_featured);
  const featured = (featuredList.length > 0 ? featuredList : products).slice(0, 4);
  // Foto de capa escolhida no painel; sem ela, o primeiro destaque com foto.
  const heroImageUrl = productImageUrl(config.data?.heroImagePath);
  const heroProduct = heroImageUrl ? undefined : featured.find((product) => product.image_path) ?? featured[0];
  const categoriesById = new Map((catalog.data?.categories ?? []).map((category) => [category.id, category]));
  const whatsapp = whatsappLink(config.data?.whatsappPhone, "Olá! Vim pelo site e tenho uma dúvida.");
  const instagramHandle = config.data?.instagramUrl?.replace(/\/$/, "").split("/").pop();
  const cartCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const payments = (config.data?.paymentMethods ?? []).map((m) => PAYMENT_METHOD_LABEL[m].toLowerCase()).join(", ");

  return (
    <>
      {/* Destaque ----------------------------------------------------------
          Texto à esquerda; à direita a foto de capa (ou o primeiro destaque)
          em formato de arco (sol nascendo) com halo, sem cartão de produto. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-butter-100/80 via-cream-50 to-cream-50">
        <div className="container-page grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-20">
          <div className="animate-slide-up space-y-6">
            <p className="eyebrow">{storeName || " "}</p>
            <h1 className="text-balance font-display text-[2.6rem] font-semibold leading-[1.02] text-cocoa-900 sm:text-6xl lg:text-7xl">
              {config.isLoading ? <span className="skeleton block h-32 w-full rounded-2xl" /> : tagline}
            </h1>
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="/produtos" size="lg" icon={<ArrowRight className="size-5" aria-hidden />} className="flex-row-reverse">
                Ver cardápio
              </ButtonLink>
              {cartCount > 0 && (
                <ButtonLink to="/carrinho" size="lg" variant="secondary" icon={<ShoppingBag className="size-5" aria-hidden />}>
                  Finalizar pedido ({cartCount})
                </ButtonLink>
              )}
            </div>
            {config.data && (
              <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-cocoa-700">
                {config.data.deliveryEnabled && (
                  <li className="inline-flex items-center gap-2">
                    <Bike className="size-4" aria-hidden /> Entrega em {config.data.deliveryCity.split(" - ")[0]}: {formatBRL(config.data.deliveryFeeCents)}
                  </li>
                )}
                {config.data.pickupEnabled && (
                  <li className="inline-flex items-center gap-2"><Store className="size-4" aria-hidden /> Retirada grátis</li>
                )}
              </ul>
            )}
          </div>

          <div className="relative mx-auto w-full max-w-[17rem] sm:max-w-sm lg:max-w-md" data-testid="hero-visual">
            {/* Halo de sol e contorno pontilhado acompanhando o arco. O topo usa
                raio em % (meia largura): "rounded-full" zeraria os cantos de baixo. */}
            <div className="absolute -inset-[16%] rounded-full bg-[radial-gradient(circle,var(--color-butter-200)_0%,transparent_66%)]" aria-hidden />
            <div className="absolute -inset-3 [border-top-left-radius:50%_41.667%] [border-top-right-radius:50%_41.667%] rounded-b-[2.25rem] border-2 border-dashed border-butter-300/80 sm:-inset-4" aria-hidden />
            <div className="relative aspect-[5/6] overflow-hidden [border-top-left-radius:50%_41.667%] [border-top-right-radius:50%_41.667%] rounded-b-[2rem] bg-butter-200">
              {heroImageUrl ? (
                <img src={heroImageUrl} alt={storeName || "Foto de capa"} fetchPriority="high" decoding="async" className="h-full w-full object-cover" />
              ) : config.isLoading || catalog.isLoading ? (
                <div className="skeleton h-full w-full" />
              ) : heroProduct ? (
                <ProductImage product={heroProduct} priority />
              ) : (
                <CookieIllustration seed="hero" name="cookie" className="h-full w-full" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Favoritos --------------------------------------------------------- */}
      <section id="destaques" className="container-page scroll-mt-24 py-16">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="eyebrow">Saindo do forno</p>
            <h2 className="font-display text-3xl sm:text-4xl">Os favoritos da casa</h2>
          </div>
          <Link to="/produtos" className="hidden items-center gap-1 text-sm font-semibold text-cocoa-800 hover:text-caramel-700 sm:inline-flex">
            Cardápio completo <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        {catalog.isError ? (
          <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} title="Não foi possível carregar o cardápio" />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 lg:grid-cols-4">
            {catalog.isLoading
              ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
              : featured.map((product) => (
                <ProductCard key={product.id} product={product} category={categoriesById.get(product.category_id ?? "")} onAdd={(p) => addToCart(p)} />
              ))}
          </div>
        )}
        <div className="mt-8 sm:hidden">
          <ButtonLink to="/produtos" variant="secondary" block>Ver cardápio completo</ButtonLink>
        </div>
      </section>

      {/* Como funciona ----------------------------------------------------- */}
      <section className="bg-cream-100 py-16" aria-labelledby="como-funciona">
        <div className="container-page">
          <div className="mb-10 max-w-2xl space-y-2">
            <p className="eyebrow">Como funciona</p>
            <h2 id="como-funciona" className="font-display text-3xl sm:text-4xl">Pedir é simples</h2>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {[
              { title: "Escolha seus cookies", text: "Monte o pedido pelo cardápio e escolha o dia e o período." },
              {
                title: "Entrega ou retirada",
                text: config.data?.deliveryEnabled
                  ? `Entregamos em ${config.data.deliveryCity.split(" - ")[0]} por ${formatBRL(config.data.deliveryFeeCents)}.${config.data.pickupEnabled ? " A retirada é grátis." : ""}`
                  : "Retire no nosso endereço sem custo.",
              },
              {
                title: "Confirmação no e-mail e WhatsApp",
                text: `Você recebe o resumo por e-mail e fala com a gente pelo WhatsApp. Pagamento: ${payments || "combinado no pedido"}.`,
              },
            ].map((step, index) => (
              <li key={step.title} className="card relative p-6">
                <span className="font-display text-5xl font-semibold text-caramel-400/70">{index + 1}</span>
                <h3 className="mt-3 font-display text-xl">{step.title}</h3>
                <p className="mt-2 text-cocoa-700">{step.text}</p>
              </li>
            ))}
          </ol>
          {config.data && config.data.minOrderCents > 0 && (
            <p className="mt-6 text-sm text-cocoa-600">Pedido mínimo de {formatBRL(config.data.minOrderCents)}.</p>
          )}
        </div>
      </section>

      {/* Contato ----------------------------------------------------------- */}
      {config.data && (whatsapp || config.data.instagramUrl) && (
        <section className="container-page py-16" aria-labelledby="contato">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-butter-100 p-8 sm:flex-row sm:items-center sm:p-10">
            <div className="space-y-2">
              <p className="eyebrow">Fale com a gente</p>
              <h2 id="contato" className="font-display text-3xl">Encomendas, caixas para presente e dúvidas</h2>
              {config.data.institutionalUrl && (
                <a href={config.data.institutionalUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-cocoa-800 hover:text-caramel-700">
                  Conheça nossa história <ArrowRight className="size-4" aria-hidden />
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener" className={buttonClasses("success", "lg")}>
                  <MessageCircle className="size-5" aria-hidden /> WhatsApp
                </a>
              )}
              {config.data.instagramUrl && (
                <a href={config.data.instagramUrl} target="_blank" rel="noopener" className={buttonClasses("secondary", "lg")}>
                  <InstagramIcon className="size-5" /> @{instagramHandle}
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
