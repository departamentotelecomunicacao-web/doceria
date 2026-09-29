import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, CreditCard, Loader2, MapPin, MessageCircle, Package, QrCode, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { submitOrder } from "@/api/store";
import { ProductImage } from "@/components/store/ProductImage";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import { ChoiceCard, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { EmptyState, ErrorState, LoadingBlock, Notice } from "@/components/ui/States";
import { useCepLookup } from "@/hooks/useCepLookup";
import { useDeliveryQuote } from "@/hooks/useDeliveryQuote";
import { useSlots, useStoreConfig } from "@/hooks/useStore";
import { centsToValue, track } from "@/lib/analytics";
import { formatSlot } from "@/lib/datetime";
import { ApiError, friendlyMessage } from "@/lib/errors";
import { clearIdempotencyKey, getIdempotencyKey } from "@/lib/idempotency";
import { PAYMENT_METHOD_LABEL } from "@/lib/labels";
import { formatBRL, formatDistanceKm, parseBRLToCents } from "@/lib/money";
import { useDocumentMeta } from "@/lib/seo";
import { readJson, removeStorage, writeJson } from "@/lib/storage";
import { buildDeliveryHelpMessage, formatAddressLine, whatsappLink } from "@/lib/whatsapp";
import { useCart } from "@/store/cart";
import { cartFingerprint } from "@/store/cartLogic";
import { useCartDetails } from "@/store/useCartDetails";
import type { FulfillmentType, PaymentMethod } from "@/types/domain";
import { parseOrderRequest, type AddressInput, type FieldErrors } from "@shared/validation.ts";

const DRAFT_KEY = "doceria:checkout-draft:v1";

interface CheckoutForm {
  name: string;
  phone: string;
  email: string;
  fulfillment: FulfillmentType | null;
  address: AddressInput;
  slot: string;
  paymentMethod: PaymentMethod | null;
  cashChange: string;
  notes: string;
}

const EMPTY_FORM: CheckoutForm = {
  name: "",
  phone: "",
  email: "",
  fulfillment: null,
  address: { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "Cachoeiro de Itapemirim", state: "ES", reference: "" },
  slot: "",
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
  PIX: "Você recebe a chave PIX após confirmar. O pedido é confirmado após a conferência do pagamento.",
  CASH: "Pague no momento da retirada ou entrega.",
  CARD: "Débito ou crédito na maquininha, na retirada ou entrega.",
};

function Section({ number, title, children, id }: { number: number; title: string; children: ReactNode; id?: string }) {
  return (
    <section className="card space-y-5 p-5 sm:p-6" aria-labelledby={`${id ?? `step-${number}`}-title`}>
      <h2 id={`${id ?? `step-${number}`}-title`} className="flex items-center gap-3 font-display text-xl">
        <span className="grid size-8 place-items-center rounded-full bg-cocoa-900 font-sans text-sm font-bold text-cream-50">{number}</span>
        {title}
      </h2>
      {children}
    </section>
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
    const { ...draft } = form;
    writeJson(DRAFT_KEY, draft, "session");
  }, [form]);

  const update = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      for (const errorKey of Object.keys(next)) {
        if (errorKey.includes(String(key))) delete next[errorKey];
      }
      return next;
    });
  };
  const updateAddress = (key: keyof AddressInput, value: string) => {
    setForm((current) => ({ ...current, address: { ...current.address, [key]: value } }));
    setErrors((current) => {
      const next = { ...current };
      delete next[`fulfillment.address.${key}`];
      return next;
    });
  };

  // Opções vindas das configurações da loja
  const cfg = config.data;
  const fulfillment: FulfillmentType | null = form.fulfillment
    ?? (cfg ? (cfg.pickupEnabled ? "PICKUP" : cfg.deliveryEnabled ? "DELIVERY" : null) : null);
  const paymentMethod: PaymentMethod | null = form.paymentMethod && cfg?.paymentMethods.includes(form.paymentMethod)
    ? form.paymentMethod
    : cfg?.paymentMethods[0] ?? null;

  // Autopreenchimento por CEP
  const cepLookup = useCepLookup(form.address.cep);
  const autofilledCep = useRef<string | null>(null);
  useEffect(() => {
    if (!cepLookup.data || autofilledCep.current === cepLookup.cep) return;
    autofilledCep.current = cepLookup.cep;
    const data = cepLookup.data;
    setForm((current) => ({
      ...current,
      address: {
        ...current.address,
        street: data.street || current.address.street,
        neighborhood: data.neighborhood || current.address.neighborhood,
        city: data.city || current.address.city,
        state: data.state || current.address.state,
      },
    }));
  }, [cepLookup]);

  const subtotal = reconciled?.subtotalCents ?? 0;
  const isDelivery = fulfillment === "DELIVERY";
  const { state: quoteState, refresh: refreshQuote, addressComplete } = useDeliveryQuote(form.address, subtotal, isDelivery);
  const slots = useSlots(fulfillment ?? "PICKUP", Boolean(fulfillment));

  const slotList = useMemo(() => slots.data ?? [], [slots.data]);
  const selectedSlot = slotList.find((slot) => slot.start === form.slot) ?? slotList[0];

  const quote = quoteState.status === "ready" ? quoteState.quote : null;
  const deliveryFee = isDelivery ? (quote?.available ? quote.feeCents ?? 0 : null) : 0;
  const total = deliveryFee === null ? null : subtotal + deliveryFee;

  // Evento begin_checkout uma vez por visita ao checkout com itens.
  const trackedBegin = useRef(false);
  useEffect(() => {
    if (trackedBegin.current || !reconciled || reconciled.items.length === 0) return;
    trackedBegin.current = true;
    track("begin_checkout", {
      value: centsToValue(reconciled.subtotalCents),
      items: reconciled.items.map((item) => ({
        item_id: item.product.id,
        item_name: item.product.name,
        price: centsToValue(item.product.price_cents),
        quantity: item.quantity,
      })),
    });
  }, [reconciled]);

  const mutation = useMutation({ mutationFn: submitOrder });

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

  const addressLine = formatAddressLine(form.address);
  const whatsappHelp = whatsappLink(
    cfg.whatsappNumber,
    buildDeliveryHelpMessage({
      items: reconciled.items.map((item) => ({ name: item.product.name, quantity: item.quantity })),
      addressLine,
    }),
  );
  const belowMinimum = subtotal < cfg.minOrderCents;
  const deliveryBlocked = isDelivery && !(quote && quote.available);

  const blockingReason = !cfg.acceptingOrders
    ? cfg.pauseMessage || "No momento não estamos recebendo pedidos."
    : !fulfillment
      ? "Retirada e entrega estão indisponíveis no momento."
      : belowMinimum
        ? `Pedido mínimo de ${formatBRL(cfg.minOrderCents)}.`
        : slots.isSuccess && slotList.length === 0
          ? "Não há horários disponíveis nos próximos dias."
          : isDelivery && !addressComplete
            ? "Informe o endereço completo para calcular a entrega."
            : isDelivery && quoteState.status === "loading"
              ? "Calculando a entrega…"
              : deliveryBlocked
                ? "Entrega indisponível para este endereço."
                : null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending || blockingReason || total === null || !selectedSlot || !fulfillment || !paymentMethod) return;
    setServerNotice(null);

    const cashChangeForCents = paymentMethod === "CASH" && form.cashChange.trim()
      ? parseBRLToCents(form.cashChange)
      : null;
    if (paymentMethod === "CASH" && form.cashChange.trim() && (cashChangeForCents === null || cashChangeForCents < total)) {
      setErrors({ cashChangeForCents: `Informe um valor maior que ${formatBRL(total)} ou deixe em branco.` });
      return;
    }

    const draftPayload = {
      customer: { name: form.name, phone: form.phone, email: form.email || null },
      fulfillment: {
        type: fulfillment,
        scheduledFor: selectedSlot.start,
        ...(isDelivery ? { address: form.address } : {}),
      },
      items: reconciled.items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      paymentMethod,
      cashChangeForCents,
      notes: form.notes || null,
      expectedTotalCents: total,
    };
    const idempotencyKey = getIdempotencyKey(
      JSON.stringify([cartFingerprint(cart.lines), draftPayload]),
    );
    const parsed = parseOrderRequest({ idempotencyKey, ...draftPayload });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      document.querySelector("[aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      const result = await mutation.mutateAsync(parsed.value);
      submittedRef.current = true;
      const { order } = result;
      writeJson(`doceria:order-extra:${order.publicToken}`, {
        addressLine: isDelivery ? addressLine : null,
        scheduleLabel: formatSlot(selectedSlot),
      }, "session");
      track("order_created", {
        transaction_id: order.code,
        value: centsToValue(order.totalCents),
        items: reconciled.items.map((item) => ({
          item_id: item.product.id,
          item_name: item.product.name,
          price: centsToValue(item.product.price_cents),
          quantity: item.quantity,
        })),
      }, { dedupeKey: order.code });
      cart.clear();
      clearIdempotencyKey();
      removeStorage(DRAFT_KEY, "session");
      queryClient.invalidateQueries({ queryKey: ["catalog"] });
      navigate(`/pedido/${order.publicToken}?novo=1`, { replace: true });
    } catch (error) {
      handleOrderError(error);
    }
  };

  const handleOrderError = (error: unknown) => {
    const apiError = error instanceof ApiError ? error : null;
    const code = apiError?.code ?? "INTERNAL_ERROR";
    switch (code) {
      case "PRICE_CHANGED": {
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
        refreshQuote();
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
      case "QUANTITY_LIMIT":
        queryClient.invalidateQueries({ queryKey: ["catalog"] });
        setServerNotice({ tone: "warning", title: "Estoque atualizado", body: friendlyMessage(apiError) + " Revise o resumo e confirme novamente." });
        break;
      case "SLOT_UNAVAILABLE":
        queryClient.invalidateQueries({ queryKey: ["slots"] });
        update("slot", "");
        setServerNotice({ tone: "warning", title: "Horário indisponível", body: friendlyMessage(apiError) });
        break;
      case "IDEMPOTENCY_CONFLICT":
        clearIdempotencyKey();
        setServerNotice({ tone: "warning", title: "Confirme novamente", body: "Seu pedido mudou desde a última tentativa. Toque em confirmar outra vez." });
        break;
      case "INVALID_PAYLOAD":
      case "INVALID_CUSTOMER":
      case "INVALID_ADDRESS": {
        const fields = (apiError?.data?.fields ?? {}) as FieldErrors;
        const field = apiError?.data?.field as string | undefined;
        setErrors(Object.keys(fields).length ? fields : field ? { [`fulfillment.address.${field}`]: friendlyMessage(apiError) } : {});
        setServerNotice({ tone: "danger", title: "Confira os dados", body: friendlyMessage(apiError) });
        break;
      }
      case "ROUTING_UNAVAILABLE":
      case "DELIVERY_NOT_CONFIGURED":
      case "ADDRESS_NOT_FOUND":
      case "ADDRESS_IMPRECISE":
      case "DELIVERY_UNAVAILABLE":
      case "DELIVERY_QUOTE_INVALID":
        refreshQuote();
        setServerNotice({ tone: "danger", title: "Entrega não confirmada", body: friendlyMessage(apiError) });
        break;
      default:
        // Rede, timeout, limite de tentativas, loja pausada, pedido mínimo...
        // Reenviar é seguro: a chave de idempotência é a mesma.
        setServerNotice({ tone: "danger", title: "Pedido não enviado", body: friendlyMessage(apiError) });
    }
  };

  const summaryItems = reconciled.items;

  return (
    <div className="container-page py-8 sm:py-12">
      <div className="mb-8 space-y-2">
        <Link to="/carrinho" className="text-sm font-semibold text-cocoa-700 hover:text-cocoa-900">← Voltar ao carrinho</Link>
        <h1 className="font-display text-4xl sm:text-5xl">Finalizar pedido</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="grid gap-8 lg:grid-cols-[1fr_24rem]" data-testid="checkout-form">
        <div className="space-y-6">
          {/* 1. Dados --------------------------------------------------------- */}
          <Section number={1} title="Seus dados">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" error={errors["customer.name"]} className="sm:col-span-2">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} autoComplete="name" value={form.name} error={errors["customer.name"]}
                    onChange={(e) => update("name", e.target.value)} maxLength={120} required />
                )}
              </Field>
              <Field label="WhatsApp / telefone" error={errors["customer.phone"]} hint="Usamos para falar sobre o pedido.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(28) 99999-9999"
                    value={form.phone} error={errors["customer.phone"]} onChange={(e) => update("phone", e.target.value)} maxLength={20} required />
                )}
              </Field>
              <Field label="E-mail" optional error={errors["customer.email"]}>
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} type="email" autoComplete="email" value={form.email} error={errors["customer.email"]}
                    onChange={(e) => update("email", e.target.value)} maxLength={254} />
                )}
              </Field>
            </div>
          </Section>

          {/* 2. Recebimento ---------------------------------------------------- */}
          <Section number={2} title="Como quer receber">
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Forma de recebimento">
              <ChoiceCard
                name="fulfillment" value="PICKUP" checked={fulfillment === "PICKUP"} disabled={!cfg.pickupEnabled}
                onChange={() => update("fulfillment", "PICKUP")}
                icon={<Package className="size-5" />} title="Retirada"
                description={cfg.pickupEnabled ? `Grátis. ${cfg.publicLocationLabel}` : "Indisponível no momento"}
              />
              <ChoiceCard
                name="fulfillment" value="DELIVERY" checked={fulfillment === "DELIVERY"} disabled={!cfg.deliveryEnabled}
                onChange={() => update("fulfillment", "DELIVERY")}
                icon={<Truck className="size-5" />} title="Entrega"
                description={cfg.deliveryEnabled ? "Taxa pela distância real da rota" : "Indisponível no momento"}
              />
            </div>
            {fulfillment === "PICKUP" && (
              <p className="text-sm text-cocoa-600">O endereço exato de retirada aparece na página do pedido após a confirmação.</p>
            )}
          </Section>

          {/* 3. Endereço ------------------------------------------------------- */}
          {isDelivery && (
            <Section number={3} title="Endereço de entrega">
              <div className="grid gap-4 sm:grid-cols-6">
                <Field label="CEP" error={errors["fulfillment.address.cep"]} className="sm:col-span-2"
                  hint={cepLookup.loading ? "Buscando endereço…" : undefined}>
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} inputMode="numeric" autoComplete="postal-code" placeholder="29300-000"
                      value={form.address.cep} error={errors["fulfillment.address.cep"]} maxLength={9}
                      onChange={(e) => updateAddress("cep", e.target.value)} />
                  )}
                </Field>
                <Field label="Rua" error={errors["fulfillment.address.street"]} className="sm:col-span-4">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} autoComplete="address-line1" value={form.address.street}
                      error={errors["fulfillment.address.street"]} onChange={(e) => updateAddress("street", e.target.value)} maxLength={120} />
                  )}
                </Field>
                <Field label="Número" error={errors["fulfillment.address.number"]} className="sm:col-span-2">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} inputMode="text" value={form.address.number}
                      error={errors["fulfillment.address.number"]} onChange={(e) => updateAddress("number", e.target.value)} maxLength={12} />
                  )}
                </Field>
                <Field label="Complemento" optional error={errors["fulfillment.address.complement"]} className="sm:col-span-4">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} autoComplete="address-line2" placeholder="Apto, bloco, casa"
                      value={form.address.complement ?? ""} onChange={(e) => updateAddress("complement", e.target.value)} maxLength={80} />
                  )}
                </Field>
                <Field label="Bairro" error={errors["fulfillment.address.neighborhood"]} className="sm:col-span-3">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} value={form.address.neighborhood}
                      error={errors["fulfillment.address.neighborhood"]} onChange={(e) => updateAddress("neighborhood", e.target.value)} maxLength={80} />
                  )}
                </Field>
                <Field label="Cidade" error={errors["fulfillment.address.city"]} className="sm:col-span-2">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} autoComplete="address-level2" value={form.address.city}
                      error={errors["fulfillment.address.city"]} onChange={(e) => updateAddress("city", e.target.value)} maxLength={80} />
                  )}
                </Field>
                <Field label="UF" error={errors["fulfillment.address.state"]} className="sm:col-span-1">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} autoComplete="address-level1" value={form.address.state}
                      error={errors["fulfillment.address.state"]} onChange={(e) => updateAddress("state", e.target.value.toUpperCase())} maxLength={2} />
                  )}
                </Field>
                <Field label="Ponto de referência" optional className="sm:col-span-6">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} value={form.address.reference ?? ""}
                      onChange={(e) => updateAddress("reference", e.target.value)} maxLength={160} />
                  )}
                </Field>
              </div>

              <div aria-live="polite" data-testid="delivery-quote">
                {!addressComplete && (
                  <p className="flex items-center gap-2 text-sm text-cocoa-600">
                    <MapPin className="size-4" aria-hidden /> Preencha o endereço completo para calcular a entrega.
                  </p>
                )}
                {addressComplete && quoteState.status === "loading" && (
                  <p className="flex items-center gap-2 text-sm text-cocoa-700">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Calculando a entrega pela rota…
                  </p>
                )}
                {quote && quote.available && (
                  <Notice tone="success" title={quote.freeDeliveryApplied ? "Entrega grátis!" : `Entrega: ${formatBRL(quote.feeCents)}`}>
                    {formatDistanceKm(quote.distanceMeters)} de rota
                    {quote.durationMinutes ? ` · cerca de ${quote.durationMinutes} min de trajeto` : ""}
                  </Notice>
                )}
                {quote && !quote.available && (
                  <Notice tone="warning" title="Fora da nossa área de entrega">
                    <p>
                      Este endereço fica a {formatDistanceKm(quote.distanceMeters)}
                      {quote.maxDistanceMeters ? `, acima do limite de ${formatDistanceKm(quote.maxDistanceMeters)}` : ""}.
                      Você pode escolher retirada ou combinar pelo WhatsApp.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {cfg.pickupEnabled && <Button size="sm" variant="secondary" onClick={() => update("fulfillment", "PICKUP")}>Mudar para retirada</Button>}
                      {whatsappHelp && <a href={whatsappHelp} target="_blank" rel="noopener" className={buttonClasses("success", "sm")}><MessageCircle className="size-4" aria-hidden /> Continuar pelo WhatsApp</a>}
                    </div>
                  </Notice>
                )}
                {quoteState.status === "error" && (
                  <Notice tone="danger" title={quoteState.error.code.startsWith("ADDRESS_") ? "Endereço não localizado" : "Não foi possível calcular a entrega automaticamente."}>
                    <p>{quoteState.error.code.startsWith("ADDRESS_") ? friendlyMessage(quoteState.error) : "Você pode tentar de novo, escolher retirada ou continuar pelo WhatsApp."}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={refreshQuote}>Tentar de novo</Button>
                      {cfg.pickupEnabled && <Button size="sm" variant="secondary" onClick={() => update("fulfillment", "PICKUP")}>Mudar para retirada</Button>}
                      {whatsappHelp && <a href={whatsappHelp} target="_blank" rel="noopener" className={buttonClasses("success", "sm")} data-testid="whatsapp-fallback"><MessageCircle className="size-4" aria-hidden /> Continuar pelo WhatsApp</a>}
                    </div>
                  </Notice>
                )}
              </div>
            </Section>
          )}

          {/* 4. Quando ---------------------------------------------------------- */}
          <Section number={isDelivery ? 4 : 3} title={isDelivery ? "Quando entregar" : "Quando retirar"}>
            {slots.isLoading ? (
              <p className="text-sm text-cocoa-600">Carregando horários…</p>
            ) : slots.isError ? (
              <Notice tone="danger" title="Não foi possível carregar os horários">
                <Button size="sm" variant="secondary" onClick={() => slots.refetch()}>Tentar de novo</Button>
              </Notice>
            ) : slotList.length === 0 ? (
              <Notice tone="warning" title="Sem horários disponíveis">
                Não há janelas livres nos próximos dias. Fale com a gente pelo WhatsApp.
              </Notice>
            ) : (
              <Field label="Horário" hint={`Horários de Brasília. Antecedência mínima de ${cfg.minLeadTimeMinutes} min.`}>
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} value={selectedSlot?.start ?? ""} onChange={(e) => update("slot", e.target.value)} data-testid="slot-select">
                    {slotList.map((slot) => (
                      <option key={slot.start} value={slot.start}>{formatSlot(slot)}</option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </Section>

          {/* 5. Pagamento ------------------------------------------------------- */}
          <Section number={isDelivery ? 5 : 4} title="Pagamento">
            <div className="grid gap-3" role="radiogroup" aria-label="Forma de pagamento">
              {cfg.paymentMethods.map((method) => (
                <ChoiceCard key={method} name="payment" value={method} checked={paymentMethod === method}
                  onChange={() => update("paymentMethod", method)} icon={PAYMENT_ICONS[method]}
                  title={PAYMENT_METHOD_LABEL[method]} description={PAYMENT_HINT[method]} />
              ))}
            </div>
            {paymentMethod === "CASH" && (
              <Field label="Troco para quanto?" optional error={errors.cashChangeForCents} hint="Deixe em branco se não precisar de troco.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} inputMode="decimal" placeholder="R$ 50,00" value={form.cashChange}
                    error={errors.cashChangeForCents} onChange={(e) => update("cashChange", e.target.value)} className="max-w-48" />
                )}
              </Field>
            )}
            <Field label="Observações" optional error={errors.notes}>
              {({ id, describedBy }) => (
                <Textarea id={id} aria-describedby={describedBy} value={form.notes} onChange={(e) => update("notes", e.target.value)}
                  maxLength={500} placeholder="Ex.: é para presente, tocar o interfone 12." />
              )}
            </Field>
          </Section>
        </div>

        {/* Resumo ----------------------------------------------------------------- */}
        <aside className="lg:sticky lg:top-24 lg:h-fit" aria-label="Resumo do pedido">
          <div className="card space-y-5 p-5 sm:p-6">
            <h2 className="font-display text-xl">Resumo</h2>
            <ul className="space-y-3">
              {summaryItems.map((item) => (
                <li key={item.product.id} className="flex items-center gap-3 text-sm">
                  <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-cream-100"><ProductImage product={item.product} sizes="48px" /></span>
                  <span className="flex-1"><span className="font-semibold">{item.quantity}x</span> {item.product.name}</span>
                  <span className="tabular-nums">{formatBRL(item.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 border-t border-cream-200 pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-cocoa-600">Subtotal</dt><dd className="tabular-nums" data-testid="summary-subtotal">{formatBRL(subtotal)}</dd></div>
              <div className="flex justify-between">
                <dt className="text-cocoa-600">{isDelivery ? "Entrega" : "Retirada"}</dt>
                <dd className="tabular-nums" data-testid="summary-delivery">
                  {!isDelivery ? "grátis" : deliveryFee === null ? "a calcular" : deliveryFee === 0 ? "grátis" : formatBRL(deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-cream-200 pt-3 text-lg">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold tabular-nums" data-testid="summary-total">{total === null ? "…" : formatBRL(total)}</dd>
              </div>
            </dl>

            {serverNotice && (
              <Notice tone={serverNotice.tone} title={serverNotice.title}>{serverNotice.body}</Notice>
            )}
            {blockingReason && !serverNotice && <p className="text-sm text-cocoa-600" data-testid="blocking-reason">{blockingReason}</p>}

            <Button type="submit" size="lg" block loading={mutation.isPending} disabled={Boolean(blockingReason)} data-testid="place-order">
              {mutation.isPending ? "Enviando pedido…" : `Confirmar pedido${total !== null ? ` · ${formatBRL(total)}` : ""}`}
            </Button>
            <p className="flex items-start gap-2 text-xs text-cocoa-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Usamos seus dados somente para preparar, entregar e falar sobre este pedido. Valores e estoque são confirmados pelo nosso sistema no envio.
                Veja a <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
              </span>
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
