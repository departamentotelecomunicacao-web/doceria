// Validação compartilhada entre o checkout (navegador) e as Edge Functions.
// Módulo sem dependências: roda em Deno, Node (Vitest) e no navegador.
// O banco revalida tudo novamente; aqui o objetivo é rejeitar cedo entradas
// malformadas e qualquer campo que o cliente não deveria enviar.

export type FulfillmentType = "PICKUP" | "DELIVERY";
export type PaymentMethod = "PIX" | "CASH" | "CARD";

export interface AddressInput {
  cep: string;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string | null;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderRequest {
  idempotencyKey: string;
  customer: { name: string; phone: string; email: string | null };
  fulfillment: { type: FulfillmentType; scheduledFor: string; address?: AddressInput };
  items: OrderItemInput[];
  paymentMethod: PaymentMethod;
  cashChangeForCents: number | null;
  notes: string | null;
  expectedTotalCents: number;
}

export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldErrors };

export const LIMITS = {
  maxOrderLines: 30,
  maxQuantity: 500,
  maxNotes: 500,
  maxCents: 10_000_000,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,100}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UF = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedKeys(obj: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((key) => !allowed.includes(key));
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function optionalText(value: unknown): string | null {
  const text = cleanText(value);
  return text === "" ? null : text;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Normaliza telefone brasileiro para E.164 (+55DDDNÚMERO).
 * Aceita "(28) 99999-1234", "28999991234", "+55 28 99999-1234", "028999991234".
 * Celular: 9 dígitos começando com 9. Fixo: 8 dígitos começando com 2 a 5.
 */
export function normalizeBrazilPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  } else if ((digits.length === 11 || digits.length === 12) && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  if (local.length === 9 && !local.startsWith("9")) return null;
  if (local.length === 8 && !/^[2-5]/.test(local)) return null;
  return `+55${digits}`;
}

export function formatBrazilPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return e164;
}

export function normalizeCep(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  return /^[0-9]{8}$/.test(digits) ? digits : null;
}

const ADDRESS_KEYS = [
  "cep", "street", "number", "complement", "neighborhood", "city", "state", "reference",
] as const;

export function validateAddress(input: unknown, prefix = "address"): ValidationResult<AddressInput> {
  const errors: FieldErrors = {};
  if (!isPlainObject(input)) {
    return { ok: false, errors: { [prefix]: "Informe o endereço de entrega." } };
  }
  for (const key of unexpectedKeys(input, ADDRESS_KEYS)) {
    errors[`${prefix}.${key}`] = "Campo não permitido.";
  }

  const cep = normalizeCep(input.cep);
  const street = cleanText(input.street);
  const number = cleanText(input.number);
  const complement = optionalText(input.complement);
  const neighborhood = cleanText(input.neighborhood);
  const city = cleanText(input.city);
  const state = cleanText(input.state).toUpperCase();
  const reference = optionalText(input.reference);

  if (!cep) errors[`${prefix}.cep`] = "CEP inválido.";
  if (street.length < 2 || street.length > 120) errors[`${prefix}.street`] = "Informe a rua.";
  if (number.length < 1 || number.length > 12) errors[`${prefix}.number`] = "Informe o número (ou S/N).";
  if (complement && complement.length > 80) errors[`${prefix}.complement`] = "Complemento muito longo.";
  if (neighborhood.length < 2 || neighborhood.length > 80) errors[`${prefix}.neighborhood`] = "Informe o bairro.";
  if (city.length < 2 || city.length > 80) errors[`${prefix}.city`] = "Informe a cidade.";
  if (!UF.has(state)) errors[`${prefix}.state`] = "Estado inválido.";
  if (reference && reference.length > 160) errors[`${prefix}.reference`] = "Referência muito longa.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { cep: cep!, street, number, complement, neighborhood, city, state, reference },
  };
}

/** Endereço completo o suficiente para pedir cotação (evita chamadas à API de mapas). */
export function isAddressReadyForQuote(input: Partial<AddressInput>): boolean {
  return validateAddress(input).ok;
}

const ORDER_KEYS = [
  "idempotencyKey", "customer", "fulfillment", "items", "paymentMethod",
  "cashChangeForCents", "notes", "expectedTotalCents",
] as const;
const CUSTOMER_KEYS = ["name", "phone", "email"] as const;
const FULFILLMENT_KEYS = ["type", "scheduledFor", "address"] as const;
const ITEM_KEYS = ["productId", "quantity"] as const;

/**
 * Valida o corpo da criação de pedido. Qualquer campo extra (ex.: priceCents,
 * totalCents, deliveryFeeCents, distanceKm, stock) é rejeitado: valores
 * monetários e de estoque só são definidos pelo servidor.
 */
export function parseOrderRequest(input: unknown): ValidationResult<OrderRequest> {
  const errors: FieldErrors = {};
  if (!isPlainObject(input)) {
    return { ok: false, errors: { body: "Dados do pedido inválidos." } };
  }
  for (const key of unexpectedKeys(input, ORDER_KEYS)) {
    errors[key] = "Campo não permitido.";
  }

  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
  if (!IDEMPOTENCY_RE.test(idempotencyKey)) errors.idempotencyKey = "Identificador da solicitação inválido.";

  // Cliente
  let name = "";
  let phone: string | null = null;
  let email: string | null = null;
  if (!isPlainObject(input.customer)) {
    errors.customer = "Informe seus dados.";
  } else {
    for (const key of unexpectedKeys(input.customer, CUSTOMER_KEYS)) errors[`customer.${key}`] = "Campo não permitido.";
    name = cleanText(input.customer.name);
    phone = normalizeBrazilPhone(input.customer.phone);
    const rawEmail = optionalText(input.customer.email);
    email = rawEmail ? rawEmail.toLowerCase() : null;
    if (name.length < 2 || name.length > 120) errors["customer.name"] = "Informe seu nome.";
    if (!phone) errors["customer.phone"] = "Telefone inválido. Use DDD + número.";
    if (email && (email.length > 254 || !EMAIL_RE.test(email))) errors["customer.email"] = "E-mail inválido.";
  }

  // Recebimento
  let type: FulfillmentType = "PICKUP";
  let scheduledFor = "";
  let address: AddressInput | undefined;
  if (!isPlainObject(input.fulfillment)) {
    errors.fulfillment = "Escolha retirada ou entrega.";
  } else {
    for (const key of unexpectedKeys(input.fulfillment, FULFILLMENT_KEYS)) errors[`fulfillment.${key}`] = "Campo não permitido.";
    if (input.fulfillment.type === "PICKUP" || input.fulfillment.type === "DELIVERY") {
      type = input.fulfillment.type;
    } else {
      errors["fulfillment.type"] = "Escolha retirada ou entrega.";
    }
    scheduledFor = typeof input.fulfillment.scheduledFor === "string" ? input.fulfillment.scheduledFor : "";
    if (!scheduledFor || Number.isNaN(Date.parse(scheduledFor))) {
      errors["fulfillment.scheduledFor"] = "Escolha um horário.";
    }
    if (type === "DELIVERY") {
      const result = validateAddress(input.fulfillment.address, "fulfillment.address");
      if (result.ok) address = result.value;
      else Object.assign(errors, result.errors);
    } else if (input.fulfillment.address !== undefined && input.fulfillment.address !== null) {
      errors["fulfillment.address"] = "Endereço não se aplica à retirada.";
    }
  }

  // Itens
  const items: OrderItemInput[] = [];
  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.items = "Seu carrinho está vazio.";
  } else if (input.items.length > LIMITS.maxOrderLines) {
    errors.items = "Itens demais no pedido.";
  } else {
    input.items.forEach((raw, index) => {
      if (!isPlainObject(raw)) {
        errors[`items.${index}`] = "Item inválido.";
        return;
      }
      for (const key of unexpectedKeys(raw, ITEM_KEYS)) errors[`items.${index}.${key}`] = "Campo não permitido.";
      if (!isUuid(raw.productId)) errors[`items.${index}.productId`] = "Produto inválido.";
      if (!isSafeInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > LIMITS.maxQuantity) {
        errors[`items.${index}.quantity`] = "Quantidade inválida.";
      }
      if (isUuid(raw.productId) && isSafeInteger(raw.quantity)) {
        items.push({ productId: raw.productId.toLowerCase(), quantity: raw.quantity });
      }
    });
  }

  const paymentMethod = input.paymentMethod;
  if (paymentMethod !== "PIX" && paymentMethod !== "CASH" && paymentMethod !== "CARD") {
    errors.paymentMethod = "Escolha a forma de pagamento.";
  }

  let cashChangeForCents: number | null = null;
  if (input.cashChangeForCents !== undefined && input.cashChangeForCents !== null) {
    if (!isSafeInteger(input.cashChangeForCents) || input.cashChangeForCents <= 0 || input.cashChangeForCents > LIMITS.maxCents) {
      errors.cashChangeForCents = "Valor para troco inválido.";
    } else {
      cashChangeForCents = input.cashChangeForCents;
    }
  }

  const notes = optionalText(input.notes);
  if (notes && notes.length > LIMITS.maxNotes) errors.notes = "Observação muito longa.";

  if (!isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents < 0 || input.expectedTotalCents > LIMITS.maxCents * 10) {
    errors.expectedTotalCents = "Total inválido.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      idempotencyKey,
      customer: { name, phone: phone!, email },
      fulfillment: { type, scheduledFor, ...(address ? { address } : {}) },
      items,
      paymentMethod: paymentMethod as PaymentMethod,
      cashChangeForCents: paymentMethod === "CASH" ? cashChangeForCents : null,
      notes,
      expectedTotalCents: input.expectedTotalCents as number,
    },
  };
}

const QUOTE_KEYS = ["address", "subtotalCents"] as const;

export interface QuoteRequest {
  address: AddressInput;
  subtotalCents: number;
}

export function parseQuoteRequest(input: unknown): ValidationResult<QuoteRequest> {
  if (!isPlainObject(input)) return { ok: false, errors: { body: "Dados inválidos." } };
  const errors: FieldErrors = {};
  for (const key of unexpectedKeys(input, QUOTE_KEYS)) errors[key] = "Campo não permitido.";
  const address = validateAddress(input.address);
  if (!address.ok) Object.assign(errors, address.errors);
  const subtotal = input.subtotalCents ?? 0;
  if (!isSafeInteger(subtotal) || subtotal < 0 || subtotal > LIMITS.maxCents * 10) {
    errors.subtotalCents = "Subtotal inválido.";
  }
  if (Object.keys(errors).length > 0 || !address.ok) return { ok: false, errors };
  return { ok: true, value: { address: address.value, subtotalCents: subtotal as number } };
}

/** Texto do endereço enviado ao provedor de rotas. */
export function addressToRoutingQuery(address: AddressInput): string {
  return `${address.street}, ${address.number} - ${address.neighborhood}, ${address.city} - ${address.state}, ${address.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}, Brasil`;
}
