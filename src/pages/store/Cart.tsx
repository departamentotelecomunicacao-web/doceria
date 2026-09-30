import { ArrowRight, ShoppingBag, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { Price } from "@/components/store/Price";
import { ProductImage } from "@/components/store/ProductImage";
import { ButtonLink } from "@/components/ui/Button";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { EmptyState, ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useStoreConfig } from "@/hooks/useStore";
import { formatBRL } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";
import { useCartDetails } from "@/store/useCartDetails";

export default function Cart() {
  useDocumentMeta({ title: "Carrinho", robots: "noindex,follow" });
  const { cart, catalog, reconciled } = useCartDetails();
  const config = useStoreConfig();

  if (catalog.isError) {
    return <ErrorState className="container-page" error={catalog.error} onRetry={() => catalog.refetch()} title="Não foi possível carregar o carrinho" />;
  }
  if (!reconciled) return <LoadingBlock label="Carregando carrinho…" />;

  if (reconciled.items.length === 0) {
    return (
      <EmptyState
        className="container-page min-h-[50dvh] justify-center"
        icon={<ShoppingBag className="size-6" aria-hidden />}
        title="Seu carrinho está vazio"
        description="Escolha seus sabores no cardápio. Os cookies saem em fornadas pequenas, então garanta os seus."
        action={<ButtonLink to="/produtos" size="lg">Ver cardápio</ButtonLink>}
      />
    );
  }

  const minOrder = config.data?.minOrderCents ?? 0;
  const belowMinimum = reconciled.subtotalCents < minOrder;
  const paused = config.data ? !config.data.acceptingOrders : false;

  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="mb-8 font-display text-4xl sm:text-5xl">Seu carrinho</h1>
      <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-cream-200 border-y border-cream-200" data-testid="cart-lines">
          {reconciled.items.map((item) => (
            <li key={item.product.id} className="flex gap-4 py-5" data-testid="cart-line" data-product-slug={item.product.slug}>
              <Link to={`/produto/${item.product.slug}`} className="size-24 shrink-0 overflow-hidden rounded-2xl bg-cream-100 sm:size-28">
                <ProductImage product={item.product} />
              </Link>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to={`/produto/${item.product.slug}`} className="font-display text-lg leading-tight hover:underline">{item.product.name}</Link>
                    <p className="text-sm text-cocoa-600"><Price cents={item.product.price_cents} size="sm" className="!text-cocoa-600" /> cada</p>
                  </div>
                  <p className="font-semibold tabular-nums" data-testid="line-total">{formatBRL(item.lineTotalCents)}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3">
                  <QuantityStepper
                    size="sm"
                    value={item.quantity}
                    max={item.maxQuantity}
                    onChange={(value) => cart.setQuantity(item.product.id, value, item.maxQuantity)}
                    label={`Quantidade de ${item.product.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => cart.remove(item.product.id)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-cocoa-600 hover:bg-cream-100 hover:text-berry-700"
                  >
                    <Trash2 className="size-4" aria-hidden /> Remover
                  </button>
                </div>
                {item.quantity >= item.maxQuantity && (
                  <p className="text-xs text-caramel-700">Quantidade máxima disponível no momento.</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <aside className="card h-fit space-y-4 p-6 lg:sticky lg:top-24" aria-label="Resumo">
          <h2 className="font-display text-xl">Resumo</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-cocoa-600">Subtotal ({reconciled.count} {reconciled.count === 1 ? "item" : "itens"})</dt>
              <dd className="font-semibold tabular-nums" data-testid="cart-subtotal">{formatBRL(reconciled.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-cocoa-600">Entrega</dt>
              <dd className="text-cocoa-600">
                {config.data?.deliveryEnabled ? formatBRL(config.data.deliveryFeeCents) : "indisponível"}
                {config.data?.pickupEnabled && " · retirada grátis"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-cream-200 pt-3 text-base">
              <dt className="font-semibold">Total parcial</dt>
              <dd className="font-bold tabular-nums">{formatBRL(reconciled.subtotalCents)}</dd>
            </div>
          </dl>
          {belowMinimum && (
            <Notice tone="warning" title={`Pedido mínimo de ${formatBRL(minOrder)}`}>
              Adicione mais {formatBRL(minOrder - reconciled.subtotalCents)} para finalizar.
            </Notice>
          )}
          {paused && <Notice tone="warning" title="Pedidos pausados">{config.data?.pauseMessage || "Voltamos em breve."}</Notice>}
          {belowMinimum || paused ? (
            <span className="flex h-13 w-full cursor-not-allowed items-center justify-center rounded-full bg-cocoa-900/40 font-semibold text-cream-50" aria-disabled>
              Continuar
            </span>
          ) : (
            <ButtonLink to="/checkout" size="lg" block icon={<ArrowRight className="size-5" aria-hidden />} className="flex-row-reverse" data-testid="go-to-checkout">
              Continuar
            </ButtonLink>
          )}
          <Link to="/produtos" className="block text-center text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">Adicionar mais cookies</Link>
        </aside>
      </div>
    </div>
  );
}
