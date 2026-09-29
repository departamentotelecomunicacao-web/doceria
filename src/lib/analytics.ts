// Camada própria de eventos. Envia para GTM (dataLayer), GA4 (gtag) e Meta
// Pixel somente se configurados e após consentimento. Deduplica eventos
// sensíveis (purchase, order_created) por pedido, inclusive entre recargas.
import { env, hasAnalytics } from "./env";
import { readStorage, writeStorage } from "./storage";

export type AnalyticsEventName =
  | "page_view"
  | "view_item"
  | "add_to_cart"
  | "begin_checkout"
  | "purchase"
  | "order_created";

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  item_category?: string;
}

export interface AnalyticsParams {
  value?: number;
  currency?: "BRL";
  items?: AnalyticsItem[];
  transaction_id?: string;
  page_path?: string;
  [key: string]: unknown;
}

interface TrackOptions {
  /** Evita enviar o mesmo evento duas vezes para a mesma chave (ex.: código do pedido). */
  dedupeKey?: string;
}

type Listener = (event: AnalyticsEventName, params: AnalyticsParams) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    __doceriaEvents?: { event: AnalyticsEventName; params: AnalyticsParams }[];
  }
}

const CONSENT_KEY = "doceria:consent:v1";
const SENT_KEY_PREFIX = "doceria:analytics:sent:";
const sentInMemory = new Set<string>();
const listeners = new Set<Listener>();
let loaded = false;

const META_EVENTS: Partial<Record<AnalyticsEventName, string>> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

export function onAnalyticsEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function centsToValue(cents: number): number {
  return Math.round(cents) / 100;
}

export function track(event: AnalyticsEventName, params: AnalyticsParams = {}, options: TrackOptions = {}): boolean {
  if (options.dedupeKey) {
    const key = `${event}:${options.dedupeKey}`;
    if (sentInMemory.has(key) || readStorage(SENT_KEY_PREFIX + key)) return false;
    sentInMemory.add(key);
    writeStorage(SENT_KEY_PREFIX + key, new Date().toISOString());
  }

  const payload: AnalyticsParams = { currency: params.items || params.value !== undefined ? "BRL" : undefined, ...params };

  if (typeof window !== "undefined") {
    // Registro local (útil para depuração e testes E2E de duplicidade).
    window.__doceriaEvents = window.__doceriaEvents ?? [];
    window.__doceriaEvents.push({ event, params: payload });

    if (loaded) {
      if (window.dataLayer) {
        if (payload.items) window.dataLayer.push({ ecommerce: null });
        window.dataLayer.push({ event, ecommerce: payload.items ? payload : undefined, ...payload });
      }
      if (window.gtag && env.ga4Id && !env.gtmId) window.gtag("event", event, payload);
      const metaEvent = META_EVENTS[event];
      if (window.fbq && metaEvent) {
        window.fbq("track", metaEvent, {
          value: payload.value,
          currency: payload.currency,
          content_ids: payload.items?.map((item) => item.item_id),
          content_type: "product",
        });
      }
    }
  }

  listeners.forEach((listener) => listener(event, payload));
  if (import.meta.env.DEV) console.info("[analytics]", event, payload);
  return true;
}

export function getConsent(): "granted" | "denied" | null {
  const value = readStorage(CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function setConsent(value: "granted" | "denied"): void {
  writeStorage(CONSENT_KEY, value);
  if (value === "granted") loadAnalytics();
}

function injectScript(src: string): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/** Carrega GTM/GA4/Pixel. Só é chamado após consentimento explícito. */
export function loadAnalytics(): void {
  if (loaded || !hasAnalytics || typeof document === "undefined") return;
  loaded = true;
  window.dataLayer = window.dataLayer ?? [];

  if (env.gtmId) {
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    injectScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(env.gtmId)}`);
  } else if (env.ga4Id) {
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(env.ga4Id)}`);
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", env.ga4Id, { send_page_view: false, anonymize_ip: true });
  }

  if (env.metaPixelId) {
    const queue: unknown[][] = [];
    const fbq = (...args: unknown[]) => queue.push(args);
    window.fbq = fbq;
    injectScript("https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", env.metaPixelId);
  }
}

export function initAnalyticsFromConsent(): void {
  if (getConsent() === "granted") loadAnalytics();
}
