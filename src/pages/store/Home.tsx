import "@fontsource/dm-serif-display/latin-400.css";
import "@fontsource/dm-serif-display/latin-400-italic.css";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { InstagramIcon } from "@/components/store/InstagramIcon";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { useAddToCart } from "@/hooks/useAddToCart";
import { useCatalog, useStoreConfig } from "@/hooks/useStore";
import { storeUrl } from "@/lib/env";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";
import { whatsappLink } from "@/lib/whatsapp";
import { useCart } from "@/store/cart";

// Cookies decorativos da primeira dobra (public/marca), posições do design.
const HERO_COOKIES: Array<{ src: string; float: "a" | "b"; style: CSSProperties }> = [
  { src: "cookie-1.webp", float: "a", style: { top: "-4%", left: "50%", width: "clamp(84px, 20vw, 230px)", "--r": "8deg", "--float-duration": "7s" } as CSSProperties },
  { src: "cookie-2.webp", float: "b", style: { top: "24%", left: "-2%", width: "clamp(78px, 18vw, 205px)", "--r": "-10deg", "--float-duration": "8.5s" } as CSSProperties },
  { src: "cookie-3.webp", float: "a", style: { top: "30%", right: "-3%", width: "clamp(78px, 18vw, 200px)", "--r": "12deg", "--float-duration": "9s" } as CSSProperties },
  { src: "cookie-4.webp", float: "b", style: { bottom: "-10%", left: "16%", width: "clamp(70px, 16vw, 185px)", "--r": "-6deg", "--float-duration": "7.8s" } as CSSProperties },
  { src: "cookie-5.webp", float: "a", style: { bottom: "-6%", right: "20%", width: "clamp(48px, 11vw, 120px)", "--r": "14deg", "--float-duration": "6.5s" } as CSSProperties },
];

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
  // "Montar sua caixa": categoria de caixas, se existir; senão o cardápio completo.
  const boxesCategory = (catalog.data?.categories ?? []).find((category) => category.slug.includes("caixa"));
  const boxesHref = boxesCategory ? `/produtos?categoria=${boxesCategory.slug}` : "/produtos";
  const categoriesById = new Map((catalog.data?.categories ?? []).map((category) => [category.id, category]));
  const whatsapp = whatsappLink(config.data?.whatsappPhone, "Olá! Vim pelo site e tenho uma dúvida.");
  const instagramHandle = config.data?.instagramUrl?.replace(/\/$/, "").split("/").pop();
  const cartCount = cart.lines.reduce((sum, line) => sum + line.quantity, 0);
  const payments = (config.data?.paymentMethods ?? []).map((m) => PAYMENT_METHOD_LABEL[m].toLowerCase()).join(", ");

  return (
    <>
      {/* Destaque ----------------------------------------------------------
          Primeira dobra do design da marca: selo, título com cookies
          flutuando ao redor, texto e um botão. Cookies são decorativos. */}
      <section className="relative overflow-hidden bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center px-5 pb-12 pt-10 text-center sm:px-10 sm:pb-20 sm:pt-16 lg:pb-24">
          <p className="mb-12 inline-flex items-center gap-2.5 rounded-full border border-[#E7DAC2] bg-white py-2 pl-2.5 pr-4 sm:mb-8">
            <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-[#FFC73A] text-xs" aria-hidden>✦</span>
            <span className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[1.2px] text-[#8A4B1E] sm:text-[12.5px] sm:tracking-[1.6px]">Feito à mão em pequenos lotes</span>
          </p>

          <div className="relative mx-auto w-full max-w-[920px]">
            <div className="pointer-events-none absolute inset-x-[-4%] inset-y-[-14%] z-[1] sm:inset-x-[-8%] sm:bottom-[-18%]" aria-hidden>
              {HERO_COOKIES.map((cookie, index) => (
                <img key={cookie.src} src={`${import.meta.env.BASE_URL}marca/${cookie.src}`} alt="" decoding="async"
                  className="hero-cookie" data-float={cookie.float} data-pos={index + 1} style={cookie.style} />
              ))}
            </div>
            <h1 className="relative z-[2] text-balance font-hero text-[clamp(44px,8.4vw,108px)] leading-[0.95] tracking-[-1.5px] text-[#2C1A0E] [text-shadow:0_0_18px_#fff,0_0_10px_#fff,0_0_40px_#ffffffee]">
              Cookies artesanais,<br /><span className="italic text-[#F2A81C]">assados</span> com afeto.
            </h1>
          </div>

          <p className="relative z-[2] mt-12 max-w-[520px] text-pretty text-[clamp(16px,1.3vw,18px)] leading-relaxed text-[#5A4330] sm:mt-8">
            Massa fermentada com calma, manteiga de verdade e chocolate que escorre quente. Cada fornada sai crocante por fora e macia no centro, do nosso forno direto pra sua mesa em Cachoeiro de Itapemirim.
          </p>

          <div className="relative z-[2] mt-7 flex flex-wrap items-center justify-center gap-3.5 sm:mt-9">
            <Link to={boxesHref}
              className="inline-flex items-center gap-2.5 rounded-full bg-[#2C1A0E] px-[30px] py-[17px] text-base font-bold text-[#F3E6C9] transition-colors hover:bg-[#452915]">
              Montar sua caixa <span aria-hidden>→</span>
            </Link>
            {cartCount > 0 && (
              <Link to="/carrinho"
                className="inline-flex items-center rounded-full border border-[#E7DAC2] bg-[#FBF3E2] px-[26px] py-4 text-base font-bold text-[#2C1A0E] transition-colors hover:bg-[#F5E7C8]">
                Finalizar pedido ({cartCount})
              </Link>
            )}
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
