import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, Bike, CreditCard, QrCode, ShieldCheck, Store } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { submitOrder } from "@/api/store";
import { ProductImage } from "@/components/store/ProductImage";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ChoiceCard, Field, Input, Textarea } from "@/components/ui/Field";
import { EmptyState, ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useStoreConfig } from "@/hooks/useStore";
import { formatDateChip } from "@/lib/datetime";
import { ApiError, friendlyMessage } from "@/lib/errors";
import { clearIdempotencyKey, getIdempotencyKey } from "@/lib/idempotency";
import { PAYMENT_METHOD_LABEL, PERIOD_LABEL } from "@/lib/labels";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";
import { readJson, removeStorage, writeJson } from "@/lib/storage";
import { useCart } from "@/store/cart";
import { cartFingerprint } from "@/store/cartLogic";
import { useCartDetails } from "@/store/useCartDetails";
import type { DayPeriod, FulfillmentType, PaymentMethod } from "@/types/domain";
import { parseOrderRequest, type FieldErrors } from "@shared/validation.ts";

const DRAFT_KEY = "doceria:checkout-draft:v2";

interface AddressForm {
  street: string;
  number: string;
  district: string;
  complement: string;
  reference: string;
}

interface CheckoutForm {
  name: string;
  phone: string;
  email: string;
  fulfillment: FulfillmentType | null;
  address: AddressForm;
  date: string;
  period: DayPeriod | null;
  paymentMethod: PaymentMethod | null;
  cashChange: string;
  notes: string;
}

const EMPTY_FORM: CheckoutForm = {
  name: "",
  phone: "",
  email: "",
  fulfillment: null,
  address: { street: "", number: "", district: "", complement: "", reference: "" },
  date: "",
  period: null,
  paymentMethod: null,
  cashChange: "",
  notes: "",
};

const PAYMENT_ICONS: Record<PaymentMethod, ReactNode> = {
  PIX: <QrCode className="size-5" aria-hidden />,
  CASH: <Banknote className="size-5" aria-hidden />,
  CARD: <CreditCard className="size-5" aria-hidden />,
};

const PAYMENT_HINT: Record<PaymentMethod, string> = {
  PIX: "A chave PIX aparece depois de confirmar e também vai no seu e-mail.",
  CASH: "Pague na entrega ou na retirada.",
  CARD: "Débito ou crédito na maquininha, na entrega ou na retirada.",
};

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="card min-w-0 space-y-5 p-5 sm:p-6" aria-labelledby={`step-${number}-title`}>
      <h2 id={`step-${number}-title`} className="flex items-center gap-3 font-display text-xl">
        <span className="grid size-8 place-items-center rounded-full bg-cocoa-900 font-sans text-sm font-bold text-cream-50">{number}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chip({ selected, onClick, children, testId }: { selected: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex min-w-[4.5rem] shrink-0 flex-col items-center rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors",
        selected ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cream-300 bg-white text-cocoa-800 hover:border-cocoa-400",
      )}
    >
      {children}
    </button>
  );
}

export default function Checkout() {
  useDocumentMeta({ title: "Finalizar pedido", robots: "noindex,nofollow" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useStoreConfig();
  const cart = useCart();
  const { catalog, reconciled } = useCartDetails();

  const [form, setForm] = useState<CheckoutForm>(() => {
    const draft = readJson<Partial<CheckoutForm> | null>(DRAFT_KEY, null, "session");
    return draft ? { ...EMPTY_FORM, ...draft, address: { ...EMPTY_FORM.address, ...(draft.address ?? {}) } } : EMPTY_FORM;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverNotice, setServerNotice] = useState<{ tone: "warning" | "danger" | "info"; title: string; body?: ReactNode } | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    writeJson(DRAFT_KEY, form, "session");
  }, [form]);

  const clearError = (prefix: string) =>
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) if (key.includes(prefix)) delete next[key];
      return next;
    });
  const update = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    clearError(String(key));
  };
  const updateAddress = (key: keyof AddressForm, value: string) => {
    setForm((current) => ({ ...current, address: { ...current.address, [key]: value } }));
    clearError(`address.${key}`);
  };

  const mutation = useMutation({ mutationFn: submitOrder });

  const cfg = config.data;
  if (catalog.isError || config.isError) {
    return <ErrorState className="container-page" error={catalog.error ?? config.error} onRetry={() => { catalog.refetch(); config.refetch(); }} title="Não foi possível carregar o checkout" />;
  }
  if (!reconciled || !cfg) return <LoadingBlock label="Preparando checkout…" />;
  if (reconciled.items.length === 0 && !submittedRef.current) {
    return (
      <EmptyState
        className="container-page min-h-[50dvh] justify-center"
        title="Seu carrinho está vazio"
        description="Adicione produtos antes de finalizar."
        action={<ButtonLink to="/produtos">Ver cardápio</ButtonLink>}
      />
    );
  }

  // Escolhas válidas conforme as configurações atuais da loja.
  const fulfillment: FulfillmentType | null =
    form.fulfillment === "DELIVERY" && cfg.deliveryEnabled ? "DELIVERY"
      : form.fulfillment === "PICKUP" && cfg.pickupEnabled ? "PICKUP"
        : cfg.deliveryEnabled ? "DELIVERY" : cfg.pickupEnabled ? "PICKUP" : null;
  const isDelivery = fulfillment === "DELIVERY";
  const date = cfg.availableDates.includes(form.date) ? form.date : cfg.availableDates[0] ?? "";
  const period: DayPeriod | null = form.period && cfg.periods.includes(form.period) ? form.period : cfg.periods[0] ?? null;
  const paymentMethod: PaymentMethod | null = form.paymentMethod && cfg.paymentMethods.includes(form.paymentMethod)
    ? form.paymentMethod
    : cfg.paymentMethods[0] ?? null;

  const subtotal = reconciled.subtotalCents;
  const deliveryFee = isDelivery ? cfg.deliveryFeeCents : 0;
  const total = subtotal + deliveryFee;
  const belowMinimum = subtotal < cfg.minOrderCents;

  const blockingReason = !cfg.acceptingOrders
    ? cfg.pauseMessage || "No momento não estamos recebendo pedidos."
    : !fulfillment
      ? "Entrega e retirada estão indisponíveis no momento."
      : belowMinimum
        ? `Pedido mínimo de ${formatBRL(cfg.minOrderCents)}.`
        : !date
          ? "Não há datas disponíveis no momento. Fale com a gente pelo WhatsApp."
          : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending || blockingReason || !fulfillment || !paymentMethod || !period) return;
    setServerNotice(null);

    const cashChangeForCents = paymentMethod === "CASH" && form.cashChange.trim() ? parseBRLToCents(form.cashChange) : null;
    if (paymentMethod === "CASH" && form.cashChange.trim() && (cashChangeForCents === null || cashChangeForCents < total)) {
      setErrors({ cashChangeForCents: `Informe um valor maior que ${formatBRL(total)} ou deixe em branco.` });
      return;
    }

    const draftPayload = {
      customer: { name: form.name, phone: form.phone, email: form.email || null },
      fulfillment: { type: fulfillment, date, period, ...(isDelivery ? { address: form.address } : {}) },
      items: reconciled.items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      paymentMethod,
      cashChangeForCents,
      notes: form.notes || null,
      expectedTotalCents: total,
    };
    const idempotencyKey = getIdempotencyKey(JSON.stringify([cartFingerprint(cart.lines), draftPayload]));
    const parsed = parseOrderRequest({ idempotencyKey, ...draftPayload });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      requestAnimationFrame(() =>
        document.querySelector("[aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }

    try {
      const result = await mutation.mutateAsync(parsed.value);
      submittedRef.current = true;
      cart.clear();
      clearIdempotencyKey();
      removeStorage(DRAFT_KEY, "session");
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      navigate(`/pedido/${result.order.publicToken}?novo=1`, { replace: true });
    } catch (error) {
      handleOrderError(error);
    }
  };

  const handleOrderError = (error: unknown) => {
    const apiError = error instanceof ApiError ? error : null;
    switch (apiError?.code ?? "INTERNAL_ERROR") {
      case "PRICE_CHANGED": {
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
        queryClient.invalidateQueries({ queryKey: ["store-config"] });
        const newTotal = apiError?.data?.totalCents;
        setServerNotice({
          tone: "warning",
          title: "Os valores foram atualizados",
          body: typeof newTotal === "number"
            ? <>O novo total é <strong>{formatBRL(newTotal)}</strong>. Confira o resumo e confirme novamente.</>
            : "Confira o resumo e confirme novamente.",
        });
        break;
      }
      case "OUT_OF_STOCK":
      case "PRODUCT_UNAVAILABLE":
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
        setServerNotice({ tone: "warning", title: "Disponibilidade atualizada", body: `${friendlyMessage(apiError)} Revise o resumo e confirme novamente.` });
        break;
      case "DATE_UNAVAILABLE":
        queryClient.invalidateQueries({ queryKey: ["store-config"] });
        update("date", "");
        setServerNotice({ tone: "warning", title: "Data indisponível", body: friendlyMessage(apiError) });
        break;
      case "IDEMPOTENCY_CONFLICT":
        clearIdempotencyKey();
        setServerNotice({ tone: "warning", title: "Confirme novamente", body: "Seu pedido mudou desde a última tentativa. Toque em confirmar outra vez." });
        break;
      case "INVALID_PAYLOAD":
      case "INVALID_CUSTOMER":
      case "INVALID_ADDRESS": {
        const fields = (apiError?.data?.fields ?? {}) as FieldErrors;
        setErrors(fields);
        setServerNotice({ tone: "danger", title: "Confira os dados", body: friendlyMessage(apiError) });
        break;
      }
      default:
        // Rede, timeout, limite de tentativas, loja pausada...
        // Reenviar é seguro: a chave de idempotência é a mesma.
        setServerNotice({ tone: "danger", title: "Pedido não enviado", body: friendlyMessage(apiError) });
    }
  };

  const e = (key: string) => errors[key];

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mb-8 space-y-2">
        <Link to="/carrinho" className="text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">← Voltar ao carrinho</Link>
        <h1 className="font-display text-4xl sm:text-5xl">Finalizar pedido</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_24rem]" data-testid="checkout-form">
        <div className="min-w-0 space-y-6">
          {/* 1. Dados ----------------------------------------------------------- */}
          <Section number={1} title="Seus dados">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" error={e("customer.name")} className="sm:col-span-2">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} autoComplete="name" value={form.name} error={e("customer.name")}
                    onChange={(ev) => update("name", ev.target.value)} maxLength={120} required />
                )}
              </Field>
              <Field label="WhatsApp" error={e("customer.phone")} hint="Para falarmos sobre o pedido.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(28) 99999-9999"
                    value={form.phone} error={e("customer.phone")} onChange={(ev) => update("phone", ev.target.value)} maxLength={20} required />
                )}
              </Field>
              <Field label="E-mail" optional error={e("customer.email")} hint="Enviamos a confirmação do pedido.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="email" autoComplete="email" value={form.email} error={e("customer.email")}
                    onChange={(ev) => update("email", ev.target.value)} maxLength={254} />
                )}
              </Field>
            </div>
          </Section>

          {/* 2. Entrega ou retirada ----------------------------------------------- */}
          <Section number={2} title="Entrega ou retirada">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Forma de recebimento">
              <ChoiceCard
                name="fulfillment" value="DELIVERY" checked={fulfillment === "DELIVERY"} disabled={!cfg.deliveryEnabled}
                onChange={() => update("fulfillment", "DELIVERY")}
                icon={<Bike className="size-5" />} title={`Entrega · ${formatBRL(cfg.deliveryFeeCents)}`}
                description={cfg.deliveryEnabled ? cfg.deliveryCity : "Indisponível no momento"}
              />
              <ChoiceCard
                name="fulfillment" value="PICKUP" checked={fulfillment === "PICKUP"} disabled={!cfg.pickupEnabled}
                onChange={() => update("fulfillment", "PICKUP")}
                icon={<Store className="size-5" />} title="Retirada · grátis"
                description={cfg.pickupEnabled ? cfg.pickupAddress ?? "Endereço informado na confirmação" : "Indisponível no momento"}
              />
            </div>

            {isDelivery && (
              <div className="grid gap-4 border-t border-cream-200 pt-5 sm:grid-cols-6">
                <Field label="Rua" error={e("fulfillment.address.street")} className="sm:col-span-4">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} autoComplete="address-line1" value={form.address.street}
                      error={e("fulfillment.address.street")} onChange={(ev) => updateAddress("street", ev.target.value)} maxLength={120} />
                  )}
                </Field>
                <Field label="Número" error={e("fulfillment.address.number")} className="sm:col-span-2">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} value={form.address.number}
                      error={e("fulfillment.address.number")} onChange={(ev) => updateAddress("number", ev.target.value)} maxLength={12} />
                  )}
                </Field>
                <Field label="Bairro" error={e("fulfillment.address.district")} className="sm:col-span-3">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} value={form.address.district}
                      error={e("fulfillment.address.district")} onChange={(ev) => updateAddress("district", ev.target.value)} maxLength={80} />
                  )}
                </Field>
                <Field label="Complemento" optional className="sm:col-span-3">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} autoComplete="address-line2" placeholder="Apto, bloco, casa"
                      value={form.address.complement} onChange={(ev) => updateAddress("complement", ev.target.value)} maxLength={80} />
                  )}
                </Field>
                <Field label="Ponto de referência" optional className="sm:col-span-6">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} value={form.address.reference}
                      onChange={(ev) => updateAddress("reference", ev.target.value)} maxLength={160} />
                  )}
                </Field>
                <p className="text-sm text-cocoa-600 sm:col-span-6">Cidade: {cfg.deliveryCity}</p>
              </div>
            )}
          </Section>

          {/* 3. Quando ------------------------------------------------------------ */}
          <Section number={3} title={isDelivery ? "Quando entregar" : "Quando retirar"}>
            {cfg.availableDates.length === 0 ? (
              <Notice tone="warning" title="Sem datas disponíveis">Fale com a gente pelo WhatsApp para combinar.</Notice>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-cocoa-800">Dia</p>
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Dia">
                    {cfg.availableDates.map((key) => {
                      const chip = formatDateChip(key, cfg.today);
                      return (
                        <Chip key={key} selected={date === key} onClick={() => update("date", key)} testId={`date-${key}`}>
                          <span>{chip.top}</span>
                          <span className="text-xs font-normal opacity-80">{chip.bottom}</span>
                        </Chip>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-cocoa-800">Período</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Período">
                    {cfg.periods.map((p) => (
                      <Chip key={p} selected={period === p} onClick={() => update("period", p)} testId={`period-${p}`}>
                        {PERIOD_LABEL[p]}
                      </Chip>
                    ))}
                  </div>
                  <p className="text-xs text-cocoa-500">Confirmamos o horário exato pelo WhatsApp.</p>
                </div>
              </>
            )}
          </Section>

          {/* 4. Pagamento ---------------------------------------------------------- */}
          <Section number={4} title="Pagamento">
            <div className="grid gap-3" role="radiogroup" aria-label="Forma de pagamento">
              {cfg.paymentMethods.map((method) => (
                <ChoiceCard key={method} name="payment" value={method} checked={paymentMethod === method}
                  onChange={() => update("paymentMethod", method)} icon={PAYMENT_ICONS[method]}
                  title={PAYMENT_METHOD_LABEL[method]} description={PAYMENT_HINT[method]} />
              ))}
            </div>
            {paymentMethod === "CASH" && (
              <Field label="Troco para quanto?" optional error={e("cashChangeForCents")} hint="Deixe em branco se não precisar de troco.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} inputMode="decimal" placeholder="R$ 50,00" value={form.cashChange}
                    error={e("cashChangeForCents")} onChange={(ev) => update("cashChange", ev.target.value)} className="max-w-48" />
                )}
              </Field>
            )}
            <Field label="Observações" optional error={e("notes")}>
              {({ id, describedBy }) => (
                <Textarea id={id} aria-describedby={describedBy} value={form.notes} onChange={(ev) => update("notes", ev.target.value)}
                  maxLength={500} placeholder="Ex.: é para presente, tocar o interfone 12." />
              )}
            </Field>
          </Section>
        </div>

        {/* Resumo ------------------------------------------------------------------ */}
        <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit" aria-label="Resumo do pedido">
          <div className="card space-y-5 p-5 sm:p-6">
            <h2 className="font-display text-xl">Resumo</h2>
            <ul className="space-y-3">
              {reconciled.items.map((item) => (
                <li key={item.product.id} className="flex items-center gap-3 text-sm">
                  <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-cream-100"><ProductImage product={item.product} /></span>
                  <span className="flex-1"><span className="font-semibold">{item.quantity}x</span> {item.product.name}</span>
                  <span className="tabular-nums">{formatBRL(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 border-t border-cream-200 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-cocoa-600">Subtotal</dt><dd className="tabular-nums" data-testid="summary-subtotal">{formatBRL(subtotal)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-cocoa-600">{isDelivery ? "Entrega" : "Retirada"}</dt>
                <dd className="tabular-nums" data-testid="summary-delivery">{isDelivery ? formatBRL(deliveryFee) : "grátis"}</dd>
              </div>
              <div className="flex justify-between border-t border-cream-200 pt-3 text-lg">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold tabular-nums" data-testid="summary-total">{formatBRL(total)}</dd>
              </div>
            </dl>

            {serverNotice && <Notice tone={serverNotice.tone} title={serverNotice.title}>{serverNotice.body}</Notice>}
            {blockingReason && !serverNotice && <p className="text-sm text-cocoa-600" data-testid="blocking-reason">{blockingReason}</p>}

            <Button type="submit" size="lg" block loading={mutation.isPending} disabled={Boolean(blockingReason)} data-testid="place-order">
              {mutation.isPending ? "Enviando pedido…" : `Confirmar pedido · ${formatBRL(total)}`}
            </Button>
            <p className="flex items-start gap-2 text-xs text-cocoa-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Usamos seus dados só para preparar, entregar e falar sobre este pedido. Veja a{" "}
                <Link to="/privacidade" className="underline">política de privacidade</Link>.
              </span>
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
