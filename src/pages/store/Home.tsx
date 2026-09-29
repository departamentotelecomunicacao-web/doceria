import { ArrowRight, Clock, Heart, MessageCircle, Package, ShoppingBag, Sparkles, Truck, Wheat } from "lucide-react";
import { InstagramIcon } from "@/components/store/InstagramIcon";
import { Link } from "react-router";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import { ProductImage } from "@/components/store/ProductImage";
import { CookieIllustration } from "@/components/store/CookieIllustration";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { useAddToCart } from "@/hooks/useAddToCart";
import { useCatalog, useStoreConfig } from "@/hooks/useStore";
import { summarizeWeeklyHours } from "@/lib/datetime";
import { storeUrl } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";
import { whatsappLink } from "@/lib/whatsapp";
import { useCart } from "@/store/cart";

const DIFFERENTIAL_ICONS = [Wheat, Sparkles, Heart];

export default function Home() {
  const config = useStoreConfig();
  const catalog = useCatalog();
  const cart = useCart();
  const addToCart = useAddToCart();
  const content = config.data?.content ?? {};

  const storeName = config.data?.storeName ?? "";
  useDocumentMeta({
    title: storeName ? `${storeName} · ${config.data?.tagline || "Cookies artesanais"}` : "Cookies artesanais",
    description: content.heroSubtitle ?? config.data?.tagline,
    canonical: storeUrl("/"),
  });

  const products = catalog.data?.products ?? [];
  const featured = (products.filter((product) => product.is_featured).length > 0
    ? products.filter((product) => product.is_featured)
    : products
  ).slice(0, 4);
  const heroProduct = featured.find((product) => product.images.length > 0) ?? featured[0];
  const categoriesById = new Map((catalog.data?.categories ?? []).map((category) => [category.id, category]));
  const whatsapp = whatsappLink(config.data?.whatsappNumber, "Olá! Vim pelo site e gostaria de fazer um pedido.");
  const cartCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="relative overflow-hidden">
        <div className="container-page grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="animate-slide-up space-y-6">
            <p className="eyebrow">{content.heroEyebrow ?? config.data?.publicLocationLabel ?? " "}</p>
            <h1 className="text-balance font-display text-[2.6rem] font-semibold leading-[1.02] text-cocoa-900 sm:text-6xl lg:text-7xl">
              {content.heroTitle ?? (config.isLoading ? <span className="skeleton block h-32 w-full rounded-2xl" /> : storeName)}
            </h1>
            {content.heroSubtitle && <p className="max-w-xl text-lg leading-relaxed text-cocoa-700">{content.heroSubtitle}</p>}
            <div className="flex flex-wrap gap-3">
              <ButtonLink to="/produtos" size="lg" icon={<ArrowRight className="size-5" aria-hidden />} className="flex-row-reverse">
                Ver cardápio
              </ButtonLink>
              {cartCount > 0 ? (
                <ButtonLink to="/carrinho" size="lg" variant="secondary" icon={<ShoppingBag className="size-5" aria-hidden />}>
                  Fazer pedido ({cartCount})
                </ButtonLink>
              ) : (
                <a href="#destaques" className={buttonClasses("secondary", "lg")}>
                  <ShoppingBag className="size-5" aria-hidden /> Fazer pedido
                </a>
              )}
            </div>
            {config.data && (
              <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-cocoa-700">
                <li className="inline-flex items-center gap-2">
                  <span className={`size-2 rounded-full ${config.data.isOpenNow ? "bg-sage-600" : "bg-cocoa-400"}`} aria-hidden />
                  {config.data.isOpenNow ? "Aberto agora" : "Fechado agora · agende seu pedido"}
                </li>
                {config.data.pickupEnabled && (
                  <li className="inline-flex items-center gap-2"><Package className="size-4" aria-hidden /> Retirada</li>
                )}
                {config.data.deliveryEnabled && (
                  <li className="inline-flex items-center gap-2"><Truck className="size-4" aria-hidden /> Entrega em {config.data.publicLocationLabel.split(" - ")[0]}</li>
                )}
              </ul>
            )}
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-butter-100" aria-hidden />
            <div className="aspect-[4/5] overflow-hidden rounded-[2rem] shadow-[var(--shadow-lift)]">
              {heroProduct ? (
                <ProductImage product={heroProduct} priority sizes="(min-width: 1024px) 40vw, 90vw" />
              ) : (
                <CookieIllustration seed="hero" name="cookie" className="h-full w-full" />
              )}
            </div>
            {heroProduct && (
              <Link
                to={`/produto/${heroProduct.slug}`}
                className="absolute -bottom-5 left-5 right-5 flex items-center justify-between gap-3 rounded-2xl bg-white/95 p-4 shadow-[var(--shadow-soft)] backdrop-blur sm:left-auto sm:w-72"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-caramel-600">Destaque</span>
                  <span className="font-display text-lg leading-tight">{heroProduct.name}</span>
                </span>
                <span className="whitespace-nowrap font-semibold tabular-nums">{formatBRL(heroProduct.price_cents)}</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Destaques -------------------------------------------------------- */}
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

      {/* Diferenciais ----------------------------------------------------- */}
      {content.differentials && content.differentials.length > 0 && (
        <section className="bg-cream-100 py-16">
          <div className="container-page grid gap-8 sm:grid-cols-3">
            {content.differentials.slice(0, 3).map((item, index) => {
              const Icon = DIFFERENTIAL_ICONS[index % DIFFERENTIAL_ICONS.length];
              return (
                <div key={item.title} className="space-y-3">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white text-caramel-600 shadow-[var(--shadow-soft)]">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="font-display text-xl">{item.title}</h3>
                  <p className="text-cocoa-700">{item.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Como funciona ---------------------------------------------------- */}
      <section className="container-page py-16" aria-labelledby="como-funciona">
        <div className="mb-10 max-w-2xl space-y-2">
          <p className="eyebrow">Como funciona</p>
          <h2 id="como-funciona" className="font-display text-3xl sm:text-4xl">Do forno até você em três passos</h2>
        </div>
        <ol className="grid gap-6 sm:grid-cols-3">
          {[
            { title: "Escolha seus cookies", text: "Monte o pedido pelo cardápio. Estoque e preços são atualizados em tempo real." },
            {
              title: "Retirada ou entrega",
              text: config.data?.deliveryEnabled
                ? "Escolha o horário. A taxa de entrega é calculada pela distância real até o seu endereço."
                : "Escolha o melhor horário para retirar.",
            },
            {
              title: "Pague do seu jeito",
              text: `${(config.data?.paymentMethods ?? []).map((m) => ({ PIX: "PIX", CASH: "dinheiro", CARD: "cartão na entrega ou retirada" })[m]).join(", ")}. Acompanhe o status pelo link do pedido.`,
            },
          ].map((step, index) => (
            <li key={step.title} className="card relative p-6">
              <span className="font-display text-5xl font-semibold text-caramel-400/70">{index + 1}</span>
              <h3 className="mt-3 font-display text-xl">{step.title}</h3>
              <p className="mt-2 text-cocoa-700">{step.text}</p>
            </li>
          ))}
        </ol>
        {config.data && (config.data.minOrderCents > 0 || config.data.freeDeliveryMinSubtotalCents) && (
          <p className="mt-6 text-sm text-cocoa-600">
            {config.data.minOrderCents > 0 && <>Pedido mínimo de {formatBRL(config.data.minOrderCents)}. </>}
            {config.data.freeDeliveryMinSubtotalCents && config.data.deliveryEnabled && (
              <>Entrega grátis em pedidos acima de {formatBRL(config.data.freeDeliveryMinSubtotalCents)}.</>
            )}
          </p>
        )}
      </section>

      {/* História --------------------------------------------------------- */}
      {(content.storyTitle || content.storyText) && (
        <section className="bg-cocoa-900 py-20 text-cream-100">
          <div className="container-page grid gap-12 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-5">
              <p className="eyebrow !text-caramel-300">Quem faz</p>
              <h2 className="font-display text-3xl text-cream-50 sm:text-5xl">{content.storyTitle}</h2>
              {content.storyText && <p className="text-lg leading-relaxed text-cream-200">{content.storyText}</p>}
              {config.data?.wixSiteUrl && (
                <a href={config.data.wixSiteUrl} className="inline-flex items-center gap-2 font-semibold text-caramel-300 hover:text-caramel-400">
                  Conheça nossa história <ArrowRight className="size-4" aria-hidden />
                </a>
              )}
            </div>
            {content.producers && content.producers.length > 0 && (
              <ul className="grid content-center gap-4 sm:grid-cols-2">
                {content.producers.map((producer) => (
                  <li key={producer.name} className="rounded-3xl border border-cream-50/10 bg-cream-50/5 p-6">
                    <span className="grid size-14 place-items-center rounded-full bg-caramel-500 font-display text-2xl text-white" aria-hidden>
                      {producer.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <p className="mt-4 font-display text-xl text-cream-50">{producer.name}</p>
                    {producer.role && <p className="text-sm text-cream-300">{producer.role}</p>}
                    {producer.bio && <p className="mt-2 text-sm text-cream-200">{producer.bio}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Instagram -------------------------------------------------------- */}
      {config.data?.instagramHandle && (
        <section className="container-page py-16">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-butter-100 p-8 sm:flex-row sm:items-center sm:p-10">
            <div className="space-y-2">
              <p className="eyebrow">Instagram</p>
              <h2 className="font-display text-3xl">Fornadas, novidades e bastidores</h2>
              <p className="text-cocoa-700">Acompanhe os sabores da semana em @{config.data.instagramHandle}.</p>
            </div>
            <a
              href={`https://instagram.com/${config.data.instagramHandle}`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("primary", "lg")}
            >
              <InstagramIcon className="size-5" /> Seguir @{config.data.instagramHandle}
            </a>
          </div>
        </section>
      )}

      {/* Contato ---------------------------------------------------------- */}
      {config.data && (
        <section className="container-page pb-4" aria-labelledby="contato">
          <div className="card grid gap-8 p-8 sm:grid-cols-2 sm:p-10">
            <div className="space-y-3">
              <p className="eyebrow">Contato</p>
              <h2 id="contato" className="font-display text-3xl">Ficou com alguma dúvida?</h2>
              <p className="text-cocoa-700">Fale com a gente pelo WhatsApp. Também dá para encomendar caixas para eventos e presentes.</p>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener" className={buttonClasses("success", "lg", "mt-2")}>
                  <MessageCircle className="size-5" aria-hidden /> Chamar no WhatsApp
                </a>
              )}
            </div>
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-semibold"><Clock className="size-4" aria-hidden /> Horário de funcionamento</p>
              <dl className="space-y-1.5 text-sm">
                {summarizeWeeklyHours(config.data.businessHours).map((row) => (
                  <div key={row.days} className="flex justify-between gap-4 border-b border-cream-200 pb-1.5">
                    <dt className="text-cocoa-600">{row.days}</dt>
                    <dd className="font-medium tabular-nums">{row.hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
